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
