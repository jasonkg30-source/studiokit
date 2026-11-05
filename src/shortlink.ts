import { compressAsync, decompressAsync } from "./compress";
import cfg from "./firebase-config.json";

const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/default/documents/shares`;
const ITERATIONS = 310000;
/** Firestore allows 1 MB per document; parts stay well under it. */
const PART_SIZE = 700_000;

export class PasswordRequired extends Error {
  constructor(public shareId: string) {
    super("This dashboard is password protected.");
    this.name = "PasswordRequired";
  }
}

const toB64Url = (bytes: Uint8Array) => {
  // Chunked: a 2 MB ciphertext built one char at a time takes seconds.
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

/** In-app browsers (Instagram, some KakaoTalk builds) expose no WebCrypto and would fail silently. */
function requireCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Open this link in Safari or Chrome — this in-app browser can't decrypt shared dashboards.");
  }
  return globalThis.crypto.subtle;
}

async function randomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** PBKDF2 so a short team password is not cheap to brute force from the stored blob. */
async function passwordKey(password: string, salt: BufferSource, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function sealWith(json: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const compressed = await compressAsync(json);
  const plain = new TextEncoder().encode(compressed);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const blob = new Uint8Array(iv.length + sealed.length);
  blob.set(iv);
  blob.set(sealed, iv.length);
  return toB64Url(blob);
}

async function openWith(cipher: string, key: CryptoKey): Promise<unknown> {
  const subtle = requireCrypto();
  const blob = fromB64Url(cipher);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, key, blob.slice(12));
  const text = new TextDecoder().decode(plain);
  const json = await decompressAsync(text);
  return JSON.parse(json || text);
}

type ShareDoc = {
  id: string;
  cipher: string;
  salt?: string;
  iterations?: number;
  password: boolean;
};

const cache = new Map<string, ShareDoc>();

async function readParts(id: string, count: number): Promise<string> {
  const parts = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const res = await fetch(
        `${BASE}/${encodeURIComponent(id)}/parts/${index}?key=${encodeURIComponent(cfg.apiKey)}`,
      );
      if (!res.ok) throw new Error("Could not open the shared dashboard.");
      const body = await res.json();
      return String(body?.fields?.p?.stringValue ?? "");
    }),
  );
  return parts.join("");
}

async function loadDoc(id: string): Promise<ShareDoc> {
  const hit = cache.get(id);
  if (hit) return hit;
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(cfg.apiKey)}`);
  if (!res.ok) {
    // 403 here means the security rules refused it: expired or deleted by its owner.
    if (res.status === 404 || res.status === 403) throw new Error("This link has ended — ask the owner for a new one.");
    throw new Error("Could not open the shared dashboard.");
  }
  const doc = await res.json();
  const fields = doc?.fields ?? {};
  let cipher: string | undefined = fields?.p?.stringValue;
  const count = Number(fields?.n?.integerValue ?? 0);
  if (!cipher && count > 0) cipher = await readParts(id, count);
  if (!cipher) throw new Error("This link is missing its data.");
  const parsed: ShareDoc = {
    id,
    cipher,
    salt: fields?.s?.stringValue,
    iterations: fields?.i?.integerValue ? Number(fields.i.integerValue) : undefined,
    password: fields?.m?.stringValue === "pw",
  };
  cache.set(id, parsed);
  return parsed;
}

/** Everything the "My links" screen needs; no ciphertext, no key. */
export type ShareSummary = {
  id: string;
  title: string;
  createdAt: number;
  /** Epoch millis, or null for "no expiry". */
  expiresAt: number | null;
  password: boolean;
  parts: number;
};

type FieldValue = { stringValue?: string; integerValue?: string };

/** The ID token is signed by Firebase; the rules verify it, we only read the uid. */
export function uidFromToken(idToken: string): string {
  try {
    const part = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return String(payload.user_id ?? payload.sub ?? "");
  } catch {
    return "";
  }
}

// The URL fragment holds the key, so it can never be rebuilt from the server.
// Copying a link again is only possible on the browser that created it.
const LINKS_KEY = "studiokit.share.links";

