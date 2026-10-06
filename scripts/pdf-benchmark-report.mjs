import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";
import { OPENAI_API, OPENAI_MODEL, OPENAI_PRICING, OPENAI_PRICING_VERSION } from "../src/lib/pdf-processing/openai.ts";
import {
  PDF_RECIPE_INSTRUCTIONS,
  PDF_RECIPE_RESPONSE_SCHEMA,
  PDF_RECIPE_SCHEMA_NAME,
} from "../src/lib/pdf-processing/prompt.ts";
import { scoreFixture } from "./pdf-acceptance.mjs";
import {
  REVIEW_ROOT,
  digest,
  errorCode,
  localSupabase,
  prepareReviewFixtures,
  privateFile,
  readBudget,
  writePrivateJson,
} from "./pdf-extract-review.mjs";

// Phase 6 final benchmark. `record` turns one panel run record plus operator-supplied cell metadata
// into a non-content cell record; `report` validates the eight-cell matrix. Recipe content is read
// only to score it against the pinned golden and never leaves this process: cell records keep
// codes, titles, indices, counts, timings, tokens and cost.
export const MATRIX_FIXTURES = ["summer", "lunchboxy"];
export const MATRIX_BROWSERS = ["chrome", "firefox"];
export const MATRIX_DEVICES = ["desktop", "phone"];
// Synthetic negative inputs. The 113-page low-gi ebook is within the 115-page limit since the
// 2026-10-05 amendment, so the page-limit check uses a >115-page file instead.
export const REJECTION_FIXTURES = ["over-page-limit", "oversized"];
export const MAX_ELAPSED_MS = PDF_LIMITS.endToEndDeadlineMs;
export const BENCHMARK_DIR = "local/benchmark";
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const UNAVAILABLE = "unavailable";

class BenchmarkError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new BenchmarkError(code);
}
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const nonNegative = (value) => Number.isSafeInteger(value) && value >= 0;
const label = (value, maximum = 120) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !/[\n\r]/.test(value);

// Deployed-behaviour identity. The operator checks out the deployed commit before recording.
export function runtimeConfiguration() {
  return {
    version: 1,
    model: OPENAI_MODEL,
    api: OPENAI_API,
    pricing: OPENAI_PRICING,
    pricingVersion: OPENAI_PRICING_VERSION,
    limits: PDF_LIMITS,
    schemaName: PDF_RECIPE_SCHEMA_NAME,
    promptDigest: digest(PDF_RECIPE_INSTRUCTIONS),
    schemaDigest: digest(JSON.stringify(PDF_RECIPE_RESPONSE_SCHEMA)),
  };
}

function gitState() {
  const git = (...args) => execFileSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD");
  const dirty =
    git("status", "--porcelain", "--", "src", "scripts", "supabase", "package.json", "package-lock.json") !== "";
  return { head, dirty };
}

// Browser label/device class as reported by the user agent. iOS browsers use CriOS/FxiOS tokens.
// Emulation can spoof these; the operator attests that phone cells ran on the real phone.
export function classifyUserAgent(userAgent) {
  const ua = String(userAgent ?? "");
  const browser = /FxiOS\/|Firefox\//.test(ua)
    ? "firefox"
    : /CriOS\/|Chrome\//.test(ua) && !/Edg[A-Z]?\/|OPR\//.test(ua)
      ? "chrome"
      : "other";
  const device = /iPhone|iPod|Android.*Mobile/.test(ua) ? "phone" : "desktop";
  return { browser, device };
}

const positiveOrUnavailable = (value) => value === UNAVAILABLE || (typeof value === "number" && value > 0);

