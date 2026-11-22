import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertProductBudget,
  errorCode,
  parseProductAcceptanceArgs,
  plannedCost,
  productAcceptanceSelfTest,
  recordFailures,
  runLiveProductAcceptance,
  runProductAcceptance,
  writePrivateRecord,
} from "./pdf-product-acceptance.mjs";

const revision = "a".repeat(40);

test("arguments require a pinned revision and an exact live cost approval", () => {
  assert.deepEqual(parseProductAcceptanceArgs(["--self-test"]), { mode: "self-test" });
  assert.deepEqual(parseProductAcceptanceArgs(["--preflight", "--revision", revision]), {
    mode: "preflight",
    revision,
  });
  assert.deepEqual(
    parseProductAcceptanceArgs(["--live", "--revision", revision, "--approved-max-nano-usd", "294912000"]),
    { mode: "live", revision, approvedMaxNanoUsd: 294_912_000 },
  );
  const identitySha256 = "a".repeat(64);
  assert.deepEqual(parseProductAcceptanceArgs(["--diagnostic-preflight", "--revision", revision]), {
    mode: "diagnostic-preflight",
    revision,
  });
  assert.deepEqual(
    parseProductAcceptanceArgs([
      "--diagnostic-live",
      "--revision",
      revision,
      "--approved-max-nano-usd",
      "294912000",
      "--approved-identity-sha256",
      identitySha256,
    ]),
    {
      mode: "diagnostic-live",
      revision,
      approvedMaxNanoUsd: 294_912_000,
      approvedIdentitySha256: identitySha256,
    },
  );
  for (const args of [
    [],
    ["--live", "--revision", revision],
    ["--preflight"],
    ["--preflight", "--revision", "main"],
    ["--preflight", "--revision", revision, "--approved-max-nano-usd", "1"],
    ["--diagnostic-live", "--revision", revision, "--approved-max-nano-usd", "294912000"],
    [
      "--diagnostic-live",
      "--revision",
      revision,
      "--approved-max-nano-usd",
      "294912000",
      "--approved-identity-sha256",
      "not-a-digest",
    ],
  ])
    assert.throws(() => parseProductAcceptanceArgs(args));
});

test("self-test plants every release acceptance failure without private content", async () => {
  const result = productAcceptanceSelfTest();
  assert.equal(result.ok, true);
  assert.equal(result.plantedFailures, 14);
  assert.deepEqual(await runProductAcceptance(["--self-test"]), result);
  assert.doesNotMatch(JSON.stringify(result), /ingredient|instruction|PRIVATE/u);
});

test("record validation rejects all required dishonest-success shapes", () => {
  const record = {
    identity: { approvedRevision: revision, head: revision, dirty: false },
    fixtureIdentity: {
      fixtureSha256: "f".repeat(64),
      sourceSha256: "x".repeat(64),
      referenceSha256: "r".repeat(64),
      approvedReferenceSha256: "r".repeat(64),
      readerSha256: "d".repeat(64),
      manifestSha256: "m".repeat(64),
    },
    expectedRecipes: 1,
    outcome: {
      status: "processing",
      readBack: false,
      pending: 1,
      saved: 0,
      alreadySaved: 1,
      persistedRows: 2,
      unresolvedDecisions: 1,
    },
    semanticBlocking: { ok: false },
    elapsedMs: 300_001,
    usage: { heldNanoUsd: 1 },
    unresolvedHolds: 1,
  };
  assert.deepEqual(recordFailures(record), [
    "fixture-hash-mismatch",
    "not-committed",
    "read-back-unconfirmed",
    "pending-decisions",
    "saved-count-mismatch",
    "persisted-count-mismatch",
    "semantic-mismatch",
    "elapsed-over-300s",
    "unreconciled-cost",
  ]);
});