export function rememberLink(id: string, url: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, string>;
    all[id] = url;
    localStorage.setItem(LINKS_KEY, JSON.stringify(all));
  } catch {
    // Private mode or a full quota: the link simply can't be re-copied here.
  }
}

export function rememberedLink(id: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, string>;
    return all[id] ?? null;
  } catch {
    return null;
  }
}

function forgetLink(id: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, string>;
    delete all[id];
    localStorage.setItem(LINKS_KEY, JSON.stringify(all));
  } catch {
    /* nothing to clean up */
  }
}

/**
 * Creates an encrypted share. With a password the link carries no key at all:
 * the key is derived from the password with PBKDF2 and a per-share salt.
 * The key is returned only for password-less links.
 */
export async function createShare(
  json: string,
  password?: string,
  idToken?: string | null,
  meta?: { title?: string; expiresAt?: number | null },
): Promise<{ id: string; key?: string }> {
  if (!idToken) throw new Error("Sign in to create a short link.");
  const owner = uidFromToken(idToken);
  if (!owner) throw new Error("Your session expired — sign in again to create a link.");
  const trimmed = password?.trim();
  let fields: Record<string, FieldValue>;
  let exported: string | undefined;

  let cipher: string;
  if (trimmed) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await passwordKey(trimmed, salt, ITERATIONS);
    cipher = await sealWith(json, key);
    fields = {
      t: { integerValue: String(Date.now()) },
      m: { stringValue: "pw" },
      s: { stringValue: toB64Url(salt) },
      i: { integerValue: String(ITERATIONS) },
    };
  } else {
    const key = await randomKey();
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    exported = toB64Url(raw);
    cipher = await sealWith(json, key);
    fields = { t: { integerValue: String(Date.now()) } };
  }

  // Ownership is stored so the creator can list, rename, expire and delete the
  // link later; nothing about it helps a recipient.
  fields.o = { stringValue: owner };
  const title = meta?.title?.trim();
  if (title) fields.l = { stringValue: title.slice(0, 80) };
  if (meta?.expiresAt) fields.e = { integerValue: String(meta.expiresAt) };

  // A 100k-row dashboard encrypts to a couple of megabytes, so the payload is
  // spread over part documents and the manifest only carries the count.
  const parts: string[] = [];
  for (let i = 0; i < cipher.length; i += PART_SIZE) parts.push(cipher.slice(i, i + PART_SIZE));
  if (parts.length === 1) fields.p = { stringValue: cipher };
  else fields.n = { integerValue: String(parts.length) };

  const res = await fetch(`${BASE}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Your session expired — sign in again to create a link.");
  if (!res.ok) throw new Error(res.status === 413 ? "This dashboard is too large to share as a link." : "Could not create the link.");
  const doc = await res.json();
  const id = String(doc?.name ?? "").split("/").pop();
  if (!id) throw new Error("Could not create the link.");

  if (parts.length > 1) {
    await Promise.all(
      parts.map(async (part, index) => {
        const put = await fetch(`${BASE}/${encodeURIComponent(id)}/parts/${index}?key=${encodeURIComponent(cfg.apiKey)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ fields: { p: { stringValue: part } } }),
        });
        if (!put.ok) throw new Error("Could not upload every part of the link.");
      }),
    );
  }
  return { id, key: exported };
}

/** Opens a share; throws PasswordRequired when the link needs a team password. */
export async function readShare(id: string, keyText?: string): Promise<unknown> {
  const doc = await loadDoc(id);
  if (doc.password) throw new PasswordRequired(id);
  if (!keyText) throw new Error("This link is missing its key — copy the full link.");
  try {
    const raw = fromB64Url(keyText);
    const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
    return await openWith(doc.cipher, key);
  } catch {
    throw new Error("This link can't be opened — its key is wrong or incomplete.");
  }
}