// Accepts only the documented non-content fields of the panel's run record; anything else is dropped.
export function parsePanelRecord(raw) {
  requireThat(isRecord(raw) && raw.kind === "dishly-pdf-run-record" && raw.version === 1, "invalid-run-record");
  const { timings, client, source, outcome } = raw;
  requireThat(
    isRecord(timings) &&
      nonNegative(timings.totalMs) &&
      Array.isArray(timings.batchMs) &&
      timings.batchMs.every(nonNegative) &&
      ["readingMs", "recognizingMs", "savingMs"].every((key) => timings[key] === null || nonNegative(timings[key])),
    "invalid-run-record-timings",
  );
  requireThat(
    isRecord(client) &&
      label(client.userAgent, 1000) &&
      isRecord(client.viewport) &&
      positiveOrUnavailable(client.deviceMemoryGb) &&
      positiveOrUnavailable(client.hardwareConcurrency) &&
      (client.jsHeap === UNAVAILABLE ||
        (isRecord(client.jsHeap) && ["maxUsedBytes", "totalBytes", "limitBytes"].every((k) => client.jsHeap[k] > 0))) &&
      (client.longTasks === UNAVAILABLE ||
        (isRecord(client.longTasks) && ["count", "maxMs", "totalMs"].every((k) => nonNegative(client.longTasks[k])))),
    "invalid-run-record-client",
  );
  requireThat(source === null || (isRecord(source) && HEX_64.test(source.sha256)), "invalid-run-record-source");
  requireThat(raw.importId === null || UUID.test(raw.importId), "invalid-run-record-import");
  return {
    recordedAt: String(raw.recordedAt),
    importId: raw.importId,
    stage: String(raw.stage),
    error: raw.error === null ? null : String(raw.error),
    source: source && { sha256: source.sha256, byteLength: source.byteLength, pageCount: source.pageCount },
    batchCount: raw.batchCount ?? null,
    timings: {
      readingMs: timings.readingMs,
      recognizingMs: timings.recognizingMs,
      savingMs: timings.savingMs,
      totalMs: timings.totalMs,
      batchMs: [...timings.batchMs],
    },
    outcome: isRecord(outcome)
      ? {
          status: String(outcome.status),
          saved: Number(outcome.saved),
          alreadySaved: Number(outcome.alreadySaved),
          pending: Number(outcome.pending),
          readBack: outcome.readBack === true,
        }
      : null,
    client: {
      userAgent: client.userAgent,
      userAgentData: client.userAgentData ?? UNAVAILABLE,
      viewport: {
        width: Number(client.viewport.width),
        height: Number(client.viewport.height),
        devicePixelRatio: Number(client.viewport.devicePixelRatio),
      },
      deviceMemoryGb: client.deviceMemoryGb,
      hardwareConcurrency: client.hardwareConcurrency,
      jsHeap: client.jsHeap,
      longTasks: client.longTasks,
    },
  };
}

export function parseCellMetadata(options) {
  const cell = {
    fixture: options.fixture,
    browser: options.browser,
    deviceClass: options.device,
    deviceModel: options["device-model"],
    os: options.os,
    browserVersion: options["browser-version"],
    network: options.network,
    accountId: options.account,
    commit: options.commit,
    responsive: options.responsive,
    crashed: options.crashed,
  };
  requireThat(MATRIX_FIXTURES.includes(cell.fixture), "invalid-cell-fixture");
  requireThat(MATRIX_BROWSERS.includes(cell.browser), "invalid-cell-browser");
  requireThat(MATRIX_DEVICES.includes(cell.deviceClass), "invalid-cell-device");
  requireThat(
    [cell.deviceModel, cell.os, cell.browserVersion, cell.network].every((value) => label(value)),
    "invalid-cell-environment",
  );
  requireThat(UUID.test(cell.accountId ?? ""), "invalid-cell-account");
  requireThat(COMMIT.test(cell.commit ?? ""), "invalid-cell-commit");
  requireThat(["yes", "no"].includes(cell.responsive) && ["yes", "no"].includes(cell.crashed), "invalid-cell-attest");
  return { ...cell, responsive: cell.responsive === "yes", crashed: cell.crashed === "yes" };
}