test("planned cost covers exactly one attempt per fixture and respects import and month caps", () => {
  const plan = plannedCost([
    { fixture: { id: "summer" }, batches: [{}, {}] },
    { fixture: { id: "lunchboxy" }, batches: [{}] },
  ]);
  assert.equal(plan.calls, 3);
  assert.equal(plan.fixtures.length, 2);
  const monthKey = "month:" + new Date().toISOString().slice(0, 7);
  const accepted = assertProductBudget(
    { [monthKey]: { limit_nano_usd: plan.maximumNanoUsd, spent_nano_usd: 0, held_nano_usd: 0 } },
    plan,
  );
  assert.equal(accepted.monthlyAvailableNanoUsd, plan.maximumNanoUsd);
  assert.throws(
    () =>
      assertProductBudget(
        { [monthKey]: { limit_nano_usd: plan.maximumNanoUsd - 1, spent_nano_usd: 0, held_nano_usd: 0 } },
        plan,
      ),
    { code: "monthly-budget-insufficient" },
  );
});

test("preflight rejects missing fixtures and hash errors before service or provider access", async () => {
  for (const code of ["fixture-missing", "fixture-hash-mismatch"]) {
    const calls = [];
    await assert.rejects(
      runProductAcceptance(["--preflight", "--revision", revision], {
        prepareFixtures: () => {
          calls.push("fixtures");
          throw Object.assign(new Error(code), { code });
        },
        localServices: () => calls.push("services"),
        apiKey: "unused",
      }),
      (error) => errorCode(error) === code,
    );
    assert.deepEqual(calls, ["fixtures"]);
  }
});

test("diagnostic preflight binds only summer identity and rejects drift before dispatch", async () => {
  const summer = (manifestDigest = "m".repeat(64)) => ({
    fixture: { id: "summer", sha256: "f".repeat(64), referenceSha256: "r".repeat(64) },
    source: { sha256: "f".repeat(64) },
    manifestDigest,
    readerDigest: "d".repeat(64),
    batches: [{}, {}],
  });
  const calls = [];
  const maximumNanoUsd = 2 * 147_456_000;
  const dependencies = (prepared, head = revision) => ({
    prepareFixtures: (_root, fixtureIds) => {
      calls.push(["fixtures", [...fixtureIds]]);
      return prepared;
    },
    gitIdentity: () => ({ head, dirty: false }),
    localServices: () => ({ admin: {} }),
    readBudget: async () => ({
      [`month:${new Date().toISOString().slice(0, 7)}`]: {
        limit_nano_usd: maximumNanoUsd,
        spent_nano_usd: 0,
        held_nano_usd: 0,
      },
    }),
    endpointAvailable: async () => true,
    apiKey: "unused-test-key",
    codeDigest: () => "c".repeat(64),
    executeFixture: async () => {
      calls.push(["dispatch"]);
      throw new Error("must not dispatch");
    },
  });

  const preflight = await runProductAcceptance(
    ["--diagnostic-preflight", "--revision", revision],
    dependencies([summer()]),
  );
  assert.equal(preflight.mode, "diagnostic-preflight");
  assert.equal(preflight.maximumNanoUsd, maximumNanoUsd);
  assert.deepEqual(preflight.fixtures, [{ id: "summer", batches: 2 }]);
  assert.match(preflight.identitySha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(calls, [["fixtures", ["summer"]]]);

  await assert.rejects(
    runProductAcceptance(["--diagnostic-preflight", "--revision", revision], dependencies([summer()], "b".repeat(40))),
    { code: "revision-mismatch" },
  );
  await assert.rejects(
    runProductAcceptance(
      ["--diagnostic-preflight", "--revision", revision],
      dependencies([{ ...summer(), source: { sha256: "x".repeat(64) } }]),
    ),
    { code: "fixture-hash-mismatch" },
  );

  const liveArgs = (identity, maximum = maximumNanoUsd) => [
    "--diagnostic-live",
    "--revision",
    revision,
    "--approved-max-nano-usd",
    String(maximum),
    "--approved-identity-sha256",
    identity,
  ];
  await assert.rejects(
    runProductAcceptance(liveArgs(preflight.identitySha256), dependencies([summer("n".repeat(64))])),
    { code: "diagnostic-identity-mismatch" },
  );
  await assert.rejects(
    runProductAcceptance(liveArgs(preflight.identitySha256, maximumNanoUsd - 1), dependencies([summer()])),
    { code: "cost-approval-mismatch" },
  );
  assert.equal(
    calls.some(([event]) => event === "dispatch"),
    false,
  );
});

test("private records use exclusive creation and mode 0600", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "product-acceptance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "record.json");
  writePrivateRecord(filename, { ok: true });
  chmodSync(filename, 0o600);
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(filename, "utf8")), { ok: true });
  assert.throws(() => writePrivateRecord(filename, { ok: false }), { code: "EEXIST" });
});

