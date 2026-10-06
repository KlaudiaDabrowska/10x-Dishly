import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createTextBatches } from "../src/lib/pdf-processing/batching.ts";
import { calculateCostNanoUsd } from "../src/lib/pdf-processing/budget.ts";
import { dispatchWithSpendingControl } from "../src/lib/pdf-processing/import-state.ts";
import { batchFromManifest } from "../src/lib/pdf-processing/manifest.ts";
import { createValidationService } from "../src/lib/pdf-processing/service.ts";
import { verifyIsolatedDbProject, isolatedSupabaseEnv } from "./pdf-processing-db-runner.mjs";

// Deliberately refuse direct execution against the developer's paid-usage ledger.
const isolated = verifyIsolatedDbProject(process.env);

function supabase(...args) {
  return execFileSync("npx", ["--no-install", "supabase", "--workdir", isolated.workdir, ...args], {
    cwd: new URL("..", import.meta.url),
    env: isolatedSupabaseEnv(isolated.projectId),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const local = JSON.parse(supabase("status", "-o", "json"));
const url = local.API_URL;
assert.equal(url, `http://127.0.0.1:${isolated.apiPort}`, "Refusing a non-isolated API endpoint");
const databaseUrl = new URL(local.DB_URL);
assert.equal(databaseUrl.hostname, "127.0.0.1", "Refusing a non-local database");
assert.equal(databaseUrl.port, String(isolated.dbPort), "Refusing a non-isolated database port");
const publicKey = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
const secretKey = local.SECRET_KEY ?? local.SERVICE_ROLE_KEY;
if (!url || !publicKey || !secretKey) throw new Error("Local Supabase status did not expose test credentials");

const admin = () => createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = () => createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const digest = (letter) => letter.repeat(64);
const pricing = {
  provider: "local-test",
  model: "none",
  inputNanoUsdPerMillionTokens: 1,
  outputNanoUsdPerMillionTokens: 1,
};

async function createUser(email) {
  const password = `Local-test-${randomUUID()}!`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  return { id: data.user.id, email, password };
}

function request(ownerId, overrides = {}) {
  return {
    p_owner_id: ownerId,
    p_import_id: randomUUID(),
    p_batch_index: 0,
    p_file_fingerprint: digest("f"),
    p_manifest_digest: digest("m"),
    p_input_digest: digest("i"),
    p_core_page_start: 1,
    p_core_page_end: 1,
    p_maximum_cost_nano_usd: 1,
    p_pricing_snapshot: pricing,
    p_expires_at: "2099-01-01T00:00:00Z",
    p_accounting_time: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

async function reserve(client, payload) {
  return client.rpc("reserve_pdf_batch", payload);
}

async function scope(key) {
  const { data, error } = await admin().rpc("get_pdf_budget_scope", { p_scope_key: key });
  assert.ifError(error);
  assert.equal(data.length, 1);
  return Object.fromEntries(
    Object.entries(data[0]).map(([name, value]) => [
      name,
      typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
    ]),
  );
}

const owner = await createUser(`pdf-owner-${randomUUID()}@example.test`);
const otherOwner = await createUser(`pdf-other-${randomUUID()}@example.test`);

test("accounting RPCs reject public and authenticated browser clients", async () => {
  const payload = request(owner.id);
  const usage = {
    p_owner_id: owner.id,
    p_reservation_id: randomUUID(),
    p_usage_report_id: randomUUID(),
    p_actual_cost_nano_usd: 1,
    p_input_tokens: 1,
    p_output_tokens: 1,
    p_output_digest: digest("o"),
  };
  const anonymousClient = publicClient();
  const anonymous = await reserve(anonymousClient, payload);
  assert.ok(anonymous.error);
  assert.ok((await anonymousClient.rpc("reconcile_pdf_usage", usage)).error);

  const signedIn = publicClient();
  const login = await signedIn.auth.signInWithPassword({ email: owner.email, password: owner.password });
  assert.ifError(login.error);
  const authenticated = await reserve(signedIn, payload);
  assert.ok(authenticated.error);
  assert.ok((await signedIn.rpc("reconcile_pdf_usage", usage)).error);
});

test("pricing rounds each token class upward to integer nano-USD", () => {
  assert.equal(
    calculateCostNanoUsd(
      { inputTokens: 1, outputTokens: 1 },
      { provider: "test", model: "test", inputNanoUsdPerMillionTokens: 1, outputNanoUsdPerMillionTokens: 1 },
    ),
    2,
  );
});

test("near-limit admission is atomic and duplicate batches never claim twice", async () => {
  const importId = randomUUID();
  const base = request(owner.id, {
    p_import_id: importId,
    p_maximum_cost_nano_usd: 450_000_000,
    p_expires_at: "2026-01-02T00:00:00Z",
  });
  const first = await reserve(admin(), base);
  assert.ifError(first.error);
  assert.equal(first.data[0].claimed, true);

  const [left, right] = await Promise.all([
    reserve(admin(), { ...base, p_batch_index: 1, p_input_digest: digest("a"), p_maximum_cost_nano_usd: 50_000_000 }),
    reserve(admin(), { ...base, p_batch_index: 2, p_input_digest: digest("b"), p_maximum_cost_nano_usd: 50_000_000 }),
  ]);
  assert.equal([left, right].filter((result) => !result.error).length, 1);
  assert.equal([left, right].filter((result) => result.error).length, 1);

  const duplicate = await reserve(admin(), base);
  assert.ifError(duplicate.error);
  assert.equal(duplicate.data[0].claimed, false);
  assert.equal(duplicate.data[0].attempt_id, first.data[0].attempt_id);

  const importScope = await scope(`import:${importId}`);
  assert.equal(importScope.limit_nano_usd, 500_000_000);
  assert.equal(importScope.held_nano_usd, 500_000_000);

  const state = await admin().rpc("get_pdf_import_state", { p_owner_id: otherOwner.id, p_import_id: importId });
  assert.ifError(state.error);
  assert.deepEqual(state.data, []);
});

test("usage reconciliation is exactly once and stays in the reserved UTC period", async () => {
  const importId = randomUUID();
  const admitted = await reserve(
    admin(),
    request(owner.id, {
      p_import_id: importId,
      p_maximum_cost_nano_usd: 100_000_000,
      p_accounting_time: "2026-01-31T23:59:59.999Z",
      p_expires_at: "2026-02-01T00:00:01Z",
    }),
  );
  assert.ifError(admitted.error);
  const reservationId = admitted.data[0].reservation_id;
  const reportId = randomUUID();
  const report = {
    p_owner_id: owner.id,
    p_reservation_id: reservationId,
    p_usage_report_id: reportId,
    p_actual_cost_nano_usd: 25_000_000,
    p_input_tokens: 100,
    p_output_tokens: 20,
    p_output_digest: digest("o"),
  };

  const first = await admin().rpc("reconcile_pdf_usage", report);
  assert.ifError(first.error);
  assert.equal(first.data, true);
  const duplicate = await admin().rpc("reconcile_pdf_usage", report);
  assert.ifError(duplicate.error);
  assert.equal(duplicate.data, false);
  const secondReport = await admin().rpc("reconcile_pdf_usage", { ...report, p_usage_report_id: randomUUID() });
  assert.ok(secondReport.error);

  const january = await scope("month:2026-01");
  assert.equal(january.limit_nano_usd, 10_000_000_000);
  assert.ok(january.spent_nano_usd >= 25_000_000);

  const februaryAdmission = await reserve(
    admin(),
    request(owner.id, {
      p_accounting_time: "2026-02-01T00:00:00Z",
    }),
  );
  assert.ifError(februaryAdmission.error);
  const february = await scope("month:2026-02");
  assert.equal(february.period_start, "2026-02-01T00:00:00+00:00");
  assert.equal(february.period_end, "2026-03-01T00:00:00+00:00");

  const global = await scope("f01");
  assert.equal(global.limit_nano_usd, 7_000_000_000);
});

test("expiry, timeout, crash and cancellation never free a dispatch-claimed reservation", async () => {
  const importId = randomUUID();
  const admitted = await reserve(
    admin(),
    request(owner.id, {
      p_import_id: importId,
      p_maximum_cost_nano_usd: 10,
      p_accounting_time: "2031-01-01T00:00:00Z",
      p_expires_at: "2031-01-01T00:00:01Z",
    }),
  );
  assert.ifError(admitted.error);
  const reservationId = admitted.data[0].reservation_id;
  const before = await scope(`import:${importId}`);

  const closed = await admin().rpc("close_expired_pdf_import", {
    p_owner_id: owner.id,
    p_import_id: importId,
    p_accounting_time: "2031-01-02T00:00:00Z",
  });
  assert.ifError(closed.error);
  assert.equal(closed.data, true);

  const release = await admin().rpc("release_pdf_reservation", {
    p_owner_id: owner.id,
    p_reservation_id: reservationId,
  });
  assert.ok(release.error);

  const after = await scope(`import:${importId}`);
  assert.equal(after.held_nano_usd, before.held_nano_usd);
  assert.equal(after.held_nano_usd, 10);
});

test("ledger accepts pages 113 through 115 and rejects page 116 without reserving budget", async () => {
  const pageOwner = await createUser(`pdf-pages-${randomUUID()}@example.test`);
  const allowed = request(pageOwner.id, {
    p_core_page_start: 113,
    p_core_page_end: 115,
    p_accounting_time: "2032-01-01T00:00:00Z",
  });
  const accepted = await reserve(admin(), allowed);
  assert.ifError(accepted.error);
  assert.equal(accepted.data[0].claimed, true);

  const acceptedState = await admin().rpc("get_pdf_import_state", {
    p_owner_id: pageOwner.id,
    p_import_id: allowed.p_import_id,
  });
  assert.ifError(acceptedState.error);
  assert.equal(acceptedState.data[0].batches[0].corePageStart, 113);
  assert.equal(acceptedState.data[0].batches[0].corePageEnd, 115);
  const budgetBefore = await scope("f01");

  for (const pageStart of [113, 116]) {
    const invalid = request(pageOwner.id, {
      p_core_page_start: pageStart,
      p_core_page_end: 116,
      p_accounting_time: "2032-01-01T00:00:00Z",
    });
    const rejected = await reserve(admin(), invalid);
    assert.ok(rejected.error);
    assert.equal(rejected.error.message, "invalid reservation");
    const rejectedState = await admin().rpc("get_pdf_import_state", {
      p_owner_id: pageOwner.id,
      p_import_id: invalid.p_import_id,
    });
    assert.ifError(rejectedState.error);
    assert.deepEqual(rejectedState.data, []);
  }
  assert.deepEqual(await scope("f01"), budgetBefore);
});

test("browser clients cannot call the rate-limit reconciliation", async () => {
  const payload = { p_owner_id: owner.id, p_reservation_id: randomUUID(), p_usage_report_id: randomUUID() };
  const anonymousClient = publicClient();
  assert.ok((await anonymousClient.rpc("reconcile_pdf_rate_limited", payload)).error);
  const signedIn = publicClient();
  const login = await signedIn.auth.signInWithPassword({ email: owner.email, password: owner.password });
  assert.ifError(login.error);
  assert.ok((await signedIn.rpc("reconcile_pdf_rate_limited", payload)).error);
});

test("a 429 is reconciled at zero once, frees the hold, and admits exactly one new reservation", async () => {
  const base = request(owner.id, {
    p_maximum_cost_nano_usd: 100,
    p_accounting_time: "2033-01-01T00:00:00Z",
    p_expires_at: "2099-01-01T00:00:00Z",
  });
  const first = await reserve(admin(), base);
  assert.ifError(first.error);
  const firstReservation = first.data[0].reservation_id;
  const importKey = `import:${base.p_import_id}`;
  const before = await scope(importKey);
  assert.equal(before.held_nano_usd, 100);

  const zero = { p_owner_id: owner.id, p_reservation_id: firstReservation, p_usage_report_id: randomUUID() };
  const otherOwnerAttempt = await admin().rpc("reconcile_pdf_rate_limited", { ...zero, p_owner_id: otherOwner.id });
  assert.ok(otherOwnerAttempt.error);
  const reconciled = await admin().rpc("reconcile_pdf_rate_limited", zero);
  assert.ifError(reconciled.error);
  assert.equal(reconciled.data, true);
  const repeated = await admin().rpc("reconcile_pdf_rate_limited", zero);
  assert.ifError(repeated.error);
  assert.equal(repeated.data, false);
  assert.ok((await admin().rpc("reconcile_pdf_rate_limited", { ...zero, p_usage_report_id: randomUUID() })).error);
  const after = await scope(importKey);
  assert.equal(after.held_nano_usd, 0);
  assert.equal(after.spent_nano_usd, before.spent_nano_usd);

  const state = await admin().rpc("get_pdf_import_state", { p_owner_id: owner.id, p_import_id: base.p_import_id });
  assert.ifError(state.error);
  assert.equal(state.data[0].batches[0].status, "rate-limited");
  assert.equal(state.data[0].batches[0].reservationState, "rate-limited");

  const retry = await reserve(admin(), base);
  assert.ifError(retry.error);
  assert.equal(retry.data[0].claimed, true);
  assert.notEqual(retry.data[0].reservation_id, firstReservation);
  assert.equal((await scope(importKey)).held_nano_usd, 100);
  const duplicate = await reserve(admin(), base);
  assert.ifError(duplicate.error);
  assert.equal(duplicate.data[0].claimed, false);
  assert.equal(duplicate.data[0].reservation_id, retry.data[0].reservation_id);

  // The second 429 also reconciles at zero, but no third reservation is admitted.
  const second = await admin().rpc("reconcile_pdf_rate_limited", {
    p_owner_id: owner.id,
    p_reservation_id: retry.data[0].reservation_id,
    p_usage_report_id: randomUUID(),
  });
  assert.ifError(second.error);
  assert.equal(second.data, true);
  const third = await reserve(admin(), base);
  assert.ifError(third.error);
  assert.equal(third.data[0].claimed, false);
  assert.equal((await scope(importKey)).held_nano_usd, 0);
  assert.equal((await scope(importKey)).spent_nano_usd, before.spent_nano_usd);
});

test("zero-cost reconciliation applies only to dispatch-claimed reservations", async () => {
  const usageImport = request(owner.id, { p_maximum_cost_nano_usd: 100, p_accounting_time: "2034-01-01T00:00:00Z" });
  const admitted = await reserve(admin(), usageImport);
  assert.ifError(admitted.error);
  const reservationId = admitted.data[0].reservation_id;
  const usage = await admin().rpc("reconcile_pdf_usage", {
    p_owner_id: owner.id,
    p_reservation_id: reservationId,
    p_usage_report_id: randomUUID(),
    p_actual_cost_nano_usd: 40,
    p_input_tokens: 10,
    p_output_tokens: 5,
    p_output_digest: digest("o"),
  });
  assert.ifError(usage.error);
  const importKey = `import:${usageImport.p_import_id}`;
  const before = await scope(importKey);
  const rejected = await admin().rpc("reconcile_pdf_rate_limited", {
    p_owner_id: owner.id,
    p_reservation_id: reservationId,
    p_usage_report_id: randomUUID(),
  });
  assert.ok(rejected.error);
  assert.deepEqual(await scope(importKey), before);
  const retry = await reserve(admin(), usageImport);
  assert.ifError(retry.error);
  assert.equal(retry.data[0].claimed, false);

  const expiredImport = request(owner.id, {
    p_maximum_cost_nano_usd: 10,
    p_accounting_time: "2035-01-01T00:00:00Z",
    p_expires_at: "2035-01-01T00:00:01Z",
  });
  const expired = await reserve(admin(), expiredImport);
  assert.ifError(expired.error);
  const closed = await admin().rpc("close_expired_pdf_import", {
    p_owner_id: owner.id,
    p_import_id: expiredImport.p_import_id,
    p_accounting_time: "2035-01-02T00:00:00Z",
  });
  assert.ifError(closed.error);
  // A rate-limit reconcile after closing frees the hold but never reopens the closed import.
  const zero = await admin().rpc("reconcile_pdf_rate_limited", {
    p_owner_id: owner.id,
    p_reservation_id: expired.data[0].reservation_id,
    p_usage_report_id: randomUUID(),
  });
  assert.ifError(zero.error);
  const reopened = await reserve(admin(), { ...expiredImport, p_accounting_time: "2035-01-01T00:00:00.5Z" });
  assert.ifError(reopened.error);
  assert.equal(reopened.data[0].claimed, false);
});

const sha = () => randomUUID().replaceAll("-", "").repeat(2);
const textItem = (page, itemIndex, text, y) => ({
  anchor: { page, itemIndex },
  text,
  transform: [10, 0, 0, 10, 50, y],
  width: 80,
  height: 10,
  direction: "ltr",
  hasEOL: true,
});
function sourceDocument(fingerprint, filename) {
  return {
    source: { version: 1, sha256: fingerprint, filename, byteLength: 1000, pageCount: 2 },
    pages: [
      {
        page: 1,
        width: 600,
        height: 800,
        rotation: 0,
        items: [
          textItem(1, 0, "Pancakes", 700),
          textItem(1, 1, "100 g flour", 600),
          textItem(1, 2, "Mix and fry.", 500),
        ],
      },
      {
        page: 2,
        width: 600,
        height: 800,
        rotation: 0,
        items: [textItem(2, 0, "Soup", 700), textItem(2, 1, "200 ml water", 600)],
      },
    ],
  };
}
const modelRecipes = {
  1: {
    version: 2,
    sourceStart: { page: 1, itemIndex: 0 },
    pages: [1],
    title: "Pancakes",
    category: "breakfast",
    sourceCategory: null,
    ingredientGroups: [
      { label: null, ingredients: [{ name: "flour", quantity: "100", unit: "g", sourceText: "100 g flour" }] },
    ],
    instructions: ["Mix and fry."],
    servings: null,
    footnotes: [],
    missingFieldReasons: [],
  },
  // Incomplete: no preparation in the source. It must never enter the collection.
  2: {
    version: 2,
    sourceStart: { page: 2, itemIndex: 0 },
    pages: [2],
    title: "Soup",
    category: "lunch",
    sourceCategory: null,
    ingredientGroups: [
      { label: null, ingredients: [{ name: "water", quantity: "200", unit: "ml", sourceText: "200 ml water" }] },
    ],
    instructions: [],
    servings: null,
    footnotes: [],
    missingFieldReasons: [{ code: "missing-instructions", fieldPath: "instructions" }],
  },
};
// Mocked provider behind the real reservation/dispatch/reconciliation ledger: no network, no paid call.
function mockRecognize({ fail = false, calls = [], title } = {}) {
  return (options) => {
    calls.push(options.batch.index);
    return dispatchWithSpendingControl({
      state: options.state,
      reservation: { ...options.reservation, maximumCostNanoUsd: 1000, pricing },
      dispatch: async () => {
        if (fail) throw new Error("provider-transport-error");
        return {
          value: {
            recipes: options.batch.corePages
              .map((page) => modelRecipes[page])
              .filter(Boolean)
              .map((recipe) => (title ? { ...recipe, title } : recipe)),
          },
          usage: { inputTokens: 10, outputTokens: 10 },
          outputDigest: digest("o"),
          reportId: randomUUID(),
        };
      },
    });
  };
}
function service(ownerId, options = {}) {
  return createValidationService({
    client: admin(),
    ownerId,
    apiKey: "unused-test-key",
    prepareBatches: async (source, pages) => createTextBatches(source, pages, { corePagesPerBatch: 1 }),
    recognize: mockRecognize(options),
  });
}
const roundTrip = (value) => JSON.parse(JSON.stringify(value));
// The browser chooses the import id before sending the text (idempotency key).
const createBody = (document, importId = randomUUID()) => roundTrip({ importId, ...document });
// Drives the same request bodies the browser panel sends.
async function processAll(svc, document) {
  const created = roundTrip(await svc.createImport(createBody(document)));
  const candidates = [];
  for (const entry of created.manifest.batches) {
    const batch = batchFromManifest(document.source, document.pages, entry);
    const result = roundTrip(await svc.processBatch(created.importId, roundTrip(batch)));
    candidates.push(...result.candidates);
  }
  const body = {
    manifestDigest: created.manifestDigest,
    candidates: candidates.map(({ batchIndex, candidateIndex, candidate }) => ({
      batchIndex,
      candidateIndex,
      candidate,
    })),
  };
  return { created, candidates, body };
}
async function signedIn(user) {
  const client = publicClient();
  const login = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  assert.ifError(login.error);
  return client;
}
async function ownRecipes(user) {
  const { data, error } = await (await signedIn(user)).from("recipes").select("*").order("source_start_page");
  assert.ifError(error);
  return data;
}
function sql(statement) {
  return supabase("db", "query", "--db-url", local.DB_URL, statement);
}

test("browser roles cannot call finalization RPCs or mutate recipes", async () => {
  const user = await createUser(`pdf-recipes-browser-${randomUUID()}@example.test`);
  const client = await signedIn(user);
  for (const caller of [publicClient(), client]) {
    for (const [name, parameters] of [
      ["create_pdf_validation_import", { p_owner_id: user.id, p_import_id: randomUUID() }],
      ["record_pdf_batch_result", { p_owner_id: user.id, p_import_id: randomUUID() }],
      ["finalize_pdf_validation_import", { p_owner_id: user.id, p_import_id: randomUUID() }],
      ["cancel_pdf_validation_import", { p_owner_id: user.id, p_import_id: randomUUID() }],
      ["get_pdf_validation_import", { p_owner_id: user.id, p_import_id: randomUUID() }],
    ])
      assert.ok((await caller.rpc(name, parameters)).error, name);
    const insert = await caller.from("recipes").insert({
      owner_id: user.id,
      file_fingerprint: sha(),
      source_start_page: 1,
      source_start_item: 0,
      import_id: randomUUID(),
      source_filename: "x.pdf",
      source_pages: [1],
      title: "x",
      category: "lunch",
      ingredient_groups: [{}],
      instructions: ["x"],
    });
    assert.ok(insert.error);
  }
});

test("finalization saves only complete candidates atomically, reads back per owner and replays safely", async () => {
  const user = await createUser(`pdf-recipes-a-${randomUUID()}@example.test`);
  const other = await createUser(`pdf-recipes-b-${randomUUID()}@example.test`);
  const svc = service(user.id);
  const document = sourceDocument(sha(), "summer.pdf");
  const { created, candidates, body } = await processAll(svc, document);
  assert.deepEqual(
    candidates.map((item) => [item.batchIndex, item.status]),
    [
      [0, "complete"],
      [1, "incomplete"],
    ],
  );
  // One active import per evaluator.
  await assert.rejects(svc.createImport(createBody(sourceDocument(sha(), "other.pdf"))), {
    code: "active-import-exists",
  });

  // Altered content, a missing candidate and a cross-account submission are rejected without writes.
  const altered = roundTrip(body);
  altered.candidates[0].candidate.ingredientGroups[0].ingredients[0].quantity = "1000";
  await assert.rejects(svc.finalize(created.importId, altered), { code: "payload-digest-mismatch" });
  await assert.rejects(svc.finalize(created.importId, { ...body, candidates: body.candidates.slice(0, 1) }), {
    code: "payload-digest-mismatch",
  });
  await assert.rejects(svc.finalize(created.importId, { ...body, manifestDigest: digest("x") }), {
    code: "manifest-mismatch",
  });
  await assert.rejects(service(other.id).finalize(created.importId, body), { code: "import-not-found" });
  assert.deepEqual(await ownRecipes(user), []);

  const first = await svc.finalize(created.importId, roundTrip(body));
  assert.equal(first.status, "committed");
  assert.deepEqual([first.saved, first.alreadySaved, first.pending], [1, 0, 1]);
  const rows = await ownRecipes(user);
  assert.deepEqual(
    rows.map((row) => row.id),
    first.savedIds,
  );
  assert.equal(rows[0].title, "Pancakes");
  assert.equal(rows[0].source_filename, "summer.pdf");
  assert.deepEqual(rows[0].source_pages, [1]);
  assert.equal(rows[0].ingredient_groups[0].ingredients[0].quantity, "100");
  assert.deepEqual(await ownRecipes(other), []);

  // A repeated request and a cancel after commit return the committed outcome; nothing is duplicated.
  assert.deepEqual(await svc.finalize(created.importId, roundTrip(body)), first);
  assert.deepEqual(await svc.cancel(created.importId), first);
  const status = await svc.status(created.importId);
  assert.equal(status.status, "committed");
  assert.deepEqual(status.outcome.savedIds, first.savedIds);
  assert.equal((await ownRecipes(user)).length, 1);
  await assert.rejects(service(other.id).status(created.importId), { code: "import-not-found" });

  // Another import's payload cannot replace this import's server-recorded validated result.
  const otherResult = service(user.id, { title: "Different pancakes" });
  const second = await processAll(otherResult, document);
  await assert.rejects(otherResult.finalize(second.created.importId, { ...second.body, candidates: body.candidates }), {
    code: "payload-digest-mismatch",
  });
  await otherResult.cancel(second.created.importId);
});

test("tampered batch input is rejected before any reservation", async () => {
  const user = await createUser(`pdf-recipes-tamper-${randomUUID()}@example.test`);
  const calls = [];
  const svc = service(user.id, { calls });
  const document = sourceDocument(sha(), "tamper.pdf");
  const created = roundTrip(await svc.createImport(createBody(document)));
  const batch = roundTrip(batchFromManifest(document.source, document.pages, created.manifest.batches[0]));
  const changedText = roundTrip(batch);
  changedText.pages[0].items[1].text = "900 g flour";
  await assert.rejects(svc.processBatch(created.importId, changedText), { code: "page-digest-mismatch" });
  const extraPage = roundTrip(batch);
  extraPage.corePages = [1, 2];
  await assert.rejects(svc.processBatch(created.importId, extraPage), { code: "invalid-batch-context" });
  assert.deepEqual(calls, []);
  const state = await admin().rpc("get_pdf_import_state", { p_owner_id: user.id, p_import_id: created.importId });
  assert.ifError(state.error);
  assert.deepEqual(state.data[0].batches, []);
  await svc.cancel(created.importId);
});

test("a complete extraction failure writes no recipes and keeps the possible charge held", async () => {
  const user = await createUser(`pdf-recipes-fail-${randomUUID()}@example.test`);
  const svc = service(user.id, { fail: true });
  const document = sourceDocument(sha(), "fail.pdf");
  const created = roundTrip(await svc.createImport(createBody(document)));
  const batch = batchFromManifest(document.source, document.pages, created.manifest.batches[0]);
  await assert.rejects(svc.processBatch(created.importId, roundTrip(batch)));
  const outcome = await svc.finalize(created.importId, { manifestDigest: created.manifestDigest, candidates: [] });
  assert.equal(outcome.status, "failed");
  assert.deepEqual([outcome.saved, outcome.alreadySaved, outcome.pending], [0, 0, 0]);
  assert.deepEqual(await ownRecipes(user), []);
  assert.equal((await scope(`import:${created.importId}`)).held_nano_usd, 1000);
});

test("a cancel that lands after the open check still prevents reservation and dispatch", async () => {
  const user = await createUser(`pdf-recipes-cancel-race-${randomUUID()}@example.test`);
  const document = sourceDocument(sha(), "cancel-race.pdf");
  let dispatched = 0;
  let importId;
  const svc = createValidationService({
    client: admin(),
    ownerId: user.id,
    apiKey: "unused-test-key",
    prepareBatches: async (source, pages) => createTextBatches(source, pages, { corePagesPerBatch: 1 }),
    // The service already checked the import is open; the user cancels before the reservation.
    recognize: async (options) => {
      await admin().rpc("cancel_pdf_validation_import", { p_owner_id: user.id, p_import_id: importId });
      return dispatchWithSpendingControl({
        state: options.state,
        reservation: { ...options.reservation, maximumCostNanoUsd: 1000, pricing },
        dispatch: async () => {
          dispatched++;
          throw new Error("must not dispatch");
        },
      });
    },
  });
  const created = roundTrip(await svc.createImport(createBody(document)));
  importId = created.importId;
  const batch = batchFromManifest(document.source, document.pages, created.manifest.batches[0]);
  await assert.rejects(svc.processBatch(importId, roundTrip(batch)), { code: "import-not-processing" });
  assert.equal(dispatched, 0);
  // No reservation was admitted: nothing is held or spent for this import, and no batch was claimed.
  const importScope = await admin().rpc("get_pdf_budget_scope", { p_scope_key: `import:${importId}` });
  assert.ifError(importScope.error);
  assert.ok(importScope.data.every((row) => Number(row.held_nano_usd) === 0 && Number(row.spent_nano_usd) === 0));
  const state = await admin().rpc("get_pdf_import_state", { p_owner_id: user.id, p_import_id: importId });
  assert.ifError(state.error);
  assert.ok(state.data[0].batches.every((entry) => !entry.reservationId && entry.status !== "dispatch-claimed"));
  assert.equal((await svc.status(importId)).status, "cancelled");
  assert.deepEqual(await ownRecipes(user), []);
});

test("a client-chosen import id recovers a lost create response and cannot be reused", async () => {
  const user = await createUser(`pdf-recipes-create-${randomUUID()}@example.test`);
  const other = await createUser(`pdf-recipes-create-other-${randomUUID()}@example.test`);
  const svc = service(user.id);
  const document = sourceDocument(sha(), "create.pdf");
  const importId = randomUUID();
  // A cancel sent before the create lands finds nothing and writes nothing.
  await assert.rejects(svc.cancel(importId), { code: "import-not-found" });
  const first = roundTrip(await svc.createImport(createBody(document, importId)));
  assert.equal(first.importId, importId);
  // The create response is "lost": retrying with the same id returns the same import, not a 409.
  const retried = roundTrip(await svc.createImport(createBody(document, importId)));
  assert.deepEqual([retried.importId, retried.manifestDigest], [importId, first.manifestDigest]);
  // The same id with different text, or from another account, is rejected.
  await assert.rejects(svc.createImport(createBody(sourceDocument(sha(), "create.pdf"), importId)), {
    code: "import-id-conflict",
  });
  await assert.rejects(service(other.id).createImport(createBody(sourceDocument(sha(), "x.pdf"), importId)), {
    code: "import-id-conflict",
  });
  await assert.rejects(svc.createImport({ ...createBody(document), importId: "not-a-uuid" }), {
    code: "invalid-request",
  });
  // The browser can always close the import by the id it chose, which frees the evaluator slot.
  assert.equal((await svc.cancel(importId)).status, "cancelled");
  const next = roundTrip(await svc.createImport(createBody(sourceDocument(sha(), "next.pdf"))));
  await svc.cancel(next.importId);
});

test("an import that expired before finalize saves nothing, even with valid content", async () => {
  const user = await createUser(`pdf-recipes-expired-${randomUUID()}@example.test`);
  const svc = service(user.id);
  const { created, body } = await processAll(svc, sourceDocument(sha(), "expired.pdf"));
  sql(
    `update public.pdf_imports set expires_at = clock_timestamp() - interval '1 second' where id = '${created.importId}'`,
  );
  const outcome = await svc.finalize(created.importId, body);
  assert.equal(outcome.status, "failed");
  assert.deepEqual([outcome.saved, outcome.alreadySaved], [0, 0]);
  assert.deepEqual(await ownRecipes(user), []);
  assert.equal((await svc.status(created.importId)).status, "failed");
});

test("concurrent finalize and cancel serialize on the import row", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = await createUser(`pdf-recipes-race-${randomUUID()}@example.test`);
    const svc = service(user.id);
    const { created, body } = await processAll(svc, sourceDocument(sha(), "race.pdf"));
    const [finalized, cancelled] = await Promise.allSettled([
      svc.finalize(created.importId, body),
      svc.cancel(created.importId),
    ]);
    assert.equal(finalized.status, "fulfilled");
    assert.equal(cancelled.status, "fulfilled");
    const status = await svc.status(created.importId);
    const rows = await ownRecipes(user);
    if (status.status === "committed") {
      assert.equal(rows.length, 1);
      assert.deepEqual(
        cancelled.value.savedIds,
        rows.map((row) => row.id),
      );
      assert.equal(finalized.value.status, "committed");
    } else {
      assert.equal(status.status, "cancelled");
      assert.equal(finalized.value.status, "cancelled");
      assert.deepEqual(rows, []);
    }
  }
});

test("a lost commit response is recovered by status without another model call", async () => {
  const user = await createUser(`pdf-recipes-lost-${randomUUID()}@example.test`);
  const calls = [];
  const svc = service(user.id, { calls });
  const { created, body } = await processAll(svc, sourceDocument(sha(), "lost.pdf"));
  const callsBefore = calls.length;
  await svc.finalize(created.importId, body); // Response "lost" by the client.
  const recovered = await svc.status(created.importId);
  assert.equal(recovered.status, "committed");
  assert.equal(recovered.outcome.saved, 1);
  assert.deepEqual(
    (await ownRecipes(user)).map((row) => row.id),
    recovered.outcome.savedIds,
  );
  assert.equal(calls.length, callsBefore);
});

test("identical bytes under a renamed file skip saved recipes and keep edits; other owners stay independent", async () => {
  const user = await createUser(`pdf-recipes-dedup-${randomUUID()}@example.test`);
  const other = await createUser(`pdf-recipes-dedup-other-${randomUUID()}@example.test`);
  const fingerprint = sha();
  const svc = service(user.id);
  const first = await processAll(svc, sourceDocument(fingerprint, "original.pdf"));
  const committed = await svc.finalize(first.created.importId, first.body);
  assert.equal(committed.saved, 1);
  const [saved] = committed.savedIds;
  sql(`update public.recipes set title = 'Edited pancakes' where id = '${saved}'`);

  const renamed = await processAll(svc, sourceDocument(fingerprint, "renamed copy.pdf"));
  const again = await svc.finalize(renamed.created.importId, renamed.body);
  assert.deepEqual([again.saved, again.alreadySaved, again.pending], [0, 1, 1]);
  assert.deepEqual(again.existingIds, [saved]);
  const rows = await ownRecipes(user);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Edited pancakes");
  assert.equal(rows[0].source_filename, "original.pdf");

  // A later failed attempt on the same file never deletes earlier rows.
  const failing = service(user.id, { fail: true });
  const document = sourceDocument(fingerprint, "original.pdf");
  const failed = roundTrip(await failing.createImport(createBody(document)));
  await assert.rejects(
    failing.processBatch(
      failed.importId,
      roundTrip(batchFromManifest(document.source, document.pages, failed.manifest.batches[0])),
    ),
  );
  assert.equal((await ownRecipes(user)).length, 1);

  const independent = service(other.id);
  const otherImport = await processAll(independent, sourceDocument(fingerprint, "original.pdf"));
  const otherOutcome = await independent.finalize(otherImport.created.importId, otherImport.body);
  assert.deepEqual([otherOutcome.saved, otherOutcome.alreadySaved], [1, 0]);
  assert.notDeepEqual(otherOutcome.savedIds, [saved]);
  assert.equal((await ownRecipes(other))[0].title, "Pancakes");
  assert.equal((await ownRecipes(user))[0].title, "Edited pancakes");
});

test("benchmark recipe read-back is service-role only and scoped to owner and import", async () => {
  const user = await createUser(`pdf-benchmark-read-${randomUUID()}@example.test`);
  const other = await createUser(`pdf-benchmark-read-other-${randomUUID()}@example.test`);
  const svc = service(user.id);
  const { created, body } = await processAll(svc, sourceDocument(sha(), "benchmark.pdf"));
  const outcome = await svc.finalize(created.importId, body);
  const parameters = { p_owner_id: user.id, p_import_id: created.importId };
  const own = await admin().rpc("get_pdf_import_recipes", parameters);
  assert.ifError(own.error);
  assert.deepEqual(
    own.data.map((row) => row.id),
    outcome.savedIds,
  );
  assert.equal(own.data[0].ingredient_groups[0].ingredients[0].quantity, "100");
  const foreign = await admin().rpc("get_pdf_import_recipes", { ...parameters, p_owner_id: other.id });
  assert.ifError(foreign.error);
  assert.deepEqual(foreign.data, []);
  for (const caller of [publicClient(), await signedIn(user)])
    assert.ok((await caller.rpc("get_pdf_import_recipes", parameters)).error);
});

test("the f01 carry-over is service-role only, additive, once-only and leaves other scopes untouched", async () => {
  const carry = {
    p_spent_nano_usd: 4_228_657_500,
    p_held_nano_usd: 147_456_000,
    p_source_limit_nano_usd: 7_000_000_000,
    p_evidence_digest: digest("e"),
  };
  for (const caller of [publicClient(), await signedIn(owner)]) {
    assert.ok((await caller.rpc("carry_over_pdf_f01_budget", carry)).error);
    assert.ok((await caller.rpc("get_pdf_budget_carryover", { p_scope_key: "f01" })).error);
  }
  for (const invalid of [
    { ...carry, p_spent_nano_usd: -1 },
    { ...carry, p_spent_nano_usd: 0, p_held_nano_usd: 0 },
    { ...carry, p_evidence_digest: "not-a-digest" },
    { ...carry, p_spent_nano_usd: 7_000_000_001, p_held_nano_usd: 0 },
  ]) {
    const rejected = await admin().rpc("carry_over_pdf_f01_budget", invalid);
    assert.equal(rejected.error?.message, "invalid carry-over");
  }
  const none = await admin().rpc("get_pdf_budget_carryover", { p_scope_key: "f01" });
  assert.ifError(none.error);
  assert.deepEqual(none.data, []);

  const month = await reserve(
    admin(),
    request(owner.id, { p_maximum_cost_nano_usd: 10, p_accounting_time: "2036-01-01T00:00:00Z" }),
  );
  assert.ifError(month.error);
  const otherScopes = [await scope("month:2036-01"), await scope(`import:${month.data[0].import_id}`)];
  const before = await scope("f01");

  const applied = await admin().rpc("carry_over_pdf_f01_budget", carry);
  assert.ifError(applied.error);
  assert.equal(applied.data[0].applied, true);
  const after = await scope("f01");
  assert.equal(after.limit_nano_usd, 7_000_000_000);
  assert.equal(after.spent_nano_usd, before.spent_nano_usd + carry.p_spent_nano_usd);
  assert.equal(after.held_nano_usd, before.held_nano_usd + carry.p_held_nano_usd);
  assert.equal(
    after.limit_nano_usd - after.spent_nano_usd - after.held_nano_usd,
    before.limit_nano_usd -
      before.spent_nano_usd -
      before.held_nano_usd -
      carry.p_spent_nano_usd -
      carry.p_held_nano_usd,
  );
  assert.deepEqual([await scope("month:2036-01"), await scope(`import:${month.data[0].import_id}`)], otherScopes);

  // The identical replay is a no-op; any different second carry-over is refused.
  const replay = await admin().rpc("carry_over_pdf_f01_budget", carry);
  assert.ifError(replay.error);
  assert.equal(replay.data[0].applied, false);
  for (const second of [
    { ...carry, p_spent_nano_usd: 1 },
    { ...carry, p_evidence_digest: digest("d") },
  ])
    assert.equal((await admin().rpc("carry_over_pdf_f01_budget", second)).error?.message, "carry-over already applied");
  assert.deepEqual(await scope("f01"), after);

  const recorded = await admin().rpc("get_pdf_budget_carryover", { p_scope_key: "f01" });
  assert.ifError(recorded.error);
  assert.equal(Number(recorded.data[0].carried_spent_nano_usd), carry.p_spent_nano_usd);
  assert.equal(Number(recorded.data[0].carried_held_nano_usd), carry.p_held_nano_usd);
  assert.equal(Number(recorded.data[0].spent_before_nano_usd), before.spent_nano_usd);
  assert.equal(Number(recorded.data[0].held_before_nano_usd), before.held_nano_usd);
  assert.equal(recorded.data[0].evidence_digest, carry.p_evidence_digest);
  // Direct table access stays closed for every API role.
  assert.ok((await admin().from("pdf_budget_carryovers").select("*")).error);
});

test("the cumulative F-01 cap remains atomic across imports and months", async () => {
  const current = await scope("f01");
  let remaining = current.limit_nano_usd - current.spent_nano_usd - current.held_nano_usd;
  while (remaining > 2) {
    const amount = Math.min(500_000_000, remaining - 1);
    const admitted = await reserve(
      admin(),
      request(owner.id, {
        p_maximum_cost_nano_usd: amount,
        p_accounting_time: remaining % 2 === 0 ? "2027-04-01T00:00:00Z" : "2028-05-01T00:00:00Z",
      }),
    );
    assert.ifError(admitted.error);
    remaining -= amount;
  }
  assert.equal(remaining, 1);

  const [left, right] = await Promise.all([
    reserve(admin(), request(owner.id, { p_accounting_time: "2029-06-01T00:00:00Z" })),
    reserve(admin(), request(owner.id, { p_accounting_time: "2030-07-01T00:00:00Z" })),
  ]);
  assert.equal([left, right].filter((result) => !result.error).length, 1);
  assert.equal([left, right].filter((result) => result.error).length, 1);
  const full = await scope("f01");
  assert.equal(full.spent_nano_usd + full.held_nano_usd, 7_000_000_000);
});
