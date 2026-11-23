import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const SMOKE_REQUIRED_SECRET = "SUPABASE_SECRET_KEY";

export async function prepareSmokeWorkerConfig(configPath = "dist/server/wrangler.json") {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!Array.isArray(config.secrets?.required)) {
    throw new Error("smoke-worker-config: missing required secrets contract");
  }
  config.secrets.required = [...new Set([...config.secrets.required, SMOKE_REQUIRED_SECRET])].sort();
  await writeFile(configPath, `${JSON.stringify(config)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await prepareSmokeWorkerConfig();
    console.log("Smoke Worker secret contract prepared.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "smoke-worker-config: unknown error");
    process.exitCode = 1;
  }
}
