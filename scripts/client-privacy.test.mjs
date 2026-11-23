import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { checkClientPrivacy, CLIENT_PRIVACY_SIGNATURES } from "./check-client-privacy.mjs";

const EXPECTED_SIGNATURES = [
  { category: "secret-canary", value: "CLIENT_SECRET_CANARY_" },
  { category: "pdf-content-canary", value: "PRIVATE_PDF_CONTENT_CANARY_" },
  { category: "private-payload-canary", value: "PRIVATE_PAYLOAD_CANARY_" },
  { category: "private-variable-name", value: "OPENAI_API_KEY" },
  { category: "private-variable-name", value: "SUPABASE_SECRET_KEY" },
  { category: "private-variable-name", value: "DEPLOY_PROBE_TOKEN" },
  { category: "private-variable-name", value: "PDF_IMPORT_ENABLED" },
  { category: "private-variable-name", value: "PDF_VALIDATION_ENABLED" },
  { category: "private-variable-name", value: "PDF_VALIDATION_EVALUATOR_IDS" },
];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "dishly-client-privacy-"));
  const server = path.join(root, "dist", "server");
  const client = path.join(root, "dist", "client");
  await mkdir(path.join(client, "assets"), { recursive: true });
  await mkdir(server, { recursive: true });
  const configPath = path.join(server, "wrangler.json");
  await writeFile(configPath, JSON.stringify({ assets: { directory: "../client" } }));
  return { root, client, configPath };
}

test("client privacy scanner accepts a clean recursive byte fixture", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  await writeFile(path.join(current.client, "index.html"), "<main>Dishly</main>");
  await writeFile(path.join(current.client, "assets", "binary.dat"), Buffer.from([0, 1, 2, 255]));

  await checkClientPrivacy(current.configPath);
});

test("client privacy scanner rejects every forbidden category without echoing its value", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  const leakPath = path.join(current.client, "assets", "leak.js");

  assert.deepEqual(CLIENT_PRIVACY_SIGNATURES, EXPECTED_SIGNATURES);
  for (const [index, signature] of EXPECTED_SIGNATURES.entries()) {
    const planted = `${signature.value}${index}_DO_NOT_PRINT`;
    await writeFile(leakPath, `prefix:${planted}:suffix`);
    await assert.rejects(
      checkClientPrivacy(current.configPath),
      (error) =>
        error instanceof Error &&
        error.message === `${signature.category}: client/assets/leak.js` &&
        !error.message.includes(planted),
    );
  }
});

test("client privacy scanner CLI uses the deployed paths and reports only safe diagnostics", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  const executable = fileURLToPath(new URL("./check-client-privacy.mjs", import.meta.url));
  await writeFile(path.join(current.client, "index.html"), "<main>Dishly</main>");

  const clean = spawnSync(process.execPath, [executable], { cwd: current.root, encoding: "utf8" });
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, "Client privacy check passed for 1 public asset(s).\n");
  assert.equal(clean.stderr, "");

  const sentinel = "CLIENT_SECRET_CANARY_DO_NOT_PRINT";
  await writeFile(path.join(current.client, "index.html"), sentinel);
  const leaked = spawnSync(process.execPath, [executable], { cwd: current.root, encoding: "utf8" });
  assert.equal(leaked.status, 1);
  assert.equal(leaked.stdout, "");
  assert.equal(leaked.stderr, "Client privacy check failed: secret-canary: client/index.html\n");
  assert.doesNotMatch(leaked.stderr, new RegExp(sentinel));
});

test("client privacy scanner refuses a deployment config that targets another directory", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  await writeFile(current.configPath, JSON.stringify({ assets: { directory: "../../public" } }));

  await assert.rejects(checkClientPrivacy(current.configPath), /deployment-assets-directory: expected \.\.\/client/);

  await writeFile(current.configPath, JSON.stringify({}));
  await assert.rejects(
    checkClientPrivacy(current.configPath),
    (error) => error instanceof Error && error.message === "deployment-assets-directory: expected ../client",
  );
});

test("client privacy scanner reports the first leak in deterministic path order", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  await writeFile(path.join(current.client, "z-last.js"), "CLIENT_SECRET_CANARY_Z");
  await writeFile(path.join(current.client, "a-first.js"), "CLIENT_SECRET_CANARY_A");

  await assert.rejects(
    checkClientPrivacy(current.configPath),
    (error) => error instanceof Error && error.message === "secret-canary: client/a-first.js",
  );
});
