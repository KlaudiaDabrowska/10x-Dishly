import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MATRIX_BROWSERS,
  MATRIX_DEVICES,
  MATRIX_FIXTURES,
  REQUIRED_CELLS,
  benchmarkReport,
  buildCellRecord,
  buildRejectionRecord,
  cellFailures,
  classifyUserAgent,
  parseBenchmarkArgs,
  parseCellMetadata,
  parsePanelRecord,
  runBenchmark,
  runtimeConfiguration,
} from "./pdf-benchmark-report.mjs";
import { carryOver, carryOverPlan, parseCarryOverArgs, remoteTarget } from "./pdf-carry-over-f01.mjs";
import { digest } from "./pdf-extract-review.mjs";

const COMMIT = "a".repeat(40);
const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const LIMIT = 7_000_000_000;
const UA = {
  chrome: {
    desktop: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    phone:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/152.0 Mobile/15E148 Safari/604.1",
  },
  firefox: {
    desktop: "Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0",
    phone:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15",
  },
};

const entry = (name, quantity, unit) => ({ name, quantity, unit, sourceText: `${quantity} ${unit} ${name}` });
const goldenRecipe = (title) => ({
  title,
  category: "lunch",
  sourceCategory: null,
  pages: [4],
  ingredientGroups: [{ label: null, ingredients: [entry("PRIVATE_RICE", "100", "g")] }],
  instructions: ["PRIVATE_STEP"],
  servings: null,
  footnotes: [],
});
const golden = { recipes: [goldenRecipe("PRIVATE_A"), goldenRecipe("PRIVATE_B")] };
const row = (recipe, index) => ({
  id: `00000000-0000-4000-8000-00000000010${index}`,
  source_start_page: 4 + index,
  source_start_item: 0,
  source_pages: recipe.pages,
  title: recipe.title,
  category: recipe.category,
  source_category: recipe.sourceCategory,
  ingredient_groups: recipe.ingredientGroups,
  instructions: recipe.instructions,
  servings: recipe.servings,
  footnotes: recipe.footnotes,
});
const fixtureFor = (id) => ({
  id,
  sha256: digest(`bytes-${id}`),
  byteLength: 1000,
  pageCount: 12,
  referenceSha256: "r".repeat(64),
});

function panelRecord({ fixture = "lunchboxy", browser = "chrome", device = "desktop", importId, overrides = {} } = {}) {
  const fx = fixtureFor(fixture);
  return {
    kind: "dishly-pdf-run-record",
    version: 1,
    recordedAt: "2026-10-07T10:00:00.000Z",
    importId,
    stage: "done",
    error: null,
    source: { sha256: fx.sha256, byteLength: fx.byteLength, pageCount: fx.pageCount },
    batchCount: 2,
    timings: { readingMs: 500, recognizingMs: 60_000, savingMs: 900, totalMs: 61_400, batchMs: [30_000, 30_000] },
    outcome: { status: "committed", saved: 2, alreadySaved: 0, pending: 0, readBack: true },
    client: {
      userAgent: UA[browser][device],
      userAgentData: "unavailable",
      viewport: { width: 400, height: 800, devicePixelRatio: 3 },
      deviceMemoryGb: "unavailable",
      hardwareConcurrency: 8,
      jsHeap: "unavailable",
      longTasks: "unavailable",
    },
    build: "unavailable",
    ...overrides,
  };
}