test("a thrown mismatch writes one sanitized held-ledger failure record and stops the run", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "product-acceptance-failure-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const diagnosticId = "00000000-0000-4000-8000-000000000030";
  const prepared = ["summer", "lunchboxy"].map((id) => ({
    fixture: { id, sha256: "f".repeat(64), referenceSha256: "r".repeat(64) },
    source: { sha256: "f".repeat(64) },
    manifestDigest: "m".repeat(64),
    readerDigest: "d".repeat(64),
    batches: [{}],
  }));
  const calls = [];
  const maximumNanoUsd = 2 * 147_456_000;
  const result = await runLiveProductAcceptance(
    { revision, approvedMaxNanoUsd: maximumNanoUsd },
    {
      root,
      runId: "failure-run",
      prepareFixtures: () => prepared,
      gitIdentity: () => ({ head: revision, dirty: false }),
      localServices: () => ({ admin: {} }),
      readBudget: async () => ({
        [`month:${new Date().toISOString().slice(0, 7)}`]: {
          limit_nano_usd: maximumNanoUsd,
          spent_nano_usd: 0,
          held_nano_usd: 0,
        },
      }),
      endpointAvailable: async () => true,
      apiKey: "unused-test-key",
      codeDigest: () => "c".repeat(64),
      executeFixture: async ({ prepared: item }) => {
        calls.push(item.fixture.id);
        throw Object.assign(new Error("private.pdf; 200 ml private ingredient; secret-key; provider body"), {
          code: "input-token-accounting-mismatch",
          diagnosticId,
          cleanupStatus: "failed",
          failureState: {
            importStatus: "failed",
            batches: [
              {
                batchIndex: 0,
                status: "failed",
                reservationState: "dispatch-claimed",
                reservedCostNanoUsd: 147_456_000,
                actualCostNanoUsd: null,
                inputTokens: null,
                outputTokens: null,
                privateResponse: "provider body",
              },
            ],
          },
        });
      },
    },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["summer"]);
  assert.deepEqual(result.results, [
    {
      fixture: "summer",
      ok: false,
      failures: ["input-token-accounting-mismatch", "product-owner-cleanup-failed"],
      diagnosticId,
      heldNanoUsd: 147_456_000,
    },
  ]);
  const directory = path.join(root, "local/product-acceptance/failure-run");
  const failurePath = path.join(directory, "summer.failure.json");
  assert.equal(existsSync(path.join(directory, "summer.json")), false);
  assert.equal(existsSync(path.join(directory, "lunchboxy.json")), false);
  assert.equal(statSync(failurePath).mode & 0o777, 0o600);
  const record = JSON.parse(readFileSync(failurePath, "utf8"));
  assert.deepEqual(Object.keys(record).sort(), [
    "cleanupStatus",
    "diagnosticId",
    "error",
    "fixture",
    "importStatus",
    "kind",
    "ledgerBatches",
    "recordedAt",
    "version",
  ]);
  assert.deepEqual(record.ledgerBatches, [
    {
      batchIndex: 0,
      status: "failed",
      reservationState: "dispatch-claimed",
      reservedCostNanoUsd: 147_456_000,
      actualCostNanoUsd: null,
      inputTokens: null,
      outputTokens: null,
    },
  ]);
  assert.equal(record.importStatus, "failed");
  assert.equal(record.cleanupStatus, "failed");
  assert.doesNotMatch(JSON.stringify(record), /private\.pdf|200 ml|secret-key|provider body|privateResponse/u);
  assert.throws(() => writePrivateRecord(failurePath, record), { code: "EEXIST" });
});
