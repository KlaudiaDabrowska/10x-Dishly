import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  consumeProbe,
  handleProbe,
  isProbeMessage,
  probeObjectKey,
  PROBE_PDF,
  PROBE_QUEUE,
  PROBE_DLQ,
} from "../src/lib/deployment-probe.ts";

const token = "test-token-not-a-production-secret";
function message() {
  const jobId = randomUUID();
  return {
    version: 1,
    kind: "deployment_probe",
    jobId,
    objectKey: probeObjectKey(jobId),
    requestedAt: new Date().toISOString(),
  };
}
function delivery(body, attempts = 1) {
  return {
    body,
    attempts,
    acknowledged: false,
    retryOptions: null,
    ack() {
      this.acknowledged = true;
    },
    retry(options) {
      this.retryOptions = options;
    },
  };
}
function request(authorization = `Bearer ${token}`) {
  return new Request("https://example.test/api/ops/deployment-probe", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}
function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(key, value);
    },
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : { size: value.length, text: async () => value };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

test("validation rejects foreign keys, unsupported versions, and untrusted identifiers", () => {
  const valid = message();
  assert.ok(isProbeMessage(valid));
  for (const invalid of [
    null,
    {},
    { ...valid, version: 2 },
    { ...valid, kind: "import" },
    { ...valid, jobId: "secret" },
    { ...valid, objectKey: "private/real.pdf" },
    { ...valid, requestedAt: "invalid" },
  ])
    assert.equal(isProbeMessage(invalid), false);
});

test("authentication and missing infrastructure fail without accessing storage", async () => {
  for (const authorization of [null, "Bearer incorrect", "Basic abc", `Bearer ${token}extra`]) {
    assert.equal((await handleProbe(request(authorization), { DEPLOY_PROBE_TOKEN: token })).status, 401);
  }
  assert.equal((await handleProbe(request(), {})).status, 401);
  assert.equal((await handleProbe(request(), { DEPLOY_PROBE_TOKEN: token })).status, 503);
  assert.equal((await handleProbe(request(), { DEPLOYMENT_ENV: "preview", DEPLOY_PROBE_TOKEN: token })).status, 503);
});

test("producer to consumer integration with local R2 and simulated Queue delivery", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "probe-test",
          modules: true,
          script: "export default {fetch() {return new Response('ok')}}",
          r2Buckets: ["PDF_BUCKET"],
        },
      ],
    }),
  );
  try {
    const bucket = await mf.getR2Bucket("PDF_BUCKET");
    const messages = [];
    const logs = [];
    const response = await handleProbe(
      request(),
      {
        DEPLOY_PROBE_TOKEN: token,
        PDF_BUCKET: bucket,
        PDF_IMPORT_QUEUE: {
          async send(body) {
            messages.push(body);
          },
        },
      },
      (entry) => logs.push(entry),
    );
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { jobId: messages[0].jobId, status: "queued" });
    assert.equal(await (await bucket.get(messages[0].objectKey)).text(), PROBE_PDF);
    const first = delivery(messages[0]);
    await consumeProbe(PROBE_QUEUE, first, bucket, (entry) => logs.push(entry));
    assert.ok(first.acknowledged);
    assert.equal(await bucket.get(messages[0].objectKey), null);
    const duplicate = delivery(messages[0], 2);
    await consumeProbe(PROBE_QUEUE, duplicate, bucket, (entry) => logs.push(entry));
    assert.ok(duplicate.acknowledged);
    assert.equal(logs.at(-1).outcome, "already_deleted");
    for (const entry of logs)
      assert.deepEqual(
        Object.keys(entry).sort(),
        ["event", "job_id", "attempt", "object_deleted", "duration_ms", "outcome"].sort(),
      );
    assert.ok(!JSON.stringify(logs).includes(token));
    assert.ok(!JSON.stringify(logs).includes(messages[0].objectKey));
    assert.ok(!JSON.stringify(logs).includes(PROBE_PDF));
  } finally {
    await mf.dispose();
  }
});

test("transient read failure preserves the object through retry exhaustion, DLQ deletes it", async () => {
  const bucket = fakeBucket();
  const body = message();
  await bucket.put(body.objectKey, PROBE_PDF);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const item = delivery(body, attempt);
    await consumeProbe(
      PROBE_QUEUE,
      item,
      {
        ...bucket,
        async get() {
          throw new Error("provider-secret");
        },
      },
      () => {
        /* Logs intentionally discarded here. */
      },
    );
    assert.equal(item.acknowledged, false);
    assert.deepEqual(item.retryOptions, { delaySeconds: 60 });
    assert.ok(bucket.objects.has(body.objectKey));
  }
  const dead = delivery(body);
  const logs = [];
  await consumeProbe(PROBE_DLQ, dead, bucket, (entry) => logs.push(entry));
  assert.ok(dead.acknowledged);
  assert.equal(bucket.objects.has(body.objectKey), false);
  assert.equal(logs[0].event, "terminal_failure");
  assert.equal(logs[0].object_deleted, true);
});

