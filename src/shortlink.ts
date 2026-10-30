import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import cfg from "./firebase-config.json";

const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/default/documents/shares`;

const toB64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64Url = (text: string) => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/**
 * Encrypt with AES-GCM in the browser. The key never leaves the page: it is
 * appended to the URL fragment, which browsers do not send to the server.
 */
async function seal(json: string): Promise<{ cipher: string; key: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(compressToEncodedURIComponent(json));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const blob = new Uint8Array(iv.length + sealed.length);
  blob.set(iv);
  blob.set(sealed, iv.length);
  return { cipher: toB64Url(blob), key: toB64Url(raw) };
}

async function open(cipher: string, keyText: string): Promise<unknown> {
  const raw = fromB64Url(keyText);
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const blob = fromB64Url(cipher);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, key, blob.slice(12));
  const text = new TextDecoder().decode(plain);
  const json = decompressFromEncodedURIComponent(text) ?? text;
  return JSON.parse(json);
}

/** Uploads the encrypted dashboard and returns the document id. */
export async function createShare(json: string): Promise<{ id: string; key: string }> {
  const { cipher, key } = await seal(json);
  const res = await fetch(`${BASE}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: { p: { stringValue: cipher }, t: { integerValue: String(Date.now()) } },
    }),
  });
  if (!res.ok) throw new Error(res.status === 413 ? "This dashboard is too large to share as a link." : "Could not create the link.");
  const doc = await res.json();
  const id = String(doc?.name ?? "").split("/").pop();
  if (!id) throw new Error("Could not create the link.");
  return { id, key };
}

export async function readShare(id: string, key: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(cfg.apiKey)}`);
  if (!res.ok) throw new Error(res.status === 404 ? "This link no longer exists." : "Could not open the shared dashboard.");
  const doc = await res.json();
  const cipher = doc?.fields?.p?.stringValue;
  if (!cipher) throw new Error("This link is missing its data.");
  if (!key) throw new Error("This link is missing its key — copy the full link.");
  try {
    return await open(cipher, key);
  } catch {
    throw new Error("This link can't be opened — its key is wrong or incomplete.");
  }
}