const importIdFor = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function cell({
  fixture = "lunchboxy",
  browser = "chrome",
  device = "desktop",
  index = 1,
  panel = {},
  recipes,
  extra = {},
} = {}) {
  const importId = importIdFor(index);
  const fx = fixtureFor(fixture);
  const ledger = {
    batches: [0, 1].map((batchIndex) => ({
      batchIndex,
      status: "reconciled",
      inputTokens: 25_000,
      outputTokens: 4_000,
      actualCostNanoUsd: 36_750_000,
      reservedCostNanoUsd: 147_456_000,
      pricingSnapshot: { model: "gpt-5.4-mini" },
    })),
  };
  return buildCellRecord({
    panel: parsePanelRecord(panelRecord({ fixture, browser, device, importId, overrides: panel })),
    cell: parseCellMetadata({
      fixture,
      browser,
      device,
      "device-model": device === "phone" ? "iPhone 15 Pro Max" : "Linux desktop",
      os: device === "phone" ? "iOS 26.0" : "Ubuntu 24.04",
      "browser-version": "152.0",
      network: "home Wi-Fi",
      account: ACCOUNT,
      commit: COMMIT,
      responsive: "yes",
      crashed: "no",
    }),
    fixture: fx,
    golden,
    importRow: {
      import_id: importId,
      status: "committed",
      batch_count: 2,
      file_fingerprint: fx.sha256,
      created_at: "2026-10-07T10:00:00.000Z",
      results: [{ invalidCount: 0 }, { invalidCount: 0 }],
      outcome: { saved: 2, alreadySaved: 0, pending: 0, committedAt: "2026-10-07T10:01:00.000Z" },
    },
    ledger,
    recipes: recipes ?? golden.recipes.map(row),
    budget: { f01: { limit_nano_usd: LIMIT, spent_nano_usd: 4_500_000_000, held_nano_usd: 147_456_000 } },
    carryOver: {
      carried_spent_nano_usd: 4_228_657_500,
      carried_held_nano_usd: 147_456_000,
      evidence_digest: "e".repeat(64),
    },
    target: "remote",
    config: runtimeConfiguration(),
    git: { head: COMMIT, dirty: false },
    recordedAt: `2026-10-07T10:${String(index).padStart(2, "0")}:00.000Z`,
    ...extra,
  });
}

// The full browser × device matrix; the first-iteration requirement is checked separately below.
const ALL_CELLS = MATRIX_FIXTURES.flatMap((fixture) =>
  MATRIX_BROWSERS.flatMap((browser) => MATRIX_DEVICES.map((device) => `${fixture}/${browser}/${device}`)),
);

function fullMatrix() {
  let index = 0;
  return MATRIX_FIXTURES.flatMap((fixture) =>
    MATRIX_BROWSERS.flatMap((browser) =>
      MATRIX_DEVICES.map((device) => cell({ fixture, browser, device, index: ++index })),
    ),
  );
}

const zeroSpend = { limit_nano_usd: LIMIT, spent_nano_usd: 4_500_000_000, held_nano_usd: 147_456_000 };
function rejection(fixture, error, overrides = {}) {
  return buildRejectionRecord({
    panel: parsePanelRecord(
      panelRecord({
        importId: null,
        overrides: { stage: "failed", error, batchCount: null, outcome: null, source: null, ...overrides },
      }),
    ),
    fixture,
    commit: COMMIT,
    budgetBefore: { f01: zeroSpend },
    budgetAfter: { f01: zeroSpend },
  });
}
const rejections = () => [rejection("over-page-limit", "too-many-pages"), rejection("oversized", "file-too-large")];

test("a complete clean matrix on one deployed commit passes and reports max/mean and confirmed vs held", () => {
  const result = benchmarkReport(fullMatrix(), rejections(), LIMIT, ALL_CELLS);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.ok, true);
  assert.equal(result.matrix.length, 8);
  assert.equal(result.elapsedMs.max, 61_400);
  assert.equal(result.elapsedMs.mean, 61_400);
  assert.equal(result.matrixUsage.confirmedNanoUsd, 8 * 2 * 36_750_000);
  assert.equal(result.f01.heldNanoUsd, 147_456_000);
  assert.equal(result.f01.availableNanoUsd, LIMIT - 4_500_000_000 - 147_456_000);
  // Operational output carries no recipe content.
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
});