// The scorer's report shape, built from persisted rows: only complete recipes are ever saved.
export function persistedReport(importRow, ledger, recipes) {
  const actual = {
    recipes: recipes.map((row) => ({
      title: row.title,
      category: row.category,
      sourceCategory: row.source_category,
      pages: row.source_pages,
      sourceStart: { page: row.source_start_page, itemIndex: row.source_start_item },
      ingredientGroups: row.ingredient_groups,
      instructions: row.instructions,
      servings: row.servings,
      footnotes: row.footnotes,
    })),
  };
  const ledgerBatches = Array.isArray(ledger?.batches) ? ledger.batches : [];
  return {
    failure: importRow.status === "committed" ? null : `import-${importRow.status}`,
    completedBatches: (importRow.results ?? []).length,
    requiredBatches: importRow.batch_count,
    ledgerBatches,
    actual,
    reconciliation: {
      candidates: actual.recipes.map(() => ({ status: "complete" })),
      invalidCount: (importRow.results ?? []).reduce((sum, result) => sum + Number(result.invalidCount ?? 0), 0),
      conflicts: [],
    },
  };
}

export function usageOf(ledger) {
  const usage = { inputTokens: 0, outputTokens: 0, confirmedNanoUsd: 0, heldNanoUsd: 0, models: [] };
  for (const batch of ledger?.batches ?? []) {
    usage.inputTokens += Number(batch.inputTokens ?? 0);
    usage.outputTokens += Number(batch.outputTokens ?? 0);
    if (batch.status === "reconciled") usage.confirmedNanoUsd += Number(batch.actualCostNanoUsd ?? 0);
    if (batch.status === "dispatch-claimed") usage.heldNanoUsd += Number(batch.reservedCostNanoUsd ?? 0);
    const model = batch.pricingSnapshot?.model;
    if (model && !usage.models.includes(model)) usage.models.push(model);
  }
  return usage;
}

const budgetNumbers = (scope) =>
  scope
    ? {
        limitNanoUsd: Number(scope.limit_nano_usd),
        spentNanoUsd: Number(scope.spent_nano_usd),
        heldNanoUsd: Number(scope.held_nano_usd),
      }
    : null;

export function buildCellRecord({
  panel,
  cell,
  fixture,
  golden,
  importRow,
  ledger,
  recipes,
  budget,
  carryOver,
  target,
  config,
  git,
  recordedAt = new Date().toISOString(),
}) {
  requireThat(panel.importId && importRow && importRow.import_id === panel.importId, "import-not-found");
  const report = persistedReport(importRow, ledger, recipes);
  const scored = scoreFixture(golden, report);
  const outcome = importRow.outcome ?? null;
  return {
    kind: "dishly-pdf-benchmark-cell",
    version: 1,
    recordedAt,
    cell: {
      fixture: cell.fixture,
      browser: cell.browser,
      deviceClass: cell.deviceClass,
      deviceModel: cell.deviceModel,
      os: cell.os,
      browserVersion: cell.browserVersion,
      network: cell.network,
    },
    accountId: cell.accountId,
    importId: panel.importId,
    target,
    identity: {
      commit: cell.commit,
      gitHead: git.head,
      dirty: git.dirty,
      configDigest: digest(JSON.stringify(config)),
      model: config.model,
      api: config.api,
      ledgerModels: usageOf(ledger).models,
    },
    fixtureIdentity: {
      id: fixture.id,
      sha256: fixture.sha256,
      byteLength: fixture.byteLength,
      pageCount: fixture.pageCount,
      referenceSha256: fixture.referenceSha256,
      runSourceSha256: panel.source?.sha256 ?? null,
      runSourceByteLength: panel.source?.byteLength ?? null,
      runSourcePageCount: panel.source?.pageCount ?? null,
      importFingerprint: importRow.file_fingerprint,
    },
    expectedRecipes: golden.recipes.length,
    outcome: {
      status: importRow.status,
      saved: outcome ? Number(outcome.saved) : 0,
      alreadySaved: outcome ? Number(outcome.alreadySaved) : 0,
      pending: outcome ? Number(outcome.pending) : 0,
      persistedRows: recipes.length,
      panelStatus: panel.outcome?.status ?? null,
      panelSaved: panel.outcome?.saved ?? null,
      panelAlreadySaved: panel.outcome?.alreadySaved ?? null,
      readBack: panel.outcome?.readBack === true,
      batchCount: importRow.batch_count,
      serverElapsedMs:
        outcome?.committedAt && importRow.created_at
          ? Date.parse(outcome.committedAt) - Date.parse(importRow.created_at)
          : null,
    },
    timings: panel.timings,
    client: panel.client,
    attested: { responsive: cell.responsive, crashed: cell.crashed },
    blocking: scored.blocking,
    reported: scored.reported,
    usage: usageOf(ledger),
    budget: {
      f01: budgetNumbers(budget.f01),
      carryOver: carryOver
        ? {
            carriedSpentNanoUsd: Number(carryOver.carried_spent_nano_usd),
            carriedHeldNanoUsd: Number(carryOver.carried_held_nano_usd),
            evidenceDigest: carryOver.evidence_digest,
          }
        : null,
    },
  };
}

