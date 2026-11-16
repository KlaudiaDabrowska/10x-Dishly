import assert from "node:assert/strict";
import test from "node:test";
import { ClientRequestFailure } from "../src/lib/pdf-processing/client-import.ts";
import { createProductRequestAdapter, runCli, withCleanup } from "./pdf-product-http.mjs";

test("product request adapter injects one lost finalize response and recovers through status", async () => {
  const calls = [];
  const service = {
    createImport: async () => ({ importId: "import-id" }),
    processBatch: async () => ({ candidates: [] }),
  };
  const adapter = createProductRequestAdapter({
    service,
    apiBase: "/api/imports",
    requestHttp: async (path) => {
      calls.push(path);
      return path.endsWith("/finalize") ? { status: "committed" } : { status: "committed", readBack: true };
    },
  });

  await assert.rejects(
    adapter.request("/api/imports/import-id/finalize", { method: "POST", body: "{}" }),
    (error) => error instanceof ClientRequestFailure && error.lost,
  );
  const recovered = await adapter.request("/api/imports/import-id");

  assert.deepEqual(recovered, { status: "committed", readBack: true });
  assert.deepEqual(calls, ["/api/imports/import-id/finalize", "/api/imports/import-id"]);
  assert.deepEqual(adapter.stats, { finalizeCalls: 1, statusCalls: 1, lostResponseInjected: true });
});

test("cleanup runs after a harness failure", async () => {
  let cleaned = false;
  await assert.rejects(
    withCleanup(
      async () => {
        throw new Error("private recipe payload");
      },
      async () => {
        cleaned = true;
      },
    ),
    /private recipe payload/,
  );
  assert.equal(cleaned, true);
});

test("CLI output never includes private failure details", async () => {
  const output = [];
  const exitCode = await runCli(
    async () => {
      throw new Error("200 ml private ingredient; secret-key; provider response");
    },
    (line) => output.push(line),
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(output, ["FAIL  product import finalize/status recovery bridge"]);
  assert.doesNotMatch(output.join("\n"), /200 ml|secret-key|provider response/);
});
