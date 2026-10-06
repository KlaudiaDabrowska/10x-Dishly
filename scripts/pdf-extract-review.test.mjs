import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseReviewArgs,
  createRunDirectory,
  writePrivateJson,
  prepareReviewFixtures,
  runReview,
  assertReviewBudget,
  readBudget,
  compareExtraction,
  extractReviewFixture,
  replayReview,
  digest,
} from "./pdf-extract-review.mjs";
import { reconcileRateLimited, rateLimitReportId } from "./pdf-reconcile-rate-limited.mjs";
import { createTextBatches } from "../src/lib/pdf-processing/batching.ts";
import { recognizePdfBatch, OPENAI_MODEL } from "../src/lib/pdf-processing/openai.ts";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";

function temp(t) {
  const root = mkdtempSync(path.join(tmpdir(), "pdf-review-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function fixtureTree(root) {
  for (const dir of ["pdfs", "references", "reader-built"])
    mkdirSync(path.join(root, "local", dir), { recursive: true });
  const fixtures = ["summer", "pasta", "low-gi", "lunchboxy"].map((id) => {
    const bytes = Buffer.from("synthetic PDF " + id);
    const source = { version: 1, filename: id + ".pdf", sha256: digest(bytes), byteLength: bytes.length, pageCount: 9 };
    const pages = Array.from({ length: 9 }, (_, index) => ({
      page: index + 1,
      width: 100,
      height: 100,
      rotation: 0,
      items: [
        {
          anchor: { page: index + 1, itemIndex: 0 },
          text: "Dish",
          transform: [1, 0, 0, 1, 1, 1],
          width: 1,
          height: 1,
          direction: "ltr",
          hasEOL: false,
        },
      ],
    }));
    const reference = {
      fixtureId: id,
      sourceSha256: source.sha256,
      review: { status: "approved", approvedBy: "test", approvedAt: "2026-10-03" },
      recipes: [candidate()],
    };
    const referenceBytes = JSON.stringify(reference);
    writeFileSync(path.join(root, "local/pdfs", source.filename), bytes);
    writeFileSync(path.join(root, "local/references", id + ".json"), referenceBytes);
    writeFileSync(
      path.join(root, "local/reader-built", id + ".json"),
      JSON.stringify({ status: "ok", result: { source, pages } }),
    );
    return {
      id,
      filename: source.filename,
      localPath: "local/pdfs/" + source.filename,
      sha256: source.sha256,
      byteLength: source.byteLength,
      pageCount: source.pageCount,
      expectation: "accept",
      recipePages: [1],
      referencePath: "local/references/" + id + ".json",
      referenceSha256: digest(referenceBytes),
    };
  });
  writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ version: 1, fixtures }));
}
function candidate() {
  return {
    version: 2,
    sourceStart: { page: 1, itemIndex: 0 },
    pages: [1],
    title: "Dish",
    category: "dinner",
    sourceCategory: null,
    ingredientGroups: [
      { label: null, ingredients: [{ name: "Water", quantity: "100", unit: "ml", sourceText: "100 ml Water" }] },
    ],
    instructions: ["Mix."],
    servings: null,
    footnotes: [],
    missingFieldReasons: [],
  };
}
const ledgerSnapshot = {
  f01: { limit_nano_usd: 5_000_000_000, spent_nano_usd: 123_000_000, held_nano_usd: 61_440_000 },
};

