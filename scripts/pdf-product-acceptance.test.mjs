import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAX_ELAPSED_MS,
  assertProductBudget,
  errorCode,
  parseProductAcceptanceArgs,
  plannedCost,
  preflightFixtureFailures,
  productAcceptanceFailureRecord,
  productReport,
  productAcceptanceSelfTest,
  persistedRecipe,
  readProductBudget,
  recordFailures,
  runLiveProductAcceptance,
  runProductAcceptance,
  usageOf,
  writePrivateRecord,
} from "./pdf-product-acceptance.mjs";

const revision = "a".repeat(40);

function validRecord() {
  return {
    identity: { approvedRevision: revision, head: revision, dirty: false },
    fixtureIdentity: {
      fixtureSha256: "f".repeat(64),
      sourceSha256: "f".repeat(64),
      referenceSha256: "r".repeat(64),
      approvedReferenceSha256: "r".repeat(64),
      readerSha256: "d".repeat(64),
      manifestSha256: "m".repeat(64),
    },
    expectedRecipes: 2,
    outcome: {
      status: "committed",
      readBack: true,
      pending: 0,
      saved: 2,
      alreadySaved: 0,
      persistedRows: 2,
      unresolvedDecisions: 0,
    },
    semanticBlocking: { ok: true },
    elapsedMs: MAX_ELAPSED_MS,
    usage: { heldNanoUsd: 0 },
    unresolvedHolds: 0,
  };
}

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
  const invalid = [
    [[], "invalid-product-acceptance-arguments"],
    [["--self-test", "extra"], "invalid-product-acceptance-arguments"],
    [["--live", "--revision", revision], "cost-approval-required"],
    [["--preflight"], "invalid-product-acceptance-revision"],
    [["--preflight", "--revision", "main"], "invalid-product-acceptance-revision"],
    [["--preflight", "--revision"], "invalid-product-acceptance-arguments"],
    [["--preflight", "--unknown", revision], "invalid-product-acceptance-arguments"],
    [["--preflight", "--revision", "--live"], "invalid-product-acceptance-arguments"],
    [["--preflight", "--revision", revision, "--revision", revision], "invalid-product-acceptance-arguments"],
    [["--preflight", "--revision", revision, "--approved-max-nano-usd", "1"], "invalid-product-acceptance-arguments"],
    [["--live", "--revision", revision, "--approved-max-nano-usd", "0"], "cost-approval-required"],
    [["--live", "--revision", revision, "--approved-max-nano-usd", "-1"], "cost-approval-required"],
    [["--live", "--revision", revision, "--approved-max-nano-usd", "1.5"], "cost-approval-required"],
    [
      ["--live", "--revision", revision, "--approved-max-nano-usd", String(Number.MAX_SAFE_INTEGER + 1)],
      "cost-approval-required",
    ],
    [
      ["--live", "--revision", revision, "--approved-max-nano-usd", "1", "--approved-identity-sha256", identitySha256],
      "invalid-product-acceptance-arguments",
    ],
    [
      ["--diagnostic-live", "--revision", revision, "--approved-max-nano-usd", "294912000"],
      "diagnostic-identity-approval-required",
    ],
    [
      [
        "--diagnostic-live",
        "--revision",
        revision,
        "--approved-max-nano-usd",
        "294912000",
        "--approved-identity-sha256",
        "not-a-digest",
      ],
      "diagnostic-identity-approval-required",
    ],
  ];
  for (const [args, code] of invalid) assert.throws(() => parseProductAcceptanceArgs(args), { code });

  assert.equal(errorCode({ code: "budget-failed" }), "budget-failed");
  for (const error of [
    undefined,
    {},
    { code: 1 },
    { code: "" },
    { code: "-bad" },
    { code: "Bad" },
    { code: `a${"b".repeat(100)}` },
  ])
    assert.equal(errorCode(error), "product-acceptance-failed");
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

  assert.deepEqual(recordFailures(validRecord()), []);
  const cases = [
    ["dirty-revision", (value) => (value.identity.dirty = true)],
    ["revision-mismatch", (value) => (value.identity.head = "b".repeat(40))],
    [
      "fixture-identity-missing",
      (value) => {
        value.fixtureIdentity.referenceSha256 = "";
        value.fixtureIdentity.approvedReferenceSha256 = "";
      },
    ],
    ["fixture-hash-mismatch", (value) => (value.fixtureIdentity.referenceSha256 = "x".repeat(64))],
    ["not-committed", (value) => (value.outcome.status = "processing")],
    ["read-back-unconfirmed", (value) => (value.outcome.readBack = false)],
    ["pending-decisions", (value) => (value.outcome.pending = 1)],
    ["pending-decisions", (value) => (value.outcome.unresolvedDecisions = 1)],
    ["saved-count-mismatch", (value) => (value.outcome.alreadySaved = 1)],
    [
      "saved-count-mismatch",
      (value) => {
        value.outcome.saved = 1;
        value.outcome.persistedRows = 1;
      },
    ],
    ["persisted-count-mismatch", (value) => (value.outcome.persistedRows = 1)],
    ["semantic-mismatch", (value) => (value.semanticBlocking.ok = false)],
    ["elapsed-over-300s", (value) => (value.elapsedMs = MAX_ELAPSED_MS + 1)],
    ["unreconciled-cost", (value) => (value.usage.heldNanoUsd = 1)],
    ["unreconciled-cost", (value) => (value.unresolvedHolds = 1)],
  ];
  for (const [expected, mutate] of cases) {
    const value = validRecord();
    mutate(value);
    assert.deepEqual(recordFailures(value), [expected]);
  }
});