export function buildRejectionRecord({ panel, fixture, budgetBefore, budgetAfter, commit, recordedAt }) {
  requireThat(REJECTION_FIXTURES.includes(fixture), "invalid-rejection-fixture");
  requireThat(COMMIT.test(commit ?? ""), "invalid-cell-commit");
  return {
    kind: "dishly-pdf-benchmark-rejection",
    version: 1,
    recordedAt: recordedAt ?? new Date().toISOString(),
    fixture,
    commit,
    stage: panel.stage,
    error: panel.error,
    importId: panel.importId,
    batchCount: panel.batchCount,
    budgetBefore: budgetNumbers(budgetBefore?.f01),
    budgetAfter: budgetNumbers(budgetAfter?.f01),
    client: { userAgent: panel.client.userAgent },
  };
}

export const cellKey = (cell) => `${cell.fixture}/${cell.browser}/${cell.deviceClass}`;

export function cellFailures(record, expectedLimitNanoUsd = PDF_LIMITS.f01BudgetNanoUsd) {
  const failures = [];
  const fail = (code) => failures.push(code);
  if (record.identity.dirty || record.identity.gitHead !== record.identity.commit) fail("code-not-at-recorded-commit");
  if (record.identity.ledgerModels.some((model) => model !== record.identity.model)) fail("ledger-model-mismatch");
  const fx = record.fixtureIdentity;
  if (
    fx.runSourceSha256 !== fx.sha256 ||
    fx.importFingerprint !== fx.sha256 ||
    fx.runSourceByteLength !== fx.byteLength ||
    fx.runSourcePageCount !== fx.pageCount
  )
    fail("fixture-hash-mismatch");
  const ua = classifyUserAgent(record.client.userAgent);
  if (ua.browser !== record.cell.browser) fail("browser-mismatch");
  if (ua.device !== record.cell.deviceClass) fail("device-class-mismatch");
  const outcome = record.outcome;
  if (outcome.status !== "committed" || outcome.panelStatus !== "committed") fail("not-committed");
  if (!outcome.readBack) fail("read-back-unconfirmed");
  if (outcome.alreadySaved !== 0 || outcome.panelAlreadySaved !== 0) fail("not-clean-start");
  if (outcome.saved !== record.expectedRecipes || outcome.panelSaved !== outcome.saved) fail("saved-count-mismatch");
  if (outcome.persistedRows !== outcome.saved) fail("persisted-count-mismatch");
  if (!record.blocking.ok) fail("blocking-tier-failed");
  if (!(record.timings.totalMs <= MAX_ELAPSED_MS)) fail("elapsed-over-300s");
  if (!record.attested.responsive || record.attested.crashed) fail("unresponsive-or-crashed");
  for (const key of ["deviceMemoryGb", "hardwareConcurrency"])
    if (!positiveOrUnavailable(record.client[key])) fail("memory-reported-as-zero");
  if (record.client.jsHeap !== UNAVAILABLE && !(record.client.jsHeap?.maxUsedBytes > 0))
    fail("memory-reported-as-zero");
  if (record.usage.heldNanoUsd !== 0) fail("unreconciled-charge");
  const f01 = record.budget.f01;
  if (!f01 || f01.limitNanoUsd !== expectedLimitNanoUsd) fail("f01-limit-mismatch");
  if (record.target === "remote" && !record.budget.carryOver) fail("f01-history-not-carried-over");
  return [...new Set(failures)];
}

