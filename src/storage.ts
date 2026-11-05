import { compressToUTF16, decompressFromUTF16 } from "lz-string";

const PREFIX = "lz1:";

export class QuotaError extends Error {
  constructor(message = "Browser storage is full") {
    super(message);
    this.name = "QuotaError";
  }
}

function isQuota(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22)
  );
}

/** Reads a value written by writeJSON, and still understands the older plain-JSON format. */
export function readJSON<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    if (raw.startsWith(PREFIX)) {
      const text = decompressFromUTF16(raw.slice(PREFIX.length));
      return text ? (JSON.parse(text) as T) : null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Compressed write — JSON shrinks ~60-70%, which keeps big imports inside the 5 MB quota. */
export function writeJSON(key: string, value: unknown): void {
  const payload = PREFIX + compressToUTF16(JSON.stringify(value));
  try {
    localStorage.setItem(key, payload);
  } catch (e) {
    throw isQuota(e) ? new QuotaError() : e;
  }
}

export function rawBytes(key: string): number {
  try {
    return new Blob([localStorage.getItem(key) ?? ""]).size;
  } catch {
    return 0;
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Rows live in IndexedDB. A 100k-row source is ~15 MB of JSON: too big for the
 * 5 MB localStorage quota and far too slow to compress on every load.
 */
const DB_NAME = "studiokit";
const DB_STORE = "kv";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) throw new QuotaError("This browser can't store large data");
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new QuotaError());
      tx.onabort = () => reject(tx.error ?? new QuotaError());
    });
  } finally {
    db.close();
  }
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}