test("planned cost covers exactly one attempt per fixture and respects import and month caps", () => {
  const plan = plannedCost([
    { fixture: { id: "summer" }, batches: [{}, {}] },
    { fixture: { id: "lunchboxy" }, batches: [{}] },
  ]);
  assert.equal(plan.calls, 3);
  assert.deepEqual(plan.fixtures, [
    { id: "summer", batches: 2, maximumNanoUsd: 294_912_000 },
    { id: "lunchboxy", batches: 1, maximumNanoUsd: 147_456_000 },
  ]);
  assert.equal(plan.maximumNanoUsd, 442_368_000);
  const monthKey = "month:" + new Date().toISOString().slice(0, 7);
  const accepted = assertProductBudget(
    { [monthKey]: { limit_nano_usd: plan.maximumNanoUsd, spent_nano_usd: 0, held_nano_usd: 0 } },
    plan,
  );
  assert.equal(accepted.monthlyAvailableNanoUsd, plan.maximumNanoUsd);
  const withExistingUsage = assertProductBudget(
    {
      [monthKey]: {
        limit_nano_usd: plan.maximumNanoUsd + 30,
        spent_nano_usd: 10,
        held_nano_usd: 20,
      },
    },
    plan,
  );
  assert.equal(withExistingUsage.monthlyAvailableNanoUsd, plan.maximumNanoUsd);
  assert.throws(
    () =>
      assertProductBudget(
        { [monthKey]: { limit_nano_usd: plan.maximumNanoUsd - 1, spent_nano_usd: 0, held_nano_usd: 0 } },
        plan,
      ),
    { code: "monthly-budget-insufficient" },
  );
  assert.throws(
    () =>
      assertProductBudget(
        {},
        {
          calls: 1,
          maximumNanoUsd: 1,
          fixtures: [{ id: "oversized", batches: 1, maximumNanoUsd: 500_000_001 }],
        },
      ),
    { code: "import-budget-insufficient" },
  );
  assert.doesNotThrow(() =>
    assertProductBudget(
      { [monthKey]: { limit_nano_usd: 600_000_000, spent_nano_usd: 0, held_nano_usd: 0 } },
      {
        calls: 2,
        maximumNanoUsd: 500_000_001,
        fixtures: [
          { id: "at-limit", batches: 1, maximumNanoUsd: 500_000_000 },
          { id: "small", batches: 1, maximumNanoUsd: 1 },
        ],
      },
    ),
  );
  assert.throws(
    () =>
      assertProductBudget(
        {},
        {
          calls: 2,
          maximumNanoUsd: 500_000_002,
          fixtures: [
            { id: "small", batches: 1, maximumNanoUsd: 1 },
            { id: "oversized", batches: 1, maximumNanoUsd: 500_000_001 },
          ],
        },
      ),
    { code: "import-budget-insufficient" },
  );
});

