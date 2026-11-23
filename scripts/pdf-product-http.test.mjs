import assert from "node:assert/strict";
import test from "node:test";
import {
  inputTokenAccountingDiagnostic,
  sanitizedPdfErrorBody,
} from "../src/lib/pdf-processing/accounting-diagnostic.ts";
import { ClientRequestFailure } from "../src/lib/pdf-processing/client-import.ts";
import { OPENAI_MODEL, OpenAiPdfError } from "../src/lib/pdf-processing/openai.ts";
import { createProductRequestAdapter, runCli, withCleanup } from "./pdf-product-http.mjs";

test("accounting mismatch exposes only a public correlation id and an allowlisted private event", () => {
  const diagnosticId = "00000000-0000-4000-8000-000000000030";
  const evidence = {
    version: 1,
    diagnosticId,
    mismatchKind: "count-vs-usage",
    batchIndex: 0,
    attempt: 1,
    reservationId: "00000000-0000-4000-8000-000000000021",
    api: "responses-v1",
    requestedModel: OPENAI_MODEL,
    returnedModel: "gpt-5.4-mini-2026-03-17",
    responseId: "resp_test",
    countedInputTokens: 123,
    reportedInputTokens: 124,
    deltaInputTokens: 1,
    cachedInputTokensStatus: "valid",
    cachedInputTokens: 7,
  };
  const error = new OpenAiPdfError("input-token-accounting-mismatch", undefined, evidence);
  error.cause = {
    filename: "private.pdf",
    input: "200 ml private ingredient",
    prompt: "private prompt",
    schema: "private schema",
    response: "private provider body",
    output: "private recipe output",
    ownerId: "private owner",
    authorization: "secret-key",
  };

  const diagnostic = inputTokenAccountingDiagnostic(error);
  assert.deepEqual(Object.keys(diagnostic.publicBody).sort(), ["diagnosticId", "error"]);
  assert.deepEqual(diagnostic.publicBody, { error: "input-token-accounting-mismatch", diagnosticId });
  assert.deepEqual(Object.keys(diagnostic.privateEvent).sort(), [
    "api",
    "attempt",
    "batchIndex",
    "cachedInputTokens",
    "cachedInputTokensStatus",
    "countedInputTokens",
    "deltaInputTokens",
    "diagnosticId",
    "event",
    "mismatchKind",
    "reportedInputTokens",
    "requestedModel",
    "reservationId",
    "responseId",
    "returnedModel",
    "version",
  ]);
  assert.equal(diagnostic.privateEvent.diagnosticId, diagnostic.publicBody.diagnosticId);
  assert.doesNotMatch(
    JSON.stringify(diagnostic),
    /private\.pdf|200 ml|private prompt|private schema|provider body|recipe output|private owner|secret-key/u,
  );
});

test("non-mismatch errors retain the existing public body and have no private accounting event", () => {
  const error = new OpenAiPdfError("provider-server-error");
  assert.equal(inputTokenAccountingDiagnostic(error), null);
  assert.deepEqual(sanitizedPdfErrorBody(error, error.code), { error: "provider-server-error" });
});

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
