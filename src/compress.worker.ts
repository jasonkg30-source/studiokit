import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

/**
 * Compressing a 100k-row workspace takes seconds. Doing it here keeps the tab
 * responsive while the cloud copy is written.
 */
self.onmessage = (event: MessageEvent<{ id: number; mode: "compress" | "decompress"; text: string }>) => {
  const { id, mode, text } = event.data;
  try {
    const out = mode === "compress" ? compressToEncodedURIComponent(text) : decompressFromEncodedURIComponent(text);
    (self as unknown as Worker).postMessage({ id, out: out ?? "" });
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: String(error) });
  }
};