test("each per-cell failure is rejected with its own code", () => {
  const cases = [
    ["slow run", { panel: { timings: { ...panelRecord().timings, totalMs: 300_001 } } }, "elapsed-over-300s"],
    [
      "deduplicated start",
      { panel: { outcome: { ...panelRecord().outcome, saved: 1, alreadySaved: 1 } } },
      "not-clean-start",
    ],
    [
      "unconfirmed read-back",
      { panel: { outcome: { ...panelRecord().outcome, readBack: false } } },
      "read-back-unconfirmed",
    ],
    ["failed import", { panel: { outcome: { ...panelRecord().outcome, status: "failed" } } }, "not-committed"],
    ["missing recipe", { recipes: [row(golden.recipes[0], 0)] }, "blocking-tier-failed"],
    [
      "wrong amount",
      {
        recipes: golden.recipes.map((recipe, index) =>
          row(
            { ...recipe, ingredientGroups: [{ label: null, ingredients: [entry("PRIVATE_RICE", "10", "g")] }] },
            index,
          ),
        ),
      },
      "blocking-tier-failed",
    ],
    [
      "other file",
      { panel: { source: { sha256: "0".repeat(64), byteLength: 1000, pageCount: 12 } } },
      "fixture-hash-mismatch",
    ],
    ["memory zero", { panel: { client: { ...panelRecord().client, deviceMemoryGb: 0 } } }, "invalid-run-record-client"],
    ["dirty tree", { extra: { git: { head: COMMIT, dirty: true } } }, "code-not-at-recorded-commit"],
    ["other commit", { extra: { git: { head: "b".repeat(40), dirty: false } } }, "code-not-at-recorded-commit"],
    ["no carry-over", { extra: { carryOver: null } }, "f01-history-not-carried-over"],
    [
      "held charge",
      {
        extra: {
          ledger: {
            batches: [
              {
                status: "dispatch-claimed",
                reservedCostNanoUsd: 147_456_000,
                pricingSnapshot: { model: "gpt-5.4-mini" },
              },
            ],
          },
        },
      },
      "unreconciled-charge",
    ],
    [
      "wrong browser",
      { browser: "firefox", panel: { client: { ...panelRecord().client, userAgent: UA.chrome.desktop } } },
      "browser-mismatch",
    ],
    [
      "desktop as phone",
      { device: "phone", panel: { client: { ...panelRecord().client, userAgent: UA.chrome.desktop } } },
      "device-class-mismatch",
    ],
  ];
  for (const [name, options, code] of cases) {
    let failures;
    try {
      failures = cellFailures(cell(options), LIMIT);
    } catch (error) {
      failures = [error.code];
    }
    assert.ok(failures.includes(code), `${name}: ${failures.join(",")}`);
  }
  assert.deepEqual(cellFailures(cell(), LIMIT), []);
  const attested = cell();
  attested.attested = { responsive: false, crashed: false };
  assert.ok(cellFailures(attested, LIMIT).includes("unresponsive-or-crashed"));
});

test("missing, duplicate and inconsistent matrices fail with explicit reasons", () => {
  const matrix = fullMatrix();
  const missing = benchmarkReport(matrix.slice(1), rejections(), LIMIT, ALL_CELLS);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.matrix[0].failures, ["missing"]);

  const duplicate = benchmarkReport([...matrix, cell({ index: 99 })], rejections(), LIMIT, ALL_CELLS);
  assert.ok(duplicate.matrix.some((entry) => entry.failures.includes("duplicate")));

  const mixedConfig = fullMatrix();
  mixedConfig[3].identity.configDigest = "c".repeat(64);
  assert.ok(benchmarkReport(mixedConfig, rejections(), LIMIT, ALL_CELLS).reasons.includes("config-mismatch"));

  const mixedCommit = fullMatrix();
  mixedCommit[2].identity.commit = "b".repeat(40);
  assert.ok(benchmarkReport(mixedCommit, rejections(), LIMIT, ALL_CELLS).reasons.includes("commit-mismatch"));

  const local = fullMatrix();
  local[0].target = "local";
  assert.ok(benchmarkReport(local, rejections(), LIMIT, ALL_CELLS).reasons.includes("not-deployed-target"));

  const overBudget = fullMatrix();
  overBudget.at(-1).recordedAt = "2026-10-08T00:00:00.000Z";
  overBudget.at(-1).budget.f01 = { limitNanoUsd: LIMIT, spentNanoUsd: 6_900_000_000, heldNanoUsd: 147_456_000 };
  assert.ok(benchmarkReport(overBudget, rejections(), LIMIT, ALL_CELLS).reasons.includes("f01-budget-exceeded"));

  assert.ok(benchmarkReport(fullMatrix(), [], LIMIT, ALL_CELLS).reasons.includes("rejection-check-failed"));
});

test("the first iteration requires only the two desktop Chrome cells (2026-10-08 amendment)", () => {
  assert.deepEqual(REQUIRED_CELLS, ["summer/chrome/desktop", "lunchboxy/chrome/desktop"]);
  const desktopChrome = fullMatrix().filter(
    (record) => record.cell.browser === "chrome" && record.cell.deviceClass === "desktop",
  );
  const passing = benchmarkReport(desktopChrome, rejections(), LIMIT);
  assert.deepEqual(passing.reasons, []);
  assert.equal(passing.matrix.length, 2);
  const missingLunchboxy = benchmarkReport(desktopChrome.slice(0, 1), rejections(), LIMIT);
  assert.ok(missingLunchboxy.reasons.includes("matrix-incomplete-or-failed"));
  // Deferred cells are not required, but a recorded one must still pass.
  const failingPhone = fullMatrix().find((record) => record.cell.deviceClass === "phone");
  failingPhone.timings.totalMs = 300_001;
  const withFailingPhone = benchmarkReport([...desktopChrome, failingPhone], rejections(), LIMIT);
  assert.ok(withFailingPhone.reasons.includes("matrix-incomplete-or-failed"));
  assert.ok(
    withFailingPhone.matrix
      .find((entry) => entry.cell === "summer/chrome/phone")
      .failures.includes("elapsed-over-300s"),
  );
  const passingPhone = fullMatrix().find((record) => record.cell.deviceClass === "phone");
  assert.deepEqual(benchmarkReport([...desktopChrome, passingPhone], rejections(), LIMIT).reasons, []);
});

