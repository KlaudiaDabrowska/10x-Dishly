import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { calculateCostNanoUsd } from "../src/lib/pdf-processing/budget.ts";

function supabase(...args) {
  return execFileSync("npx", ["--no-install", "supabase", ...args], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  supabase("db", "reset", "--local");
} catch (error) {
  const detail = error?.stderr?.toString().trim() || error?.message;
  throw new Error(`Local Supabase must be running before test:pdf:db. ${detail}`, { cause: error });
}

const local = JSON.parse(supabase("status", "-o", "json"));
const url = local.API_URL;
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
  assert.equal(global.limit_nano_usd, 5_000_000_000);
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
  assert.equal(full.spent_nano_usd + full.held_nano_usd, 5_000_000_000);
});
