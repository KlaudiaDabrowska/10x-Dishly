import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  importCreationAvailable,
  importDatabaseAvailable,
  importErrorHttpStatus,
  importInfrastructureAvailable,
  importMutationIsSameOrigin,
  importOperationAvailable,
  importUserAuthorized,
  isImportResourceId,
  readBoundedImportJson,
} from "../src/lib/pdf-import-access.ts";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";

const configured = {
  deploymentEnv: "production",
  openAiApiKey: "key",
  productEnabled: "true",
  validationEnabled: "true",
  supabaseUrl: "https://example.test",
  supabaseSecretKey: "secret",
};

test("product import is fail-closed and unavailable in preview", () => {
  assert.equal(importCreationAvailable(configured, "product"), true);
  for (const config of [
    { ...configured, productEnabled: undefined },
    { ...configured, productEnabled: "TRUE" },
    { ...configured, deploymentEnv: "preview" },
    { ...configured, openAiApiKey: "" },
    { ...configured, supabaseSecretKey: undefined },
  ])
    assert.equal(importCreationAvailable(config, "product"), false);
});

test("an existing import can use configured infrastructure after its channel switch is disabled", () => {
  assert.equal(importInfrastructureAvailable({ ...configured, productEnabled: "false" }), true);
  assert.equal(importInfrastructureAvailable({ ...configured, validationEnabled: "false" }), true);
});

test("database-only operations remain available without an OpenAI credential", () => {
  const withoutProvider = { ...configured, openAiApiKey: undefined };
  assert.equal(importDatabaseAvailable(withoutProvider), true);
  assert.equal(importInfrastructureAvailable(withoutProvider), false);
  for (const operation of ["status", "cancel", "finalize", "resolve"])
    assert.equal(importOperationAvailable(withoutProvider, "product", operation), true);
  for (const operation of ["create", "batch"])
    assert.equal(importOperationAvailable(withoutProvider, "product", operation), false);
  for (const operation of ["create", "batch", "status", "cancel", "finalize", "resolve"])
    assert.equal(
      importOperationAvailable({ ...withoutProvider, deploymentEnv: "preview" }, "product", operation),
      false,
    );
});

test("decision guards validate both UUID path resources and same-origin mutations", () => {
  assert.equal(isImportResourceId(undefined), true);
  assert.equal(isImportResourceId("00000000-0000-4000-8000-000000000001"), true);
  for (const value of ["", "not-a-uuid", "00000000-0000-0000-0000-000000000001"])
    assert.equal(isImportResourceId(value), false);
  const url = new URL("https://dishly.test/api/imports/id/decisions/id");
  assert.equal(
    importMutationIsSameOrigin(
      new Request(url, { method: "POST", headers: { origin: url.origin, "sec-fetch-site": "same-origin" } }),
      url,
    ),
    true,
  );
  assert.equal(
    importMutationIsSameOrigin(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://attacker.test", "sec-fetch-site": "cross-site" },
      }),
      url,
    ),
    false,
  );
});

test("decision bodies are bounded and decision conflicts have sanitized client statuses", async () => {
  const valid = new Request("https://dishly.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "discard" }),
  });
  assert.deepEqual(await readBoundedImportJson(valid, PDF_LIMITS.maxDecisionBodyBytes), { action: "discard" });
  const oversized = new Request("https://dishly.test", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(PDF_LIMITS.maxDecisionBodyBytes + 1) },
    body: "{}",
  });
  await assert.rejects(readBoundedImportJson(oversized, PDF_LIMITS.maxDecisionBodyBytes), {
    code: "request-too-large",
  });
  assert.equal(importErrorHttpStatus("decision-conflict"), 409);
  assert.equal(importErrorHttpStatus("decision-payload-mismatch"), 409);
  assert.equal(importErrorHttpStatus("private database message"), 500);
});

test("product accepts every authenticated user while evaluation preserves its allowlist", () => {
  const evaluators = new Set(["evaluator"]);
  assert.equal(importUserAuthorized("product", "ordinary-user", evaluators), true);
  assert.equal(importUserAuthorized("evaluation", "ordinary-user", evaluators), false);
  assert.equal(importUserAuthorized("evaluation", "EVALUATOR", evaluators), true);
  assert.equal(importUserAuthorized("product", undefined, evaluators), false);
});