test("review arguments default to both; invalid input has zero credential/network effects", async () => {
  assert.deepEqual(parseReviewArgs([]), { mode: "live", fixtures: ["summer", "lunchboxy"] });
  assert.deepEqual(parseReviewArgs(["pasta"]), { mode: "live", fixtures: ["pasta"] });
  assert.deepEqual(parseReviewArgs(["low-gi"]), { mode: "live", fixtures: ["low-gi"] });
  assert.deepEqual(parseReviewArgs(["dietetyka-diagnostic"]), { mode: "live", fixtures: ["dietetyka-diagnostic"] });
  assert.deepEqual(parseReviewArgs(["--preflight", "pasta"]), { mode: "preflight", fixtures: ["pasta"] });
  for (const args of [["unknown"], ["--replay"], ["summer", "pasta"], ["--all", "--oops"]]) {
    let effects = 0;
    await assert.rejects(runReview(args, { localSupabase: () => effects++ }), { code: "invalid-review-arguments" });
    assert.equal(effects, 0);
  }
  const child = spawnSync(process.execPath, ["scripts/pdf-extract-review.mjs", "--unknown"], { encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.deepEqual(JSON.parse(child.stderr), { ok: false, error: "invalid-review-arguments" });
});

test("private run artifacts are exclusive, mode 0600, and cannot overwrite earlier evidence", (t) => {
  const root = temp(t);
  const { directory } = createRunDirectory(root, "one");
  const file = path.join(directory, "record.json");
  writePrivateJson(file, { private: "synthetic" });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.throws(() => writePrivateJson(file, {}), { code: "EEXIST" });
  assert.throws(() => createRunDirectory(root, "one"), { code: "EEXIST" });
  assert.throws(() => createRunDirectory(root, "../escape"));
  assert.deepEqual(JSON.parse(readFileSync(file)), { private: "synthetic" });
});

test("fixture preflight binds reader, PDF, golden and approval before any effects", async (t) => {
  const root = temp(t);
  fixtureTree(root);
  const prepared = prepareReviewFixtures(root);
  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].batches.length, 2);
  assert.equal(prepared[0].readerDigest.length, 64);
  const file = path.join(root, "local/references/lunchboxy.json");
  writeFileSync(file, readFileSync(file, "utf8") + " ");
  let effects = 0;
  await assert.rejects(runReview([], { root, localSupabase: () => effects++ }), { code: "reference-hash-mismatch" });
  assert.equal(effects, 0);
});

test("reader identity mismatch is rejected independently of valid PDF/golden hashes", (t) => {
  const root = temp(t);
  fixtureTree(root);
  const file = path.join(root, "local/reader-built/lunchboxy.json");
  const reader = JSON.parse(readFileSync(file));
  reader.result.source.sha256 = "bad";
  writeFileSync(file, JSON.stringify(reader));
  assert.throws(() => prepareReviewFixtures(root), { code: "reader-source-mismatch" });
});

test("budget preflight retains historical spend/holds and headroom for all eight final cells", async (t) => {
  const root = temp(t);
  fixtureTree(root);
  const prepared = prepareReviewFixtures(root);
  const before = globalThis.structuredClone(ledgerSnapshot);
  const admitted = assertReviewBudget(before, prepared, ["summer", "lunchboxy"]);
  assert.equal(admitted.selectedCalls, 4);
  assert.equal(admitted.finalMatrixCalls, 16);
  assert.equal(admitted.availableNanoUsd, 5_000_000_000 - 123_000_000 - 61_440_000);
  assert.deepEqual(before, ledgerSnapshot);
  assert.throws(() => assertReviewBudget({}, prepared, ["lunchboxy"]), { code: "f01-ledger-missing" });
  assert.throws(
    () => assertReviewBudget({ f01: { ...before.f01, held_nano_usd: 4_700_000_000 } }, prepared, ["lunchboxy"]),
    { code: "f01-budget-insufficient" },
  );
  const calls = [];
  await readBudget({
    rpc: async (name, args) => {
      calls.push([name, args.p_scope_key]);
      return { error: null, data: args.p_scope_key === "f01" ? [before.f01] : [] };
    },
  });
  assert.ok(calls.every(([name]) => name === "get_pdf_budget_scope"));
});

