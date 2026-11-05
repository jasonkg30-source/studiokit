import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Stamped into the bundle and written next to it, so an open tab can tell that a
// newer build has been deployed without reloading the page itself.
const BUILD_ID = Date.now().toString(36);

const BUILD_ID_MODULE = "virtual:build-id";
const BUILD_ID_RESOLVED = "\0" + BUILD_ID_MODULE;

export default defineConfig({
  plugins: [
    react(),
    {
      // One id, three places: the running bundle, version.json on the server, and
      // the check in the app that compares them.
      name: "build-id",
      resolveId(id) {
        if (id === BUILD_ID_MODULE) return BUILD_ID_RESOLVED;
        return null;
      },
      load(id) {
        if (id === BUILD_ID_RESOLVED) return `export default ${JSON.stringify(BUILD_ID)};`;
        return null;
      },
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) });
      },
    },
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