test("product evidence maps persisted recipes and separates confirmed usage from held reservations", () => {
  const row = {
    title: "Soup",
    category: "dinner",
    source_category: "Obiad",
    source_pages: [3, 4],
    source_start_page: 3,
    source_start_item: 7,
    ingredient_groups: [{ label: null, entries: [] }],
    instructions: ["Cook"],
    servings: "2",
    footnotes: ["Note"],
  };
  assert.deepEqual(persistedRecipe(row), {
    title: "Soup",
    category: "dinner",
    sourceCategory: "Obiad",
    pages: [3, 4],
    sourceStart: { page: 3, itemIndex: 7 },
    ingredientGroups: [{ label: null, entries: [] }],
    instructions: ["Cook"],
    servings: "2",
    footnotes: ["Note"],
  });

  const ledger = {
    batches: [
      {
        status: "reconciled",
        inputTokens: 11,
        outputTokens: 5,
        actualCostNanoUsd: 70,
        reservedCostNanoUsd: 100,
      },
      {
        status: "dispatch-claimed",
        inputTokens: 13,
        outputTokens: 3,
        actualCostNanoUsd: null,
        reservedCostNanoUsd: 120,
      },
    ],
  };
  assert.deepEqual(usageOf(ledger), {
    inputTokens: 24,
    outputTokens: 8,
    confirmedNanoUsd: 70,
    heldNanoUsd: 120,
  });
  assert.deepEqual(usageOf(null), { inputTokens: 0, outputTokens: 0, confirmedNanoUsd: 0, heldNanoUsd: 0 });

  assert.deepEqual(
    productReport(
      { status: "committed", results: [{ invalidCount: 2 }, { invalidCount: 1 }], batch_count: 2 },
      ledger,
      [row],
    ),
    {
      failure: null,
      completedBatches: 2,
      requiredBatches: 2,
      ledgerBatches: ledger.batches,
      actual: { recipes: [persistedRecipe(row)] },
      reconciliation: { candidates: [{ status: "complete" }], invalidCount: 3, conflicts: [] },
    },
  );
  assert.deepEqual(productReport({ status: "failed", batch_count: 1 }, null, []).failure, "import-failed");
});

test("budget reader uses the current monthly scope and fails closed", async () => {
  const monthKey = "month:" + new Date().toISOString().slice(0, 7);
  const calls = [];
  const row = { limit_nano_usd: 10, spent_nano_usd: 2, held_nano_usd: 3 };
  assert.deepEqual(
    await readProductBudget({
      rpc: async (name, parameters) => {
        calls.push([name, parameters]);
        return { data: [row], error: null };
      },
    }),
    { [monthKey]: row },
  );
  assert.deepEqual(calls, [["get_pdf_budget_scope", { p_scope_key: monthKey }]]);
  assert.deepEqual(await readProductBudget({ rpc: async () => ({ data: [], error: null }) }), { [monthKey]: null });
  await assert.rejects(readProductBudget({ rpc: async () => ({ data: null, error: null }) }), {
    code: "ledger-read-failed",
  });
  await assert.rejects(readProductBudget({ rpc: async () => ({ data: [], error: new Error("db") }) }), {
    code: "ledger-read-failed",
  });
});

