import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CLIENT_PRIVACY_SIGNATURES = Object.freeze([
  { category: "secret-canary", value: "CLIENT_SECRET_CANARY_" },
  { category: "pdf-content-canary", value: "PRIVATE_PDF_CONTENT_CANARY_" },
  { category: "private-payload-canary", value: "PRIVATE_PAYLOAD_CANARY_" },
  { category: "private-variable-name", value: "OPENAI_API_KEY" },
  { category: "private-variable-name", value: "SUPABASE_SECRET_KEY" },
  { category: "private-variable-name", value: "DEPLOY_PROBE_TOKEN" },
  { category: "private-variable-name", value: "PDF_IMPORT_ENABLED" },
  { category: "private-variable-name", value: "PDF_VALIDATION_ENABLED" },
  { category: "private-variable-name", value: "PDF_VALIDATION_EVALUATOR_IDS" },
]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(candidate)));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}

export async function checkClientPrivacy(configPath = "dist/server/wrangler.json") {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config.assets?.directory !== "../client") {
    throw new Error("deployment-assets-directory: expected ../client");
  }

  const assetRoot = path.resolve(path.dirname(configPath), config.assets.directory);
  const files = await filesUnder(assetRoot);
  for (const file of files) {
    const bytes = await readFile(file);
    for (const signature of CLIENT_PRIVACY_SIGNATURES) {
      if (!bytes.includes(Buffer.from(signature.value))) continue;
      const relativePath = path.posix.join(
        path.basename(assetRoot),
        path.relative(assetRoot, file).split(path.sep).join(path.posix.sep),
      );
      throw new Error(`${signature.category}: ${relativePath}`);
    }
  }

  console.log(`Client privacy check passed for ${files.length} public asset(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkClientPrivacy();
  } catch (error) {
    console.error(`Client privacy check failed: ${error instanceof Error ? error.message : "unknown-error"}`);
    process.exitCode = 1;
  }
}