export function rejectionFailures(record) {
  const failures = [];
  const expected = record.fixture === "over-page-limit" ? "too-many-pages" : "file-too-large";
  if (record.error !== expected) failures.push("unexpected-rejection-code");
  if (record.importId !== null || record.batchCount !== null) failures.push("import-created");
  const before = record.budgetBefore;
  const after = record.budgetAfter;
  if (!before || !after || before.spentNanoUsd !== after.spentNanoUsd || before.heldNanoUsd !== after.heldNanoUsd)
    failures.push("budget-changed");
  return failures;
}

export function benchmarkReport(cells, rejections = [], expectedLimitNanoUsd = PDF_LIMITS.f01BudgetNanoUsd) {
  const reasons = [];
  const required = MATRIX_FIXTURES.flatMap((fixture) =>
    MATRIX_BROWSERS.flatMap((browser) => MATRIX_DEVICES.map((deviceClass) => `${fixture}/${browser}/${deviceClass}`)),
  );
  const byKey = new Map();
  for (const record of cells) {
    const key = cellKey(record.cell);
    byKey.set(key, [...(byKey.get(key) ?? []), record]);
  }
  const matrix = required.map((key) => {
    const records = byKey.get(key) ?? [];
    if (records.length === 0) return { cell: key, ok: false, failures: ["missing"] };
    if (records.length > 1)
      return { cell: key, ok: false, failures: ["duplicate"], importIds: records.map((r) => r.importId) };
    const [record] = records;
    const failures = cellFailures(record, expectedLimitNanoUsd);
    return {
      cell: key,
      ok: failures.length === 0,
      failures,
      importId: record.importId,
      accountId: record.accountId,
      elapsedMs: record.timings.totalMs,
      saved: record.outcome.saved,
      blockingReasons: record.blocking.reasons.map((reason) => reason.code),
      reportedFieldDifferences: record.reported?.counts?.fieldDifferences ?? null,
      inputTokens: record.usage.inputTokens,
      outputTokens: record.usage.outputTokens,
      confirmedNanoUsd: record.usage.confirmedNanoUsd,
    };
  });
  for (const key of byKey.keys()) if (!required.includes(key)) reasons.push("unexpected-cell");
  if (matrix.some((entry) => !entry.ok)) reasons.push("matrix-incomplete-or-failed");
  if (new Set(cells.map((record) => record.identity.commit)).size > 1) reasons.push("commit-mismatch");
  if (new Set(cells.map((record) => record.identity.configDigest)).size > 1) reasons.push("config-mismatch");
  // The final matrix runs on the deployed Cloudflare/Supabase path, never the local stack.
  if (cells.some((record) => record.target !== "remote")) reasons.push("not-deployed-target");
  if (new Set(cells.map((record) => record.importId)).size !== cells.length) reasons.push("duplicate-import");

  const rejectionResults = REJECTION_FIXTURES.map((fixture) => {
    const records = rejections.filter((record) => record.fixture === fixture);
    if (records.length !== 1) return { fixture, ok: false, failures: [records.length ? "duplicate" : "missing"] };
    const failures = rejectionFailures(records[0]);
    return { fixture, ok: failures.length === 0, failures };
  });
  if (rejectionResults.some((entry) => !entry.ok)) reasons.push("rejection-check-failed");

  // F-01 usage including uncertain (held) charges, from the most recently recorded ledger snapshot.
  const latest = [...cells].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
  const f01 = latest?.budget.f01 ?? null;
  if (!f01) reasons.push("f01-snapshot-missing");
  else if (f01.limitNanoUsd !== expectedLimitNanoUsd || f01.spentNanoUsd + f01.heldNanoUsd > expectedLimitNanoUsd)
    reasons.push("f01-budget-exceeded");

  const elapsed = cells.map((record) => record.timings.totalMs);
  const sum = (field) => cells.reduce((total, record) => total + record.usage[field], 0);
  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    matrix,
    rejections: rejectionResults,
    elapsedMs: {
      max: elapsed.length ? Math.max(...elapsed) : null,
      mean: elapsed.length ? Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length) : null,
      limit: MAX_ELAPSED_MS,
    },
    matrixUsage: {
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      confirmedNanoUsd: sum("confirmedNanoUsd"),
      heldNanoUsd: sum("heldNanoUsd"),
    },
    f01: f01 && {
      ...f01,
      confirmedUsd: f01.spentNanoUsd / 1e9,
      heldUsd: f01.heldNanoUsd / 1e9,
      availableNanoUsd: f01.limitNanoUsd - f01.spentNanoUsd - f01.heldNanoUsd,
      carryOver: latest.budget.carryOver,
      snapshotRecordedAt: latest.recordedAt,
    },
  };
}

