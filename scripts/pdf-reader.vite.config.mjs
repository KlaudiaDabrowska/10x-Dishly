import { defineConfig } from "vite";
import { URL, fileURLToPath } from "node:url";

// A separate verification artifact, outside Cloudflare's deployed dist/client.
// This proves the browser entry and matching worker bundle without adding a product route.
export default defineConfig({
  envDir: false,
  cacheDir: ".cache/pdf-reader-vite",
  build: {
    outDir: "dist/pdf-reader-inspection",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("../evaluation/validate-pdf-processing/synthetic/reader.html", import.meta.url)),
    },
  },
});
