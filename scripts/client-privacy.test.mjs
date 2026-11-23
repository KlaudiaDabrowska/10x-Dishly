import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkClientPrivacy, CLIENT_PRIVACY_SIGNATURES } from "./check-client-privacy.mjs";

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

  for (const [index, signature] of CLIENT_PRIVACY_SIGNATURES.entries()) {
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

test("client privacy scanner refuses a deployment config that targets another directory", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  await writeFile(current.configPath, JSON.stringify({ assets: { directory: "../../public" } }));

  await assert.rejects(checkClientPrivacy(current.configPath), /deployment-assets-directory: expected \.\.\/client/);
});