export function parseBenchmarkArgs(args) {
  const [command = "report", ...rest] = args;
  requireThat(["budget", "record", "record-rejection", "report"].includes(command), "invalid-benchmark-arguments");
  const options = {};
  requireThat(rest.length % 2 === 0, "invalid-benchmark-arguments");
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    requireThat(key.startsWith("--") && value !== undefined && !value.startsWith("--"), "invalid-benchmark-arguments");
    const name = key.slice(2);
    requireThat(!Object.hasOwn(options, name), "invalid-benchmark-arguments");
    options[name] = value;
  }
  const allowed = {
    record: [
      "run-record",
      "fixture",
      "browser",
      "device",
      "device-model",
      "os",
      "browser-version",
      "network",
      "account",
      "commit",
      "responsive",
      "crashed",
    ],
    "record-rejection": ["run-record", "fixture", "commit", "budget-before"],
    budget: [],
    report: [],
  }[command];
  requireThat(
    Object.keys(options).every((name) => allowed.includes(name)),
    "invalid-benchmark-arguments",
  );
  if (command === "record" || command === "record-rejection")
    requireThat(typeof options["run-record"] === "string", "invalid-benchmark-arguments");
  return { command, options };
}

// Explicit target only: PDF_TARGET_SUPABASE_URL/SECRET_KEY for the deployed project, else local.
export function targetSupabase(env = process.env, local = localSupabase) {
  const url = env.PDF_TARGET_SUPABASE_URL;
  const key = env.PDF_TARGET_SUPABASE_SECRET_KEY;
  if (!url && !key) return { client: local(), target: "local" };
  requireThat(url && key, "target-credentials-incomplete");
  const parsed = new URL(url);
  requireThat(parsed.protocol === "https:", "target-url-not-https");
  return {
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    target: "remote",
  };
}

async function rpcRows(client, name, parameters, code) {
  const { data, error } = await client.rpc(name, parameters);
  requireThat(!error && Array.isArray(data), code);
  return data;
}

function benchmarkDirectory(root, sub) {
  const directory = path.join(root, BENCHMARK_DIR, sub);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(path.join(root, BENCHMARK_DIR), 0o700);
  chmodSync(directory, 0o700);
  return directory;
}

const readJson = (filename) => JSON.parse(readFileSync(filename, "utf8"));

