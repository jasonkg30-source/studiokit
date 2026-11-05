import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

/**
 * Off-main-thread lz-string. A 100k-row workspace is ~15 MB of JSON, which takes
 * seconds to compress; on the main thread that is a frozen tab.
 */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./compress.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; out?: string; error?: string }>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.error) job.reject(new Error(event.data.error));
      else job.resolve(event.data.out ?? "");
    };
    worker.onerror = () => {
      pending.forEach((job) => job.reject(new Error("compression failed")));
      pending.clear();
      worker = null;
    };
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

function run(mode: "compress" | "decompress", text: string): Promise<string> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(
      mode === "compress" ? compressToEncodedURIComponent(text) : decompressFromEncodedURIComponent(text) ?? "",
    );
  }
  const id = (seq += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, mode, text });
  });
}

export const compressAsync = (text: string) => run("compress", text);
export const decompressAsync = (text: string) => run("decompress", text);
