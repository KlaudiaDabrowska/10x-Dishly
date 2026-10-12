// @ts-check
import { fileURLToPath } from "node:url";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const applicationSource = fileURLToPath(new URL("../../src", import.meta.url));

export default defineConfig({
  output: "static",
  integrations: [react()],
  server: {
    host: "127.0.0.1",
    port: 4322,
  },
  vite: {
    resolve: {
      alias: {
        "@": applicationSource,
      },
    },
    plugins: [tailwindcss()],
  },
});
