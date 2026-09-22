import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const requiredSecrets = ["DEPLOY_PROBE_TOKEN", "SUPABASE_KEY", "SUPABASE_URL"];

export function checkConfig(config, target) {
  assert.ok(["production", "preview"].includes(target), "Expected production or preview");
  const preview = target === "preview";
  assert.equal(config.name, preview ? "dishly-web-preview" : "dishly-web");
  assert.deepEqual(config.vars, { DEPLOYMENT_ENV: target });
  assert.deepEqual([...(config.secrets?.required ?? [])].sort(), preview ? [] : requiredSecrets);
  assert.deepEqual(
    config.r2_buckets ?? [],
    preview ? [] : [{ binding: "PDF_BUCKET", bucket_name: "dishly-pdf-imports-eu", jurisdiction: "eu" }],
  );
  assert.deepEqual(
    config.queues?.producers ?? [],
    preview ? [] : [{ binding: "PDF_IMPORT_QUEUE", queue: "dishly-pdf-imports" }],
  );
  assert.equal(config.queues?.consumers?.length ?? 0, 0, "Web Worker must not consume queues");
  assert.equal(config.assets?.binding, "ASSETS");
  // Enumerate binding identifiers recursively so newly added provider resource types cannot slip through.
  const bindings = [];
  function visit(value, key = "") {
    if (!value || typeof value !== "object") return;
    if (typeof value.binding === "string") bindings.push(value.binding);
    if (key === "kv_namespaces" && value.length) throw new Error("KV bindings are forbidden");
    if (key === "services" && value.length) throw new Error("Service bindings are forbidden");
    if (key === "durable_objects" && value.bindings?.length) throw new Error("Durable Objects are forbidden");
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  }
  visit(config);
  assert.deepEqual(bindings.sort(), preview ? ["ASSETS"] : ["ASSETS", "PDF_BUCKET", "PDF_IMPORT_QUEUE"]);
  assert.equal(config.images, undefined, "IMAGES binding is forbidden");
}

export function checkDeployment(target) {
  for (const [name, expected] of [
    ["astro", "7.3.2"],
    ["@astrojs/cloudflare", "14.3.1"],
    ["wrangler", "4.131.1"],
  ]) {
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
    assert.equal(installed.version, expected, `${name} version differs from approved plan`);
  }
  checkConfig(JSON.parse(readFileSync("dist/server/wrangler.json", "utf8")), target);
  const consumer = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("workers/pdf-consumer/wrangler.jsonc", "utf8"),
  );
  assert.equal(consumer.error, undefined);
  const config = consumer.config;
  assert.equal(config.name, "dishly-pdf-worker");
  assert.equal(config.limits.cpu_ms, 300000);
  assert.deepEqual(config.observability, { enabled: true, head_sampling_rate: 1 });
  assert.deepEqual(config.r2_buckets, [
    { binding: "PDF_BUCKET", bucket_name: "dishly-pdf-imports-eu", jurisdiction: "eu" },
  ]);
  assert.deepEqual(config.queues.consumers, [
    {
      queue: "dishly-pdf-imports",
      dead_letter_queue: "dishly-pdf-imports-dlq",
      max_batch_size: 1,
      max_concurrency: 1,
      max_retries: 3,
      retry_delay: 60,
    },
    { queue: "dishly-pdf-imports-dlq", max_batch_size: 1, max_concurrency: 1, max_retries: 3, retry_delay: 60 },
  ]);
  console.log(`Deployment configuration verified: ${target}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) checkDeployment(process.argv[2]);