test("fixture preflight rejects foreign, duplicate and incomplete identities independently", () => {
  const fixture = (id) => ({
    fixture: { id, sha256: `${id}-pdf`, referenceSha256: `${id}-reference` },
    source: { sha256: `${id}-pdf` },
    manifestDigest: `${id}-manifest`,
    readerDigest: `${id}-reader`,
  });
  const valid = [fixture("summer"), fixture("lunchboxy")];
  assert.deepEqual(preflightFixtureFailures(valid), []);
  assert.deepEqual(preflightFixtureFailures([...valid, fixture("foreign")]), ["fixture-scope-mismatch"]);
  assert.deepEqual(preflightFixtureFailures([valid[0], valid[0], valid[1]]), ["fixture-missing"]);
  for (const mutate of [
    (value) => (value.fixture.sha256 = ""),
    (value) => (value.source.sha256 = "different"),
    (value) => (value.fixture.referenceSha256 = ""),
    (value) => (value.manifestDigest = ""),
    (value) => (value.readerDigest = ""),
  ]) {
    const prepared = valid.map(({ fixture: fixtureIdentity, source, ...rest }) => ({
      ...rest,
      fixture: { ...fixtureIdentity },
      source: { ...source },
    }));
    mutate(prepared[0]);
    assert.deepEqual(preflightFixtureFailures(prepared), ["fixture-hash-mismatch"]);
  }
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
  assert.match(readFileSync(filename, "utf8"), /\n$/u);
  assert.deepEqual(JSON.parse(readFileSync(filename, "utf8")), { ok: true });
  assert.throws(() => writePrivateRecord(filename, { ok: false }), { code: "EEXIST" });
});