test("rejection checks require the exact limit code, no import and an unchanged budget", () => {
  assert.equal(
    benchmarkReport(fullMatrix(), rejections(), LIMIT, ALL_CELLS).rejections.every((entry) => entry.ok),
    true,
  );
  const wrongCode = [rejection("over-page-limit", "file-too-large"), rejection("oversized", "file-too-large")];
  assert.deepEqual(benchmarkReport(fullMatrix(), wrongCode, LIMIT, ALL_CELLS).rejections[0].failures, [
    "unexpected-rejection-code",
  ]);
  const spent = rejections();
  spent[1].budgetAfter = { ...spent[1].budgetAfter, spentNanoUsd: spent[1].budgetAfter.spentNanoUsd + 1 };
  assert.deepEqual(benchmarkReport(fullMatrix(), spent, LIMIT, ALL_CELLS).rejections[1].failures, ["budget-changed"]);
  const created = [rejection("over-page-limit", "too-many-pages", { importId: importIdFor(50) }), rejections()[1]];
  assert.deepEqual(benchmarkReport(fullMatrix(), created, LIMIT, ALL_CELLS).rejections[0].failures, ["import-created"]);
});

test("run records accept only non-content fields and never a zero memory reading", () => {
  const raw = panelRecord({ importId: importIdFor(1), overrides: { recipes: ["PRIVATE"], filename: "private.pdf" } });
  const parsed = parsePanelRecord(raw);
  assert.equal("recipes" in parsed, false);
  assert.equal("filename" in parsed, false);
  assert.throws(() => parsePanelRecord({ ...raw, kind: "other" }), { code: "invalid-run-record" });
  for (const client of [
    { ...raw.client, jsHeap: { maxUsedBytes: 0, totalBytes: 0, limitBytes: 0 } },
    { ...raw.client, hardwareConcurrency: 0 },
  ])
    assert.throws(() => parsePanelRecord({ ...raw, client }), { code: "invalid-run-record-client" });
  assert.deepEqual(classifyUserAgent(UA.chrome.phone), { browser: "chrome", device: "phone" });
  assert.deepEqual(classifyUserAgent(UA.firefox.phone), { browser: "firefox", device: "phone" });
  assert.deepEqual(classifyUserAgent(UA.firefox.desktop), { browser: "firefox", device: "desktop" });
});

test("arguments and cell metadata are validated before any database access", () => {
  assert.deepEqual(parseBenchmarkArgs([]), { command: "report", options: {} });
  for (const args of [
    ["unknown"],
    ["report", "--x", "1"],
    ["record"],
    ["record", "--fixture"],
    ["record", "--fixture", "a", "--fixture", "b"],
  ])
    assert.throws(() => parseBenchmarkArgs(args), { code: "invalid-benchmark-arguments" });
  const base = {
    fixture: "summer",
    browser: "firefox",
    device: "phone",
    "device-model": "iPhone 15 Pro Max",
    os: "iOS 26.0",
    "browser-version": "150.0",
    network: "LTE",
    account: ACCOUNT,
    commit: COMMIT,
    responsive: "yes",
    crashed: "no",
  };
  assert.equal(parseCellMetadata(base).deviceClass, "phone");
  for (const [key, value, code] of [
    ["fixture", "pasta", "invalid-cell-fixture"],
    ["browser", "safari", "invalid-cell-browser"],
    ["device", "emulated", "invalid-cell-device"],
    ["account", "x", "invalid-cell-account"],
    ["commit", "abc", "invalid-cell-commit"],
    ["network", "", "invalid-cell-environment"],
    ["responsive", "maybe", "invalid-cell-attest"],
  ])
    assert.throws(() => parseCellMetadata({ ...base, [key]: value }), { code }, key);
});

