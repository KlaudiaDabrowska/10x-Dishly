import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { checkConfig, checkConsumerConfig, requiredSecrets } from "./check-deploy-config.mjs";

function config(target = "preview") {
  return {
    name: target === "preview" ? "dishly-web-preview" : "dishly-web",
    vars: { DEPLOYMENT_ENV: target },
    secrets: { required: target === "preview" ? [] : [...requiredSecrets] },
    assets: { binding: "ASSETS" },
    r2_buckets:
      target === "preview" ? [] : [{ binding: "PDF_BUCKET", bucket_name: "dishly-pdf-imports-eu", jurisdiction: "eu" }],
    queues: { producers: target === "preview" ? [] : [{ binding: "PDF_IMPORT_QUEUE", queue: "dishly-pdf-imports" }] },
  };
}
test("accepts expected production and isolated preview configs", () => {
  for (const target of ["production", "preview"]) checkConfig(config(target), target);
});
test("rejects preview production resources, secrets, and environment mismatch", () => {
  for (const mutate of [
    (c) => {
      c.r2_buckets = config("production").r2_buckets;
    },
    (c) => {
      c.secrets.required = requiredSecrets;
    },
    (c) => {
      c.vars.SUPABASE_URL = "https://example.test";
    },
    (c) => {
      c.queues = config("production").queues;
    },
    (c) => {
      c.name = "dishly-web";
    },
  ]) {
    const c = config();
    mutate(c);
    assert.throws(() => checkConfig(c, "preview"));
  }
});
test("rejects automatic bindings and missing production contracts", () => {
  for (const mutate of [
    (c) => {
      c.images = { binding: "IMAGES" };
    },
    (c) => {
      c.kv_namespaces = [{ binding: "SESSION", id: "test" }];
    },
    (c) => {
      c.r2_buckets[0].jurisdiction = "default";
    },
    (c) => {
      c.secrets.required = [];
    },
    (c) => {
      c.queues.consumers = [{ queue: "unexpected" }];
    },
  ]) {
    const c = config("production");
    mutate(c);
    assert.throws(() => checkConfig(c, "production"));
  }
});

test("Free diagnostic rejects CPU overrides on either Worker and larger consumer batches", () => {
  const consumer = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("workers/pdf-consumer/wrangler.jsonc", "utf8"),
  ).config;
  checkConsumerConfig(consumer);
  for (const cpu_ms of [10, 300000]) {
    assert.throws(() => checkConsumerConfig({ ...consumer, limits: { cpu_ms } }), /custom CPU limit/);
    assert.throws(() => checkConfig({ ...config("production"), limits: { cpu_ms } }, "production"), /custom CPU limit/);
  }
  consumer.queues.consumers[0].max_batch_size = 10;
  assert.throws(() => checkConsumerConfig(consumer));
});
