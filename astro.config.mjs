// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  session: false,
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare({ imageService: { build: "compile", runtime: "passthrough" } }),
  env: {
    schema: {
      DEPLOYMENT_ENV: envField.string({ context: "server", access: "secret", optional: true }),
      DEPLOY_PROBE_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      PDF_VALIDATION_ENABLED: envField.string({ context: "server", access: "secret", optional: true }),
      PDF_VALIDATION_EVALUATOR_IDS: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