test("record scores persisted rows against the pinned golden and writes a private non-content cell file", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "pdf-benchmark-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ["pdfs", "references", "reader-built"])
    mkdirSync(path.join(root, "local", dir), { recursive: true });
  const bytes = Buffer.from("synthetic lunchboxy");
  const sha256 = digest(bytes);
  writeFileSync(path.join(root, "local/pdfs/lunchboxy.pdf"), bytes);
  const reference = {
    fixtureId: "lunchboxy",
    sourceSha256: sha256,
    review: { status: "approved", approvedBy: "test", approvedAt: "2026-10-05" },
    recipes: golden.recipes,
  };
  const referenceBytes = JSON.stringify(reference);
  writeFileSync(path.join(root, "local/references/lunchboxy.json"), referenceBytes);
  const source = { version: 1, sha256, filename: "lunchboxy.pdf", byteLength: bytes.length, pageCount: 1 };
  const page = {
    page: 1,
    width: 100,
    height: 100,
    rotation: 0,
    items: [
      {
        anchor: { page: 1, itemIndex: 0 },
        text: "x",
        transform: [1, 0, 0, 1, 1, 1],
        width: 1,
        height: 1,
        direction: "ltr",
        hasEOL: false,
      },
    ],
  };
  writeFileSync(
    path.join(root, "local/reader-built/lunchboxy.json"),
    JSON.stringify({ status: "ok", result: { source, pages: [page] } }),
  );
  writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({
      version: 1,
      fixtures: [
        {
          id: "lunchboxy",
          filename: "lunchboxy.pdf",
          localPath: "local/pdfs/lunchboxy.pdf",
          sha256,
          byteLength: bytes.length,
          pageCount: 1,
          expectation: "accept",
          recipePages: [1],
          referencePath: "local/references/lunchboxy.json",
          referenceSha256: digest(referenceBytes),
        },
      ],
    }),
  );
  const importId = importIdFor(7);
  const run = panelRecord({ importId, overrides: { source: { sha256, byteLength: bytes.length, pageCount: 1 } } });
  const runFile = path.join(root, "run.json");
  writeFileSync(runFile, JSON.stringify(run));
  const calls = [];
  const client = {
    async rpc(name, parameters) {
      calls.push(name);
      if (name === "get_pdf_validation_import")
        return {
          data: [
            {
              import_id: parameters.p_import_id,
              status: "committed",
              batch_count: 1,
              file_fingerprint: sha256,
              created_at: "2026-10-07T10:00:00.000Z",
              results: [{ invalidCount: 0 }],
              outcome: { saved: 2, alreadySaved: 0, pending: 0, committedAt: "2026-10-07T10:01:00.000Z" },
            },
          ],
          error: null,
        };
      if (name === "get_pdf_import_state")
        return {
          data: [
            {
              batches: [
                {
                  status: "reconciled",
                  inputTokens: 1,
                  outputTokens: 1,
                  actualCostNanoUsd: 5,
                  pricingSnapshot: { model: "gpt-5.4-mini" },
                },
              ],
            },
          ],
          error: null,
        };
      if (name === "get_pdf_import_recipes") return { data: golden.recipes.map(row), error: null };
      if (name === "get_pdf_budget_scope")
        return parameters.p_scope_key === "f01"
          ? { data: [{ scope_key: "f01", limit_nano_usd: LIMIT, spent_nano_usd: 1, held_nano_usd: 0 }], error: null }
          : { data: [], error: null };
      if (name === "get_pdf_budget_carryover") return { data: [], error: null };
      return { data: null, error: { message: "unexpected" } };
    },
  };
  const result = await runBenchmark(
    [
      "record",
      "--run-record",
      runFile,
      "--fixture",
      "lunchboxy",
      "--browser",
      "chrome",
      "--device",
      "desktop",
      "--device-model",
      "Linux desktop",
      "--os",
      "Ubuntu",
      "--browser-version",
      "152",
      "--network",
      "Wi-Fi",
      "--account",
      ACCOUNT,
      "--commit",
      COMMIT,
      "--responsive",
      "yes",
      "--crashed",
      "no",
    ],
    { root, targetSupabase: () => ({ client, target: "local" }), gitState: () => ({ head: COMMIT, dirty: false }) },
  );
  assert.deepEqual(result.failures, []);
  assert.ok(!calls.some((name) => !name.startsWith("get_")), "record is read-only");
  const [file] = readdirSync(path.join(root, "local/benchmark/cells"));
  const full = path.join(root, "local/benchmark/cells", file);
  assert.equal(statSync(full).mode & 0o777, 0o600);
  const saved = readFileSync(full, "utf8");
  assert.doesNotMatch(saved, /PRIVATE_/);
  const stored = JSON.parse(saved);
  assert.equal(stored.blocking.ok, true);
  assert.equal(stored.outcome.persistedRows, 2);
  // A local record never satisfies the deployed matrix.
  const report = await runBenchmark(["report"], { root });
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("not-deployed-target"));
});

