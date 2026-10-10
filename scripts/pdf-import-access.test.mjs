import assert from "node:assert/strict";
import test from "node:test";
import {
  importCreationAvailable,
  importInfrastructureAvailable,
  importUserAuthorized,
} from "../src/lib/pdf-import-access.ts";

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

test("product accepts every authenticated user while evaluation preserves its allowlist", () => {
  const evaluators = new Set(["evaluator"]);
  assert.equal(importUserAuthorized("product", "ordinary-user", evaluators), true);
  assert.equal(importUserAuthorized("evaluation", "ordinary-user", evaluators), false);
  assert.equal(importUserAuthorized("evaluation", "EVALUATOR", evaluators), true);
  assert.equal(importUserAuthorized("product", undefined, evaluators), false);
});
