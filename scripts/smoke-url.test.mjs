import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

const smokeScript = fileURLToPath(new URL("smoke.mjs", import.meta.url));

function startSmoke(baseUrl) {
  return spawnSync(process.execPath, [smokeScript], {
    encoding: "utf8",
    env: { ...process.env, BASE_URL: baseUrl, SUPABASE_DB_URL: "" },
  });
}

test("smoke refuses remote and HTTPS application URLs before requiring database access", () => {
  for (const baseUrl of ["https://example.com", "http://example.com", "https://localhost:4321"]) {
    const result = startSmoke(baseUrl);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to run smoke against a non-local application/);
    assert.doesNotMatch(result.stderr, /SUPABASE_DB_URL is required/);
  }
});

test("smoke accepts local HTTP application hosts before requiring the local database URL", () => {
  for (const baseUrl of ["http://localhost:4321", "http://127.0.0.1:4321"]) {
    const result = startSmoke(baseUrl);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SUPABASE_DB_URL is required/);
    assert.doesNotMatch(result.stderr, /non-local application/);
  }
});