test("a later batch failure preserves raw rejects, successful batch evidence and held accounting", async (t) => {
  const root = temp(t);
  fixtureTree(root);
  const prepared = prepareReviewFixtures(root, ["summer", "pasta"])[0];
  const { directory } = createRunDirectory(root);
  let calls = 0;
  const starts = [];
  let clock = 1000;
  const report = await extractReviewFixture({
    root,
    prepared,
    directory,
    ownerId: "owner",
    state: {},
    apiKey: "test",
    now: () => clock,
    prepareBatches: async () => prepared.batches,
    supabase: {
      rpc: async () => ({
        error: null,
        data: [
          {
            batches: [
              { batchIndex: 0, status: "reconciled", actualCostNanoUsd: 100 },
              { batchIndex: 1, status: "dispatch-claimed", reservedCostNanoUsd: 61_440_000 },
            ],
          },
        ],
      }),
    },
    recognize: async (options) => {
      starts.push(options.processingStartedAt);
      clock += 40;
      if (calls++ > 0) throw Object.assign(new Error("private failure must not leak"), { code: "provider-timeout" });
      const invalid = { ...candidate(), sourceStart: { page: 99, itemIndex: 0 } };
      options.onProviderResponse({ output: "private raw synthetic response" });
      return { duplicate: false, claim: { reservation_id: "reserved" }, value: { recipes: [candidate(), invalid] } };
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.failure, "provider-timeout");
  assert.equal(report.completedBatches, 1);
  assert.equal(report.reconciliation.invalidCount, 1);
  assert.equal(report.ledgerBatches[1].reservedCostNanoUsd, 61_440_000);
  assert.deepEqual(starts, [1000, 1000]);
  const batch = JSON.parse(readFileSync(path.join(directory, "summer/batch-0-result.json")));
  assert.equal(batch.candidates[1].raw.sourceStart.page, 99);
  assert.ok(batch.candidates[1].validation.issues[0].fieldPath);
  assert.ok(readFileSync(path.join(directory, "summer/batch-1-input.json")).length);
  assert.ok(readFileSync(path.join(directory, "summer/report.json")).length);
});

test("live review pauses between fixtures and keeps each 429 attempt's evidence without overwriting", async (t) => {
  const root = temp(t);
  fixtureTree(root);
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  const pauses = [];
  const order = [];
  const supabase = {
    auth: { admin: { createUser: async () => ({ error: null }) } },
    rpc: async (name, args) => {
      if (name === "get_pdf_budget_scope")
        return { error: null, data: args.p_scope_key === "f01" ? [ledgerSnapshot.f01] : [] };
      return { error: null, data: [{ batches: [] }] };
    },
  };
  const result = await runReview([], {
    root,
    localSupabase: () => supabase,
    pause: async (milliseconds) => {
      pauses.push(milliseconds);
      order.push("pause");
    },
    prepareBatches: async (source, pages) => createTextBatches(source, pages),
    recognize: async (options) => {
      order.push(options.batch.index);
      options.onProviderAttempt({
        attempt: 1,
        reservationId: "r1",
        error: "provider-rate-limited",
        retryAfterMs: 5,
        delayMs: 5,
      });
      options.onProviderResponse({ output: "second attempt" }, 2);
      options.onProviderAttempt({ attempt: 2, reservationId: "r2", error: null, retryAfterMs: null, delayMs: null });
      return { duplicate: false, claim: { reservation_id: "r2" }, value: { recipes: [] } };
    },
  });
  assert.deepEqual(pauses, [30_000]);
  assert.deepEqual(order, [0, 1, "pause", 0, 1]);
  const fixtureDir = path.join(result.evidence, "summer");
  assert.equal(JSON.parse(readFileSync(path.join(fixtureDir, "batch-0-attempt.json"))).error, "provider-rate-limited");
  assert.equal(JSON.parse(readFileSync(path.join(fixtureDir, "batch-0-attempt-2-attempt.json"))).reservationId, "r2");
  assert.deepEqual(JSON.parse(readFileSync(path.join(fixtureDir, "batch-0-attempt-2-response.json"))), {
    output: "second attempt",
  });
});

function rateLimitedRun(root, { failure = "provider-rate-limited", withResponse = false } = {}) {
  const { directory } = createRunDirectory(root);
  const fixtureDir = path.join(directory, "summer");
  mkdirSync(fixtureDir);
  writePrivateJson(path.join(fixtureDir, "batch-1-input.json"), { batch: { index: 1 }, inputDigest: "d".repeat(64) });
  if (withResponse) writePrivateJson(path.join(fixtureDir, "batch-1-response.json"), {});
  const reportPath = path.join(fixtureDir, "report.json");
  writePrivateJson(reportPath, {
    fixture: "summer",
    ownerId: "owner",
    importId: "import",
    failure,
    completedBatches: 1,
    requiredBatches: 2,
  });
  writePrivateJson(path.join(directory, "result.json"), {
    results: [{ fixture: "summer", failure, reportDigest: digest(readFileSync(reportPath)) }],
  });
  return reportPath;
}
function heldLedger(calls, batch = {}) {
  return {
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "reconcile_pdf_rate_limited") return { error: null, data: true };
      return {
        error: null,
        data: [
          {
            batches: [
              {
                batchIndex: 1,
                status: "dispatch-claimed",
                reservationState: "dispatch-claimed",
                reservationId: "held-reservation",
                inputDigest: "d".repeat(64),
                outputDigest: null,
                ...batch,
              },
            ],
          },
        ],
      };
    },
  };
}