test("invalid PDF is terminal; cleanup errors retry without acknowledgement, including DLQ", async () => {
  for (const queue of [PROBE_QUEUE, PROBE_DLQ]) {
    const bucket = fakeBucket();
    const body = message();
    await bucket.put(body.objectKey, "invalid PDF");
    const failed = delivery(body);
    await consumeProbe(
      queue,
      failed,
      {
        ...bucket,
        async delete() {
          throw new Error("secret");
        },
      },
      () => {
        /* Logs intentionally discarded here. */
      },
    );
    assert.equal(failed.acknowledged, false);
    assert.ok(failed.retryOptions);
    assert.ok(bucket.objects.has(body.objectKey));
    const recovered = delivery(body, 2);
    const logs = [];
    await consumeProbe(queue, recovered, bucket, (entry) => logs.push(entry));
    assert.ok(recovered.acknowledged);
    assert.equal(bucket.objects.has(body.objectKey), false);
    assert.equal(logs[0].outcome, "terminal_failure");
  }
});

test("malformed messages never delete arbitrary objects or log their contents", async () => {
  const bucket = fakeBucket();
  await bucket.put("private/secret", "private contents");
  const logs = [];
  const item = delivery({ ...message(), objectKey: "private/secret" });
  await consumeProbe(PROBE_QUEUE, item, bucket, (entry) => logs.push(entry));
  assert.ok(item.acknowledged);
  assert.ok(bucket.objects.has("private/secret"));
  assert.equal(logs[0].job_id, null);
  assert.ok(!JSON.stringify(logs).includes("private"));
});

test("enqueue failures clean up; failed cleanup is recorded without leaking provider errors", async () => {
  for (const cleanupFails of [false, true]) {
    const bucket = fakeBucket();
    if (cleanupFails)
      bucket.delete = async () => {
        throw new Error("storage secret");
      };
    const logs = [];
    const response = await handleProbe(
      request(),
      {
        DEPLOY_PROBE_TOKEN: token,
        PDF_BUCKET: bucket,
        PDF_IMPORT_QUEUE: {
          async send() {
            throw new Error("queue secret");
          },
        },
      },
      (entry) => logs.push(entry),
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "infrastructure_unavailable" });
    assert.equal(bucket.objects.size, cleanupFails ? 1 : 0);
    assert.equal(logs[0].object_deleted, !cleanupFails);
    assert.ok(!JSON.stringify(logs).includes("secret"));
  }
});

test("object body read failures preserve data and terminal acknowledgement follows deletion", async () => {
  const bucket = fakeBucket();
  const body = message();
  await bucket.put(body.objectKey, PROBE_PDF);
  const logs = [];
  const item = delivery(body);
  await consumeProbe(
    PROBE_QUEUE,
    item,
    {
      ...bucket,
      async get() {
        return {
          size: PROBE_PDF.length,
          async text() {
            throw new Error("private provider detail");
          },
        };
      },
    },
    (entry) => logs.push(entry),
  );
  assert.ok(item.retryOptions);
  assert.equal(item.acknowledged, false);
  assert.ok(bucket.objects.has(body.objectKey));
  assert.ok(!JSON.stringify(logs).includes("private"));
  const recovered = delivery(body, 2);
  recovered.ack = () => {
    assert.equal(bucket.objects.has(body.objectKey), false);
    recovered.acknowledged = true;
  };
  await consumeProbe(PROBE_QUEUE, recovered, bucket, (entry) => logs.push(entry));
  assert.ok(recovered.acknowledged);
});

test("storage write failure does not enqueue a message", async () => {
  let queued = false;
  const logs = [];
  const response = await handleProbe(
    request(),
    {
      DEPLOY_PROBE_TOKEN: token,
      PDF_BUCKET: {
        ...fakeBucket(),
        async put() {
          throw new Error("private storage detail");
        },
      },
      PDF_IMPORT_QUEUE: {
        async send() {
          queued = true;
        },
      },
    },
    (entry) => logs.push(entry),
  );
  assert.equal(response.status, 503);
  assert.equal(queued, false);
  assert.ok(!JSON.stringify(logs).includes("private"));
});
