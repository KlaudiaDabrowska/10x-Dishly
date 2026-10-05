import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createTextBatches } from "../src/lib/pdf-processing/batching.ts";
import { createImportState } from "../src/lib/pdf-processing/import-state.ts";
import {
  recognizePdfBatch,
  prepareOpenAiPdfBatches,
  createOpenAiPdfRequest,
  OPENAI_API,
  OPENAI_MODEL,
  OPENAI_PRICING,
  OPENAI_PRICING_VERSION,
  OPENAI_MAXIMUM_COST_NANO_USD,
} from "../src/lib/pdf-processing/openai.ts";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";
import {
  PDF_RECIPE_INSTRUCTIONS,
  PDF_RECIPE_RESPONSE_SCHEMA,
  PDF_RECIPE_SCHEMA_NAME,
} from "../src/lib/pdf-processing/prompt.ts";
import { reconcileCandidates } from "../src/lib/pdf-processing/reconcile.ts";
import { digestValidatedCandidate, validateRecipeCandidate } from "../src/lib/pdf-processing/validation.ts";
import { evaluateRecipes } from "./pdf-evaluate.mjs";

const FIXTURES = ["summer", "lunchboxy"];
const KNOWN_FIXTURES = [...FIXTURES, "pasta", "low-gi", "dietetyka-diagnostic"];
export const REVIEW_ROOT = fileURLToPath(new URL("../evaluation/validate-pdf-processing/", import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const digest = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (filename) => JSON.parse(readFileSync(filename, "utf8"));

class ReviewError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new ReviewError(code);
}
export function errorCode(error) {
  return typeof error?.code === "string" && /^[a-z][a-z0-9-]{0,99}$/.test(error.code) ? error.code : "review-failed";
}
export function parseReviewArgs(args) {
  if (args.length === 2 && args[0] === "--replay" && args[1] && !args[1].startsWith("--"))
    return { mode: "replay", runPath: args[1] };
  const preflight = args[0] === "--preflight";
  const selected = preflight ? args.slice(1) : args;
  requireThat(selected.length <= 1, "invalid-review-arguments");
  const value = selected[0] ?? "--all";
  requireThat(value === "--all" || KNOWN_FIXTURES.includes(value), "invalid-review-arguments");
  return { mode: preflight ? "preflight" : "live", fixtures: value === "--all" ? FIXTURES : [value] };
}
export function writePrivateJson(filename, value) {
  // Exclusive creation: partial evidence and earlier runs can never be overwritten.
  writeFileSync(filename, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
export function createRunDirectory(root, runId = randomUUID()) {
  requireThat(/^[a-zA-Z0-9-]{1,100}$/.test(runId), "invalid-run-id");
  const parent = path.join(root, "local/extraction-review");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = path.join(parent, runId);
  mkdirSync(directory, { mode: 0o700 });
  return { runId, directory };
}
function privateFile(root, relative) {
  requireThat(typeof relative === "string" && relative.startsWith("local/"), "invalid-fixture-path");
  const local = realpathSync(path.join(root, "local"));
  const resolved = realpathSync(path.resolve(root, relative));
  requireThat(resolved.startsWith(local + path.sep), "invalid-fixture-path");
  return resolved;
}
export function prepareReviewFixtures(root = REVIEW_ROOT, fixtureIds = FIXTURES) {
  const manifestBytes = readFileSync(path.join(root, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  requireThat(manifest.version === 1 && Array.isArray(manifest.fixtures), "invalid-fixture-manifest");
  return fixtureIds.map((id) => {
    const matches = manifest.fixtures.filter((entry) => entry.id === id);
    requireThat(matches.length === 1, "invalid-fixture-manifest");
    const fixture = matches[0];
    requireThat(fixture.expectation !== "accept-pending-reference", "reference-not-approved");
    requireThat(fixture.expectation === "accept", "fixture-not-accepted");
    requireThat(fixture.referencePath && fixture.referenceSha256, "reference-not-approved");
    const bytes = readFileSync(privateFile(root, fixture.localPath));
    requireThat(digest(bytes) === fixture.sha256 && bytes.length === fixture.byteLength, "fixture-hash-mismatch");
    const referenceBytes = readFileSync(privateFile(root, fixture.referencePath));
    requireThat(digest(referenceBytes) === fixture.referenceSha256, "reference-hash-mismatch");
    // Integrity/approval only. Expected recipes never enter the extraction path.
    const reference = JSON.parse(referenceBytes);
    requireThat(
      reference.review?.status === "approved" &&
        reference.review.approvedBy &&
        Number.isFinite(Date.parse(reference.review.approvedAt)) &&
        reference.fixtureId === id &&
        reference.sourceSha256 === fixture.sha256,
      "reference-not-approved",
    );
    const readerBytes = readFileSync(privateFile(root, "local/reader-built/" + id + ".json"));
    const reader = JSON.parse(readerBytes);
    const source = reader.result?.source;
    requireThat(
      reader.status === "ok" &&
        source?.version === 1 &&
        source.sha256 === fixture.sha256 &&
        source.byteLength === fixture.byteLength &&
        source.filename === fixture.filename &&
        source.pageCount === fixture.pageCount &&
        Array.isArray(reader.result.pages),
      "reader-source-mismatch",
    );
    const batches = createTextBatches(source, reader.result.pages);
    return {
      fixture,
      batches,
      source,
      pages: reader.result.pages,
      manifestDigest: digest(manifestBytes),
      readerDigest: digest(readerBytes),
    };
  });
}
function configuration() {
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "src/lib/pdf-processing",
      "scripts",
      "package.json",
      "package-lock.json",
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const codeFiles = [...new Set(files)]
    .sort()
    .map((name) => [name, digest(readFileSync(path.join(PROJECT_ROOT, name)))]);
  return {
    version: 2,
    model: OPENAI_MODEL,
    api: OPENAI_API,
    pricing: OPENAI_PRICING,
    pricingVersion: OPENAI_PRICING_VERSION,
    limits: PDF_LIMITS,
    schemaName: PDF_RECIPE_SCHEMA_NAME,
    promptDigest: digest(PDF_RECIPE_INSTRUCTIONS),
    schemaDigest: digest(JSON.stringify(PDF_RECIPE_RESPONSE_SCHEMA)),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim(),
    codeDigest: digest(JSON.stringify(codeFiles)),
    codeFiles,
  };
}
function localSupabase() {
  const status = JSON.parse(
    execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const url = status.API_URL;
  const key = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  requireThat(url && key && ["127.0.0.1", "localhost"].includes(new URL(url).hostname), "local-ledger-unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function readBudget(supabase) {
  const result = {};
  for (const scopeKey of ["f01", "month:" + new Date().toISOString().slice(0, 7)]) {
    const { data, error } = await supabase.rpc("get_pdf_budget_scope", { p_scope_key: scopeKey });
    requireThat(!error && Array.isArray(data), "ledger-read-failed");
    const row = data[0];
    if (!row) {
      requireThat(scopeKey !== "f01", "f01-ledger-missing");
      continue;
    }
    const scope = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, key.endsWith("_nano_usd") ? Number(value) : value]),
    );
    requireThat(
      ["limit_nano_usd", "spent_nano_usd", "held_nano_usd"].every(
        (key) => Number.isSafeInteger(scope[key]) && scope[key] >= 0,
      ),
      "invalid-budget-snapshot",
    );
    result[scopeKey] = scope;
  }
  return result;
}
export function assertReviewBudget(snapshot, prepared, selected) {
  const planned = prepared.filter(({ fixture }) => selected.includes(fixture.id));
  const selectedCalls = planned.reduce((sum, item) => sum + item.batches.length, 0);
  const finalMatrixCalls = prepared.reduce((sum, item) => sum + item.batches.length * 4, 0);
  const attemptMaximumNanoUsd = selectedCalls * OPENAI_MAXIMUM_COST_NANO_USD;
  const finalMatrixMaximumNanoUsd = finalMatrixCalls * OPENAI_MAXIMUM_COST_NANO_USD;
  requireThat(
    planned.every((item) => item.batches.length * OPENAI_MAXIMUM_COST_NANO_USD <= PDF_LIMITS.importBudgetNanoUsd),
    "import-budget-insufficient",
  );
  const f01 = snapshot.f01;
  requireThat(f01?.limit_nano_usd === PDF_LIMITS.f01BudgetNanoUsd, "f01-ledger-missing");
  const available = f01.limit_nano_usd - f01.spent_nano_usd - f01.held_nano_usd;
  requireThat(available >= attemptMaximumNanoUsd + finalMatrixMaximumNanoUsd, "f01-budget-insufficient");
  for (const [key, scope] of Object.entries(snapshot)) {
    if (key.startsWith("month:"))
      requireThat(
        scope.limit_nano_usd - scope.spent_nano_usd - scope.held_nano_usd >= attemptMaximumNanoUsd,
        "monthly-budget-insufficient",
      );
  }
  return {
    selectedCalls,
    finalMatrixCalls,
    attemptMaximumNanoUsd,
    finalMatrixMaximumNanoUsd,
    availableNanoUsd: available,
  };
}
export function compareExtraction(expected, actual, reconciliation, allBatchesCompleted, ledgerConfirmed = true) {
  const comparison = evaluateRecipes(expected, actual);
  const incompleteCount = reconciliation.candidates.filter((item) => item.status !== "complete").length;
  return {
    ok:
      comparison.ok &&
      allBatchesCompleted &&
      ledgerConfirmed &&
      reconciliation.invalidCount === 0 &&
      reconciliation.conflicts.length === 0 &&
      incompleteCount === 0,
    comparison,
    incompleteCount,
  };
}
export async function extractReviewFixture({
  prepared,
  ownerId,
  state,
  supabase,
  apiKey,
  directory,
  root = REVIEW_ROOT,
  recognize = recognizePdfBatch,
  now = Date.now,
  prepareBatches = prepareOpenAiPdfBatches,
  authorizeBatches = async () => undefined,
}) {
  const { fixture, source } = prepared;
  let batches = prepared.batches;
  const importId = randomUUID();
  const startedAt = now();
  const fixtureDir = path.join(directory, fixture.id);
  mkdirSync(fixtureDir, { mode: 0o700 });
  const validations = [];
  const responses = [];
  let failure = null;
  let ledgerBatches = [];
  let ledgerConfirmed = false;
  let countAttempt = 0;
  try {
    batches = await prepareBatches(source, prepared.pages, {
      apiKey,
      now,
      processingStartedAt: startedAt,
      onCountAttempt: (batch, attempt) => {
        countAttempt = attempt;
        writePrivateJson(path.join(fixtureDir, "count-" + attempt + "-input.json"), {
          batch,
          request: createOpenAiPdfRequest(batch),
        });
      },
      onInputCount: (measurement) =>
        writePrivateJson(path.join(fixtureDir, "count-" + countAttempt + "-result.json"), measurement),
    });
    await authorizeBatches(batches);
    for (const batch of batches) {
      requireThat(now() - startedAt < PDF_LIMITS.processingDeadlineMs, "processing-timeout");
      const request = createOpenAiPdfRequest(batch);
      const inputDigest = digest(JSON.stringify(batch));
      const batchStartedAt = now();
      writePrivateJson(path.join(fixtureDir, "batch-" + batch.index + "-input.json"), {
        batch,
        request,
        inputDigest,
        requestDigest: digest(JSON.stringify(request)),
      });
      const recognized = await recognize({
        apiKey,
        batch,
        state,
        now,
        processingStartedAt: startedAt,
        onProviderResponse: (response) =>
          writePrivateJson(path.join(fixtureDir, "batch-" + batch.index + "-response.json"), response),
        reservation: {
          importId,
          batchIndex: batch.index,
          fileFingerprint: source.sha256,
          manifestDigest: prepared.manifestDigest,
          inputDigest,
          corePageStart: batch.corePages[0],
          corePageEnd: batch.corePages.at(-1),
          expiresAt: new Date(startedAt + PDF_LIMITS.processingDeadlineMs).toISOString(),
        },
      });
      requireThat(!recognized.duplicate && recognized.value, "unexpected-duplicate-batch");
      const batchValidations = recognized.value.recipes.map((raw) => validateRecipeCandidate(raw, batch));
      const evidence = {
        batchIndex: batch.index,
        elapsedMs: now() - batchStartedAt,
        claim: recognized.claim,
        response: recognized.value,
        candidates: recognized.value.recipes.map((raw, candidateIndex) => ({
          candidateIndex,
          raw,
          validation: batchValidations[candidateIndex],
        })),
      };
      writePrivateJson(path.join(fixtureDir, "batch-" + batch.index + "-result.json"), evidence);
      responses.push(evidence);
      validations.push({ batchIndex: batch.index, validations: batchValidations });
    }
    requireThat(now() - startedAt <= PDF_LIMITS.processingDeadlineMs, "processing-timeout");
  } catch (error) {
    failure = errorCode(error);
  }
  try {
    const { data, error } = await supabase.rpc("get_pdf_import_state", { p_owner_id: ownerId, p_import_id: importId });
    requireThat(!error && Array.isArray(data), "ledger-read-failed");
    ledgerBatches = data[0]?.batches ?? [];
    ledgerConfirmed =
      ledgerBatches.length === batches.length && ledgerBatches.every((entry) => entry.status === "reconciled");
  } catch (error) {
    failure ??= errorCode(error);
  }
  const reconciliation = reconcileCandidates(validations);
  const actual = { recipes: reconciliation.candidates.map(({ candidate }) => candidate) };
  const expectedBytes = readFileSync(privateFile(root, fixture.referencePath));
  requireThat(digest(expectedBytes) === fixture.referenceSha256, "reference-hash-mismatch");
  const compared = compareExtraction(
    JSON.parse(expectedBytes),
    actual,
    reconciliation,
    !failure && responses.length === batches.length,
    ledgerConfirmed,
  );
  const recipeDigests = await Promise.all(
    reconciliation.candidates.map(async ({ candidate, batches: indices }) => ({
      sourceStart: candidate.sourceStart,
      batches: indices,
      digest: await digestValidatedCandidate({ candidate, ownerId, importId, batchIndex: indices[0] }),
    })),
  );
  const report = {
    version: 2,
    fixture: fixture.id,
    ownerId,
    importId,
    elapsedMs: now() - startedAt,
    failure,
    ...compared,
    actual,
    reconciliation,
    recipeDigests,
    ledgerBatches,
    completedBatches: responses.length,
    requiredBatches: batches.length,
  };
  writePrivateJson(path.join(fixtureDir, "report.json"), report);
  return report;
}
function summary(report) {
  return {
    fixture: report.fixture,
    ok: report.ok,
    failure: report.failure,
    elapsedMs: report.elapsedMs,
    batches: report.completedBatches,
    requiredBatches: report.requiredBatches,
    candidates: report.actual.recipes.length,
    invalidCandidates: report.reconciliation.invalidCount,
    incompleteCandidates: report.incompleteCount,
    conflicts: report.reconciliation.conflicts.length,
    comparison: report.comparison.counts,
  };
}
export function replayReview(runPath, root = REVIEW_ROOT) {
  const directory = realpathSync(runPath);
  const parent = realpathSync(path.join(root, "local/extraction-review"));
  requireThat(directory.startsWith(parent + path.sep), "invalid-replay-path");
  const run = readJson(path.join(directory, "run.json"));
  const completed = readJson(path.join(directory, "result.json"));
  requireThat(
    run.version === 2 &&
      completed.version === 2 &&
      run.runId === completed.runId &&
      completed.runDigest === digest(readFileSync(path.join(directory, "run.json"))) &&
      run.fixtures.length > 0,
    "incompatible-replay-run",
  );
  const results = [];
  for (const saved of run.fixtures) {
    const recorded = completed.results.find((item) => item.fixture === saved.fixture.id);
    if (!recorded) {
      results.push({ fixture: saved.fixture.id, ok: false, failure: "fixture-not-run" });
      continue;
    }
    const bytes = readFileSync(path.join(directory, saved.fixture.id, "report.json"));
    requireThat(digest(bytes) === recorded.reportDigest, "replay-artifact-mismatch");
    const report = JSON.parse(bytes);
    const expectedBytes = readFileSync(privateFile(root, saved.fixture.referencePath));
    requireThat(digest(expectedBytes) === saved.fixture.referenceSha256, "reference-hash-mismatch");
    const compared = compareExtraction(
      JSON.parse(expectedBytes),
      report.actual,
      report.reconciliation,
      !report.failure && report.completedBatches === report.requiredBatches,
      report.ledgerBatches.length === report.requiredBatches &&
        report.ledgerBatches.every((entry) => entry.status === "reconciled"),
    );
    results.push(summary({ ...report, ...compared }));
  }
  return { ok: !completed.failure && results.every((item) => item.ok), mode: "replay", runId: run.runId, results };
}
export async function runReview(args, dependencies = {}) {
  const options = parseReviewArgs(args); // Always before credentials, imports or network effects.
  const root = dependencies.root ?? REVIEW_ROOT;
  if (options.mode === "replay") return replayReview(options.runPath, root);
  const prepared = prepareReviewFixtures(root, options.fixtures);
  const supabase = (dependencies.localSupabase ?? localSupabase)();
  const before = await readBudget(supabase);
  const budget = assertReviewBudget(before, prepared, options.fixtures);
  if (options.mode === "preflight")
    return {
      ok: true,
      mode: "preflight",
      budget,
      before,
      fixtures: prepared.map(({ fixture, batches }) => ({ id: fixture.id, batches: batches.length })),
    };
  if (!process.env.OPENAI_API_KEY) loadEnvFile(path.join(PROJECT_ROOT, ".env"));
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  requireThat(apiKey, "provider-key-missing");
  const { runId, directory } = createRunDirectory(root);
  const config = configuration();
  writePrivateJson(path.join(directory, "run.json"), {
    version: 2,
    runId,
    startedAt: new Date().toISOString(),
    config,
    configDigest: digest(JSON.stringify(config)),
    budget,
    budgetBefore: before,
    fixtures: prepared
      .filter(({ fixture }) => options.fixtures.includes(fixture.id))
      .map(({ fixture, manifestDigest, readerDigest }) => ({ fixture, manifestDigest, readerDigest })),
  });
  const results = [];
  let failure = null;
  let after = null;
  try {
    const ownerId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: ownerId,
      email: "pdf-extract-review-" + ownerId + "@example.invalid",
      email_confirm: true,
    });
    requireThat(!error, "review-owner-creation-failed");
    const state = createImportState(supabase, ownerId);
    for (const item of prepared.filter(({ fixture }) => options.fixtures.includes(fixture.id))) {
      const remainingFixtures = options.fixtures.filter((id) => !results.some((result) => result.fixture === id));
      const report = await extractReviewFixture({
        prepared: item,
        ownerId,
        state,
        supabase,
        apiKey,
        directory,
        root,
        authorizeBatches: async (batches) => {
          item.batches = batches;
          const budgetBeforeDispatch = await readBudget(supabase);
          const checked = assertReviewBudget(budgetBeforeDispatch, prepared, remainingFixtures);
          writePrivateJson(path.join(directory, item.fixture.id, "dispatch-budget.json"), {
            budgetBeforeDispatch,
            checked,
            batchCount: batches.length,
          });
        },
      });
      results.push({
        ...summary(report),
        reportDigest: digest(readFileSync(path.join(directory, item.fixture.id, "report.json"))),
      });
    }
  } catch (error) {
    failure = errorCode(error);
  }
  try {
    after = await readBudget(supabase);
  } catch (error) {
    failure ??= errorCode(error);
  }
  const ok = !failure && results.length === options.fixtures.length && results.every((item) => item.ok);
  const result = {
    version: 2,
    runId,
    ok,
    failure,
    results,
    budgetAfter: after,
    runDigest: digest(readFileSync(path.join(directory, "run.json"))),
  };
  writePrivateJson(path.join(directory, "result.json"), result);
  return { ...result, evidence: directory };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runReview(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: errorCode(error) }));
    process.exitCode = 1;
  }
}