test("trusted 429 reconciliation requires saved 429 evidence, no response and a held ledger batch", async (t) => {
  const root = temp(t);
  const calls = [];
  const reportPath = rateLimitedRun(root);
  const result = await reconcileRateLimited([reportPath, "1"], { root, localSupabase: () => heldLedger(calls) });
  assert.equal(result.reconciled, true);
  const reconcile = calls.find(([name]) => name === "reconcile_pdf_rate_limited")[1];
  assert.equal(reconcile.p_owner_id, "owner");
  assert.equal(reconcile.p_reservation_id, "held-reservation");
  assert.equal(reconcile.p_usage_report_id, rateLimitReportId("held-reservation"));
  assert.match(reconcile.p_usage_report_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(readFileSync(path.join(path.dirname(reportPath), "batch-1-rate-limit-reconciliation.json")).length);
  await assert.rejects(reconcileRateLimited([reportPath, "1"], { root, localSupabase: () => heldLedger([]) }), {
    code: "already-reconciled",
  });

  for (const [setup, args, code, batch] of [
    [{ failure: "provider-timeout" }, ["1"], "not-rate-limited"],
    [{ withResponse: true }, ["1"], "provider-response-present"],
    [{}, ["0"], "batch-not-failed"],
    [{}, ["x"], "invalid-arguments"],
    [{}, ["1"], "ledger-batch-not-held", { status: "reconciled", reservationState: "reconciled" }],
    [{}, ["1"], "ledger-batch-not-held", { inputDigest: "e".repeat(64) }],
  ]) {
    const effects = [];
    const path0 = rateLimitedRun(root, setup);
    await assert.rejects(
      reconcileRateLimited([path0, ...args], { root, localSupabase: () => heldLedger(effects, batch) }),
      { code },
    );
    assert.equal(
      effects.some(([name]) => name === "reconcile_pdf_rate_limited"),
      false,
      code,
    );
  }
  const tampered = rateLimitedRun(root);
  writeFileSync(tampered, readFileSync(tampered, "utf8") + " ");
  await assert.rejects(reconcileRateLimited([tampered, "1"], { root, localSupabase: () => heldLedger([]) }), {
    code: "report-evidence-mismatch",
  });
});

test("golden match is insufficient when a candidate is invalid/incomplete or accounting is unconfirmed", () => {
  const actual = { recipes: [candidate()] };
  const clean = { candidates: [{ status: "complete" }], invalidCount: 0, conflicts: [] };
  assert.equal(compareExtraction(actual, actual, clean, true).ok, true);
  for (const change of [
    { ...clean, invalidCount: 1 },
    { ...clean, conflicts: [{}] },
    { ...clean, candidates: [{ status: "incomplete" }] },
  ])
    assert.equal(compareExtraction(actual, actual, change, true).ok, false);
  assert.equal(compareExtraction(actual, actual, clean, false).ok, false);
  assert.equal(compareExtraction(actual, actual, clean, true, false).ok, false);
});

test("offline replay re-compares private actuals, detects tampering, and CLI exits nonzero for a mismatch", (t) => {
  const root = temp(t);
  fixtureTree(root);
  const prepared = prepareReviewFixtures(root, ["summer", "pasta"])[0];
  const { directory, runId } = createRunDirectory(root);
  mkdirSync(path.join(directory, "summer"));
  const run = { version: 2, runId, fixtures: [{ fixture: prepared.fixture }] };
  writePrivateJson(path.join(directory, "run.json"), run);
  const wrong = { ...candidate(), instructions: ["Wrong."] };
  const report = {
    fixture: "summer",
    failure: null,
    elapsedMs: 10,
    actual: { recipes: [wrong] },
    reconciliation: { candidates: [{ candidate: wrong, status: "complete" }], invalidCount: 0, conflicts: [] },
    completedBatches: 1,
    requiredBatches: 1,
    ledgerBatches: [{ status: "reconciled" }],
  };
  const reportPath = path.join(directory, "summer/report.json");
  writePrivateJson(reportPath, report);
  writePrivateJson(path.join(directory, "result.json"), {
    version: 2,
    runId,
    failure: null,
    runDigest: digest(readFileSync(path.join(directory, "run.json"))),
    results: [{ fixture: "summer", reportDigest: digest(readFileSync(reportPath)) }],
  });
  const replayed = replayReview(directory, root);
  assert.equal(replayed.ok, false);
  assert.equal(replayed.results[0].comparison.lostVariantsStepsNotes, 1);
  writeFileSync(reportPath, JSON.stringify({ ...report, actual: { recipes: [candidate()] } }));
  assert.throws(() => replayReview(directory, root), { code: "replay-artifact-mismatch" });
});

function adapterBatch() {
  const source = { version: 1, sha256: "f".repeat(64), filename: "test.pdf", byteLength: 1, pageCount: 1 };
  return createTextBatches(source, [{ page: 1, width: 1, height: 1, rotation: 0, items: [] }])[0];
}
function adapterState(events) {
  return {
    reserveAndClaim: async (reservation) => {
      events.push("reserve");
      return {
        claimed: true,
        import_id: reservation.importId,
        batch_index: reservation.batchIndex,
        reservation_id: "reservation",
        attempt_id: "attempt",
        status: "dispatch-claimed",
      };
    },
    reconcile: async () => {
      events.push("reconcile");
      return true;
    },
  };
}
const reservation = {
  importId: "import",
  batchIndex: 0,
  fileFingerprint: "f".repeat(64),
  manifestDigest: "m".repeat(64),
  inputDigest: "i".repeat(64),
  corePageStart: 1,
  corePageEnd: 1,
  expiresAt: "2099-01-01",
};
const json = (value) => new globalThis.Response(JSON.stringify(value));
const providerResult = () => ({
  id: "response",
  status: "completed",
  model: OPENAI_MODEL,
  output: [{ content: [{ type: "output_text", text: '{"recipes":[]}' }] }],
  usage: { input_tokens: 1, output_tokens: 1 },
});

test("one import deadline prevents the second batch and prevents reservation after slow counting", async () => {
  const events = [];
  let clock = 0;
  const options = {
    apiKey: "test",
    batch: adapterBatch(),
    state: adapterState(events),
    reservation,
    processingStartedAt: 0,
    now: () => clock,
    fetch: async (url) => {
      events.push("fetch");
      if (url.endsWith("/input_tokens")) return json({ object: "response.input_tokens", input_tokens: 1 });
      clock = PDF_LIMITS.processingDeadlineMs;
      return json(providerResult());
    },
  };
  await recognizePdfBatch(options);
  const count = events.length;
  await assert.rejects(recognizePdfBatch(options), { code: "processing-timeout" });
  assert.equal(events.length, count);
  events.length = 0;
  clock = 0;
  await assert.rejects(
    recognizePdfBatch({
      ...options,
      fetch: async () => {
        clock = PDF_LIMITS.processingDeadlineMs;
        return json({ object: "response.input_tokens", input_tokens: 1 });
      },
    }),
    { code: "processing-timeout" },
  );
  assert.deepEqual(events, []);
});

test("provider deadline uses remaining import time and timeout keeps the reservation held", async () => {
  const events = [];
  let clock = 0;
  await assert.rejects(
    recognizePdfBatch({
      apiKey: "test",
      batch: adapterBatch(),
      state: adapterState(events),
      reservation,
      processingStartedAt: 0,
      now: () => clock,
      fetch: async (url, init) => {
        if (url.endsWith("/input_tokens")) {
          clock = PDF_LIMITS.processingDeadlineMs - 10;
          return json({ object: "response.input_tokens", input_tokens: 1 });
        }
        return new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      },
    }),
    { code: "provider-timeout" },
  );
  assert.deepEqual(events, ["reserve"]);
});