export async function readShareWithPassword(id: string, password: string): Promise<unknown> {
  const doc = await loadDoc(id);
  if (!doc.salt) throw new Error("This link has no password set.");
  const key = await passwordKey(password, fromB64Url(doc.salt), doc.iterations ?? ITERATIONS);
  try {
    return await openWith(doc.cipher, key);
  } catch {
    throw new Error("Wrong password.");
  }
}

const ROOT = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/default/documents`;

type DocFields = Record<string, FieldValue & { timerValue?: unknown }>;

const authHeaders = (idToken: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${idToken}`,
});

/**
 * Links created before ownership was recorded have no `o` field and can never be
 * matched to an account, so they simply don't show up here.
 */
export async function listShares(idToken: string): Promise<ShareSummary[]> {
  const owner = uidFromToken(idToken);
  if (!owner) throw new Error("Your session expired — sign in again.");
  const res = await fetch(`${ROOT}:runQuery?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "shares" }],
        // The rules only allow a list query that filters on the caller's own uid.
        where: { fieldFilter: { field: { fieldPath: "o" }, op: "EQUAL", value: { stringValue: owner } } },
        limit: 100,
      },
    }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Your session expired — sign in again.");
  if (!res.ok) throw new Error("Could not load your links.");
  const rows = (await res.json()) as Array<{ document?: { name?: string; fields?: DocFields } }>;
  return rows
    .map((row) => row.document)
    .filter((doc): doc is { name: string; fields?: DocFields } => Boolean(doc?.name))
    .map((doc) => {
      const fields = doc.fields ?? {};
      const expires = fields.e?.integerValue ? Number(fields.e.integerValue) : null;
      return {
        id: String(doc.name).split("/").pop() ?? "",
        title: fields.l?.stringValue ?? "",
        createdAt: Number(fields.t?.integerValue ?? 0),
        expiresAt: expires,
        password: fields.m?.stringValue === "pw",
        parts: Number(fields.n?.integerValue ?? 0),
      };
    })
    .filter((share) => share.id)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Same link id, new label and/or expiry. `null` removes the expiry. */
export async function updateShare(
  id: string,
  idToken: string,
  patch: { title?: string; expiresAt?: number | null },
): Promise<void> {
  const mask: string[] = [];
  const fields: Record<string, FieldValue> = {};
  if (patch.title !== undefined) {
    mask.push("l");
    // An empty title clears the field instead of storing a blank one.
    const title = patch.title.trim().slice(0, 80);
    if (title) fields.l = { stringValue: title };
  }
  if (patch.expiresAt !== undefined) {
    mask.push("e");
    if (patch.expiresAt !== null) fields.e = { integerValue: String(patch.expiresAt) };
  }
  if (!mask.length) return;
  const query = mask.map((field) => `updateMask.fieldPaths=${field}`).join("&");
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(cfg.apiKey)}&${query}`, {
    method: "PATCH",
    headers: authHeaders(idToken),
    body: JSON.stringify({ fields }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Only the owner can change this link.");
  if (!res.ok) throw new Error("Could not update the link.");
}

/**
 * Deletes the parts first: losing the manifest would strand megabytes of
 * ciphertext that nothing can ever reach again.
 */
export async function deleteShare(id: string, idToken: string): Promise<void> {
  const head = await fetch(`${BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(cfg.apiKey)}`, {
    headers: authHeaders(idToken),
  });
  if (!head.ok && head.status !== 404) throw new Error("Could not find the link to delete.");
  const count = head.ok ? Number(((await head.json())?.fields?.n?.integerValue as string) ?? 0) : 0;

  if (count > 0) {
    const parts = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        fetch(`${BASE}/${encodeURIComponent(id)}/parts/${index}?key=${encodeURIComponent(cfg.apiKey)}`, {
          method: "DELETE",
          headers: authHeaders(idToken),
        }),
      ),
    );
    if (parts.some((res) => !res.ok && res.status !== 404)) throw new Error("Could not delete every part of the link.");
  }

  const res = await fetch(`${BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  if (!res.ok && res.status !== 404) throw new Error("Could not delete the link.");
  cache.delete(id);
  forgetLink(id);
}