test("failure records expose only allowlisted diagnostics and normalized ledger fields", () => {
  const diagnosticId = "00000000-0000-4000-8000-000000000031";
  const record = productAcceptanceFailureRecord(
    {
      code: "provider-failed",
      diagnosticId,
      cleanupStatus: "deleted",
      failureState: {
        importStatus: "failed",
        batches: [
          {
            batchIndex: 2,
            status: "failed",
            reservationState: "dispatch-claimed",
            reservedCostNanoUsd: 20,
            actualCostNanoUsd: 10,
            inputTokens: 7,
            outputTokens: 3,
            privateResponse: "must-not-leak",
          },
        ],
      },
      privateMessage: "must-not-leak",
    },
    "summer",
  );
  assert.equal(record.kind, "dishly-pdf-product-acceptance-failure");
  assert.equal(record.version, 1);
  assert.match(record.recordedAt, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(record.fixture, "summer");
  assert.equal(record.error, "provider-failed");
  assert.equal(record.diagnosticId, diagnosticId);
  assert.equal(record.importStatus, "failed");
  assert.equal(record.cleanupStatus, "deleted");
  assert.deepEqual(record.ledgerBatches, [
    {
      batchIndex: 2,
      status: "failed",
      reservationState: "dispatch-claimed",
      reservedCostNanoUsd: 20,
      actualCostNanoUsd: 10,
      inputTokens: 7,
      outputTokens: 3,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(record), /privateResponse|privateMessage|must-not-leak/u);

  const fallback = productAcceptanceFailureRecord(
    {
      code: "INVALID PRIVATE CODE",
      diagnosticId: "not-a-uuid",
      cleanupStatus: "unknown",
      failureState: { importStatus: 123, batches: "not-an-array" },
    },
    "lunchboxy",
  );
  assert.match(fallback.recordedAt, /^\d{4}-\d{2}-\d{2}T/u);
  assert.deepEqual(
    { ...fallback, recordedAt: "stable" },
    {
      kind: "dishly-pdf-product-acceptance-failure",
      version: 1,
      recordedAt: "stable",
      fixture: "lunchboxy",
      error: "product-acceptance-failed",
      diagnosticId: null,
      importStatus: null,
      ledgerBatches: [],
      cleanupStatus: "failed",
    },
  );
  assert.equal(productAcceptanceFailureRecord(undefined, "summer").error, "product-acceptance-failed");
});

test("successful live acceptance writes private evidence for every fixture and an exact summary", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "product-acceptance-success-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  chmodSync(root, 0o755);
  const parent = path.join(root, "local/product-acceptance");
  mkdirSync(parent, { recursive: true, mode: 0o755 });
  chmodSync(parent, 0o755);
  const prepared = ["summer", "lunchboxy"].map((id) => ({
    fixture: { id, sha256: "f".repeat(64), referenceSha256: "r".repeat(64) },
    source: { sha256: "f".repeat(64) },
    manifestDigest: "m".repeat(64),
    readerDigest: "d".repeat(64),
    batches: [{}],
  }));
  const maximumNanoUsd = 2 * 147_456_000;
  const calls = [];
  const dependencies = {
    root,
    runId: "success-run",
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
      const offset = calls.length;
      return {
        failures: [],
        record: {
          fixture: item.fixture.id,
          elapsedMs: 10 * offset,
          outcome: { saved: offset },
          usage: { confirmedNanoUsd: 100 * offset },
        },
      };
    },
  };

  const result = await runLiveProductAcceptance(
    { mode: "live", revision, approvedMaxNanoUsd: maximumNanoUsd },
    dependencies,
  );
  assert.deepEqual(calls, ["summer", "lunchboxy"]);
  assert.deepEqual(result, {
    ok: true,
    mode: "live",
    runId: "success-run",
    revision,
    results: [
      { fixture: "summer", ok: true, failures: [], elapsedMs: 10, saved: 1, confirmedNanoUsd: 100 },
      { fixture: "lunchboxy", ok: true, failures: [], elapsedMs: 20, saved: 2, confirmedNanoUsd: 200 },
    ],
  });
  const directory = path.join(parent, "success-run");
  assert.equal(statSync(parent).mode & 0o777, 0o700);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  for (const id of ["summer", "lunchboxy"]) {
    const filename = path.join(directory, `${id}.json`);
    assert.equal(statSync(filename).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(filename, "utf8")).fixture, id);
  }
  assert.deepEqual(JSON.parse(readFileSync(path.join(directory, "result.json"), "utf8")), result);

  const diagnosticPreflight = await runProductAcceptance(["--diagnostic-preflight", "--revision", revision], {
    ...dependencies,
    prepareFixtures: () => prepared.slice(0, 1),
  });
  const diagnostic = await runLiveProductAcceptance(
    {
      mode: "diagnostic-live",
      revision,
      approvedMaxNanoUsd: 147_456_000,
      approvedIdentitySha256: diagnosticPreflight.identitySha256,
    },
    {
      ...dependencies,
      runId: "diagnostic-success-run",
      prepareFixtures: () => prepared.slice(0, 1),
    },
  );
  assert.equal(diagnostic.ok, true);
  assert.equal(diagnostic.mode, "diagnostic-live");
  assert.equal(diagnostic.results.length, 1);

  const reportedFailure = await runLiveProductAcceptance(
    { mode: "live", revision, approvedMaxNanoUsd: maximumNanoUsd },
    {
      ...dependencies,
      runId: "reported-failure-run",
      executeFixture: async ({ prepared: item }) => ({
        failures: item.fixture.id === "summer" ? ["semantic-mismatch"] : [],
        record: {
          fixture: item.fixture.id,
          elapsedMs: 1,
          outcome: { saved: 1 },
          usage: { confirmedNanoUsd: 1 },
        },
      }),
    },
  );
  assert.equal(reportedFailure.ok, false);
  assert.deepEqual(
    reportedFailure.results.map(({ fixture, ok, failures }) => ({ fixture, ok, failures })),
    [
      { fixture: "summer", ok: false, failures: ["semantic-mismatch"] },
      { fixture: "lunchboxy", ok: true, failures: [] },
    ],
  );

  const deletedCleanupFailure = await runLiveProductAcceptance(
    { mode: "live", revision, approvedMaxNanoUsd: maximumNanoUsd },
    {
      ...dependencies,
      runId: "deleted-cleanup-failure-run",
      executeFixture: async () => {
        throw Object.assign(new Error("failed"), {
          code: "provider-failed",
          cleanupStatus: "deleted",
          failureState: {
            batches: [
              { reservationState: "dispatch-claimed", reservedCostNanoUsd: 11 },
              { reservationState: "reserved", reservedCostNanoUsd: 13 },
            ],
          },
        });
      },
    },
  );
  assert.deepEqual(deletedCleanupFailure.results, [
    {
      fixture: "summer",
      ok: false,
      failures: ["provider-failed"],
      diagnosticId: null,
      heldNanoUsd: 11,
    },
  ]);
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