export async function recordCell(options, dependencies = {}) {
  const root = dependencies.root ?? REVIEW_ROOT;
  const cell = parseCellMetadata(options);
  const panel = parsePanelRecord(readJson(options["run-record"]));
  requireThat(panel.importId, "run-record-without-import");
  const [prepared] = prepareReviewFixtures(root, [cell.fixture]);
  const golden = JSON.parse(readFileSync(privateFile(root, prepared.fixture.referencePath)));
  const { client, target } = (dependencies.targetSupabase ?? targetSupabase)();
  const parameters = { p_owner_id: cell.accountId, p_import_id: panel.importId };
  const [importRow] = await rpcRows(client, "get_pdf_validation_import", parameters, "import-read-failed");
  requireThat(importRow, "import-not-found");
  const [ledger] = await rpcRows(client, "get_pdf_import_state", parameters, "ledger-read-failed");
  const recipes = await rpcRows(client, "get_pdf_import_recipes", parameters, "recipes-read-failed");
  const budget = await readBudget(client);
  const [carryOver] = await rpcRows(
    client,
    "get_pdf_budget_carryover",
    { p_scope_key: "f01" },
    "carryover-read-failed",
  );
  const record = buildCellRecord({
    panel,
    cell,
    fixture: prepared.fixture,
    golden,
    importRow,
    ledger,
    recipes,
    budget,
    carryOver: carryOver ?? null,
    target,
    config: runtimeConfiguration(),
    git: (dependencies.gitState ?? gitState)(),
  });
  const filename = path.join(
    benchmarkDirectory(root, "cells"),
    `${cell.fixture}-${cell.browser}-${cell.deviceClass}-${panel.importId}.json`,
  );
  writePrivateJson(filename, record);
  return {
    ok: cellFailures(record).length === 0,
    cell: cellKey(record.cell),
    failures: cellFailures(record),
    file: filename,
  };
}

export async function recordRejection(options, dependencies = {}) {
  const root = dependencies.root ?? REVIEW_ROOT;
  const panel = parsePanelRecord(readJson(options["run-record"]));
  requireThat(typeof options["budget-before"] === "string", "invalid-benchmark-arguments");
  const budgetBefore = readJson(options["budget-before"]);
  const { client } = (dependencies.targetSupabase ?? targetSupabase)();
  const budgetAfter = await readBudget(client);
  const record = buildRejectionRecord({
    panel,
    fixture: options.fixture,
    commit: options.commit,
    budgetBefore,
    budgetAfter,
  });
  const filename = path.join(benchmarkDirectory(root, "rejections"), `${record.fixture}-${Date.now()}.json`);
  writePrivateJson(filename, record);
  return {
    ok: rejectionFailures(record).length === 0,
    fixture: record.fixture,
    failures: rejectionFailures(record),
    file: filename,
  };
}

export function loadBenchmark(root = REVIEW_ROOT) {
  const read = (sub) => {
    const directory = path.join(root, BENCHMARK_DIR, sub);
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => readJson(path.join(directory, name)));
  };
  const cells = read("cells");
  const rejections = read("rejections");
  requireThat(
    cells.every((record) => record.kind === "dishly-pdf-benchmark-cell" && record.version === 1) &&
      rejections.every((record) => record.kind === "dishly-pdf-benchmark-rejection" && record.version === 1),
    "incompatible-benchmark-record",
  );
  return { cells, rejections };
}

// Snapshot taken immediately before a rejection check, so the check can prove zero spend.
export async function recordBudget(dependencies = {}) {
  const root = dependencies.root ?? REVIEW_ROOT;
  const { client, target } = (dependencies.targetSupabase ?? targetSupabase)();
  const budget = await readBudget(client);
  const filename = path.join(benchmarkDirectory(root, "budget"), `f01-${Date.now()}.json`);
  writePrivateJson(filename, budget);
  return { ok: true, target, f01: budgetNumbers(budget.f01), file: filename };
}

export async function runBenchmark(args, dependencies = {}) {
  const { command, options } = parseBenchmarkArgs(args);
  if (command === "budget") return recordBudget(dependencies);
  if (command === "record") return recordCell(options, dependencies);
  if (command === "record-rejection") return recordRejection(options, dependencies);
  const { cells, rejections } = loadBenchmark(dependencies.root ?? REVIEW_ROOT);
  return benchmarkReport(cells, rejections);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runBenchmark(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: errorCode(error) }));
    process.exitCode = 1;
  }
}
