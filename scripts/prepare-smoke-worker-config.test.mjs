import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareSmokeWorkerConfig, SMOKE_REQUIRED_SECRET } from "./prepare-smoke-worker-config.mjs";

test("smoke config requires the admin key without storing its value", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "dishly-smoke-config-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "server", "wrangler.json");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      assets: { directory: "../client" },
      secrets: { required: ["SUPABASE_URL", "SUPABASE_KEY"] },
    }),
  );

  await prepareSmokeWorkerConfig(configPath);
  await prepareSmokeWorkerConfig(configPath);

  const preparedText = await readFile(configPath, "utf8");
  const prepared = JSON.parse(preparedText);
  assert.deepEqual(prepared.secrets.required, ["SUPABASE_KEY", SMOKE_REQUIRED_SECRET, "SUPABASE_URL"]);
  assert.equal(prepared.assets.directory, "../client");
  assert.equal(preparedText.includes("sb_secret_"), false);
});

test("smoke config refuses an artifact without a required-secrets contract", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "dishly-smoke-config-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "wrangler.json");
  await writeFile(configPath, JSON.stringify({ assets: { directory: "../client" } }));

  await assert.rejects(prepareSmokeWorkerConfig(configPath), /smoke-worker-config: missing required secrets contract/);
});
