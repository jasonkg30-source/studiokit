import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
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
/** Firestore caps a document at 1 MB; stay below it after escaping. */
export const WORKSPACE_LIMIT = 900_000;
/** Short links keep 2000 rows; the cloud copy does the same when the data is huge. */
const MAX_ROWS = 2000;

export function encodeWorkspace(workspace: Workspace): string {
  return compressToEncodedURIComponent(JSON.stringify(workspace));
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

/** Drops rows and templates in turn until the blob fits a Firestore document. */
export function fitWorkspace(workspace: Workspace): { payload: string; trimmedRows: boolean; trimmedTemplates: boolean } {
  const full = encodeWorkspace(workspace);
  if (full.length <= WORKSPACE_LIMIT) return { payload: full, trimmedRows: false, trimmedTemplates: false };

  const rowCapped = {
    ...workspace,
    source: workspace.source ? { ...workspace.source, rows: workspace.source.rows.slice(0, MAX_ROWS) } : null,
  };
  const capped = encodeWorkspace(rowCapped);
  if (capped.length <= WORKSPACE_LIMIT) return { payload: capped, trimmedRows: true, trimmedTemplates: false };

  const layoutOnly = encodeWorkspace({ ...rowCapped, source: null, templates: [] });
  return { payload: layoutOnly, trimmedRows: true, trimmedTemplates: true };
}

export async function pushWorkspace(payload: string, token: string, uid: string): Promise<void> {
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
  const doc = (await res.json()) as { fields?: { p?: { stringValue?: string } } };
  return doc.fields?.p?.stringValue ?? null;
}