test("f01 carry-over is dry-run by default, targets only an explicit remote project and plans exact arithmetic", async (t) => {
  assert.deepEqual(parseCarryOverArgs([]), { apply: false });
  assert.deepEqual(parseCarryOverArgs(["--apply"]), { apply: true });
  assert.throws(() => parseCarryOverArgs(["--force"]), { code: "invalid-carry-over-arguments" });
  assert.throws(() => remoteTarget({}), { code: "target-credentials-missing" });
  assert.throws(
    () => remoteTarget({ PDF_TARGET_SUPABASE_URL: "http://example.supabase.co", PDF_TARGET_SUPABASE_SECRET_KEY: "k" }),
    {
      code: "target-url-not-https",
    },
  );
  assert.throws(
    () => remoteTarget({ PDF_TARGET_SUPABASE_URL: "https://127.0.0.1", PDF_TARGET_SUPABASE_SECRET_KEY: "k" }),
    {
      code: "target-is-local",
    },
  );

  const local = { f01: { limit_nano_usd: LIMIT, spent_nano_usd: 4_228_657_500, held_nano_usd: 147_456_000 } };
  const fresh = carryOverPlan(local, {});
  assert.deepEqual(fresh.targetAfter, {
    limitNanoUsd: LIMIT,
    spentNanoUsd: 4_228_657_500,
    heldNanoUsd: 147_456_000,
    availableNanoUsd: LIMIT - 4_228_657_500 - 147_456_000,
  });
  const used = carryOverPlan(local, { f01: { limit_nano_usd: LIMIT, spent_nano_usd: 10, held_nano_usd: 5 } });
  assert.deepEqual([used.targetAfter.spentNanoUsd, used.targetAfter.heldNanoUsd], [4_228_657_510, 147_456_005]);
  const replay = carryOverPlan(
    local,
    { f01: { limit_nano_usd: LIMIT, spent_nano_usd: 4_228_657_510, held_nano_usd: 147_456_005 } },
    {
      carried_spent_nano_usd: 4_228_657_500,
      carried_held_nano_usd: 147_456_000,
      evidence_digest: fresh.evidenceDigest,
    },
  );
  assert.equal(replay.alreadyApplied, true);
  assert.equal(replay.targetAfter.spentNanoUsd, 4_228_657_510);
  assert.throws(
    () =>
      carryOverPlan(
        local,
        {},
        { carried_spent_nano_usd: 1, carried_held_nano_usd: 0, evidence_digest: fresh.evidenceDigest },
      ),
    { code: "carry-over-already-applied-differently" },
  );
  assert.throws(
    () => carryOverPlan(local, { f01: { limit_nano_usd: LIMIT, spent_nano_usd: 3_000_000_000, held_nano_usd: 0 } }),
    {
      code: "carry-over-exceeds-limit",
    },
  );
  assert.throws(() => carryOverPlan({ f01: { ...local.f01, spent_nano_usd: 0, held_nano_usd: 0 } }, {}), {
    code: "nothing-to-carry",
  });

  // A dry run never calls the write RPC and its output is numeric/ID only.
  const root = mkdtempSync(path.join(tmpdir(), "pdf-carry-over-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const rpcCalls = [];
  const remoteClient = {
    async rpc(name, parameters) {
      rpcCalls.push(name);
      if (name === "get_pdf_budget_scope") return { data: parameters.p_scope_key === "f01" ? [] : [], error: null };
      if (name === "get_pdf_budget_carryover") return { data: [], error: null };
      return { data: null, error: { message: "unexpected" } };
    },
  };
  const localClient = {
    async rpc(_name, parameters) {
      return {
        data: parameters.p_scope_key === "f01" ? [{ scope_key: "f01", ...local.f01 }] : [],
        error: null,
      };
    },
  };
  const dry = await carryOver([], {
    root,
    remoteTarget: () => ({ host: "example.supabase.co", client: remoteClient }),
    localSupabase: () => localClient,
  });
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.applied, false);
  assert.ok(!rpcCalls.includes("carry_over_pdf_f01_budget"));
  assert.equal(statSync(dry.evidenceFile).mode & 0o777, 0o600);
});
