import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { compressAsync, decompressAsync } from "./compress";
import cfg from "./firebase-config.json";
import type { DataSource, Report } from "./types";
import type { SavedTemplate } from "./templates";

/**
 * One dashboard workspace per account. The whole thing (layout, rows, saved
 * templates) travels as one compressed blob so another machine can pick up
 * exactly where the first one stopped.
 */
export interface Workspace {
  report: Report;
  source: DataSource | null;
  templates: SavedTemplate[];
  savedAt: number;
}

const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/default/documents/dashboards`;
/**
 * Firestore caps a document at 1 MB, so the blob is split across part documents.
 * A 100k-row workspace is roughly 700 KB compressed: two parts, nothing lost.
 */
export const PART_SIZE = 700_000;
/** Past this the browser copy is the complete one and the cloud copy is trimmed. */
const MAX_BLOB = 8_000_000;
const MAX_ROWS = 100_000;

export function encodeWorkspace(workspace: Workspace): string {
  return compressToEncodedURIComponent(JSON.stringify(workspace));
}

/** Same blob, compressed off the main thread once it is big enough to matter. */
export async function encodeWorkspaceAsync(workspace: Workspace): Promise<string> {
  const json = JSON.stringify(workspace);
  if (json.length < 200_000) return compressToEncodedURIComponent(json);
  return compressAsync(json);
}

export async function decodeWorkspaceAsync(payload: string): Promise<Workspace | null> {
  try {
    const text = await decompressAsync(payload);
    const parsed = text ? (JSON.parse(text) as Workspace) : null;
    return parsed?.report?.pages?.length ? parsed : null;
  } catch {
    return null;
  }
}

export function decodeWorkspace(payload: string): Workspace | null {
  try {
    const text = decompressFromEncodedURIComponent(payload);
    if (!text) return null;
    const parsed = JSON.parse(text) as Workspace;
    return parsed?.report?.pages?.length ? parsed : null;
  } catch {
    return null;
  }
}

/** A 100k-row workspace is a couple of parts, so nothing is lost in the normal case. */
export async function fitWorkspace(
  workspace: Workspace,
): Promise<{ payload: string; trimmedRows: boolean; trimmedTemplates: boolean }> {
  const full = await encodeWorkspaceAsync(workspace);
  if (full.length <= MAX_BLOB) return { payload: full, trimmedRows: false, trimmedTemplates: false };

  const rowCapped = {
    ...workspace,
    source: workspace.source ? { ...workspace.source, rows: workspace.source.rows.slice(0, MAX_ROWS) } : null,
  };
  const capped = await encodeWorkspaceAsync(rowCapped);
  if (capped.length <= MAX_BLOB) return { payload: capped, trimmedRows: true, trimmedTemplates: false };

  const layoutOnly = await encodeWorkspaceAsync({ ...rowCapped, source: null, templates: [] });
  return { payload: layoutOnly, trimmedRows: true, trimmedTemplates: true };
}

export function splitPayload(payload: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < payload.length; i += PART_SIZE) parts.push(payload.slice(i, i + PART_SIZE));
  return parts.length ? parts : [""];
}

async function writePart(uid: string, index: number, payload: string, token: string): Promise<void> {
  const res = await fetch(`${BASE}/${uid}/parts/${index}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: { p: { stringValue: payload } } }),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "sync-unauthorized" : "sync-failed");
}

/** Writes every part, then the manifest — a reader never sees a count without data. */
async function pushParts(parts: string[], token: string, uid: string): Promise<void> {
  await Promise.all(parts.map((payload, index) => writePart(uid, index, payload, token)));
  const res = await fetch(`${BASE}/${uid}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields: {
        n: { integerValue: String(parts.length) },
        u: { integerValue: String(Date.now()) },
        p: { stringValue: "" },
      },
    }),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "sync-unauthorized" : "sync-failed");
}

export async function pushWorkspace(payload: string, token: string, uid: string): Promise<void> {
  const parts = splitPayload(payload);
  if (parts.length > 1) {
    await pushParts(parts, token, uid);
    return;
  }
  const res = await fetch(`${BASE}/${uid}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields: {
        p: { stringValue: payload },
        u: { integerValue: String(Date.now()) },
      },
    }),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "sync-unauthorized" : "sync-failed");
}

/** Returns null when this account has nothing stored yet. */
export async function pullWorkspace(token: string, uid: string): Promise<string | null> {
  const res = await fetch(`${BASE}/${uid}?key=${encodeURIComponent(cfg.apiKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("sync-failed");
  const doc = (await res.json()) as { fields?: Record<string, { stringValue?: string; integerValue?: string }> };
  // Copies written before the split stored the whole blob in the manifest.
  const inline = doc.fields?.p?.stringValue;
  if (inline) return inline;

  const count = Number(doc.fields?.n?.integerValue ?? 0);
  if (!count) return null;

  const parts = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const part = await fetch(`${BASE}/${uid}/parts/${index}?key=${encodeURIComponent(cfg.apiKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!part.ok) throw new Error("sync-failed");
      const body = (await part.json()) as { fields?: { p?: { stringValue?: string } } };
      return body.fields?.p?.stringValue ?? "";
    }),
  );
  return parts.join("");
}
