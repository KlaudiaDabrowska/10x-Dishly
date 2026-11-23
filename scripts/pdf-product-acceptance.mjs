import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { executeClientImport } from "../src/lib/pdf-processing/client-import.ts";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";
import {
  OPENAI_API,
  OPENAI_MAXIMUM_COST_NANO_USD,
  OPENAI_MODEL,
  OPENAI_PRICING,
  OPENAI_PRICING_VERSION,
} from "../src/lib/pdf-processing/openai.ts";
import {
  PDF_RECIPE_INSTRUCTIONS,
  PDF_RECIPE_RESPONSE_SCHEMA,
  PDF_RECIPE_SCHEMA_NAME,
} from "../src/lib/pdf-processing/prompt.ts";
import { scoreFixture } from "./pdf-acceptance.mjs";
import { REVIEW_ROOT, digest, prepareReviewFixtures, privateFile } from "./pdf-extract-review.mjs";

export const PRODUCT_ACCEPTANCE_FIXTURES = ["summer", "lunchboxy"];
export const PRODUCT_DIAGNOSTIC_FIXTURES = ["summer"];
export const PRODUCT_ACCEPTANCE_ROOT = "local/product-acceptance";
export const MAX_ELAPSED_MS = PDF_LIMITS.endToEndDeadlineMs;
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class ProductAcceptanceError extends Error {
  constructor(code, options = {}) {
    super(code);
    this.code = code;
    if (UUID.test(options.diagnosticId ?? "")) this.diagnosticId = options.diagnosticId;
    if (options.failureState) this.failureState = options.failureState;
    if (["deleted", "failed"].includes(options.cleanupStatus)) this.cleanupStatus = options.cleanupStatus;
  }
}

function requireThat(condition, code) {
  if (!condition) throw new ProductAcceptanceError(code);
}

export function errorCode(error) {
  return typeof error?.code === "string" && /^[a-z][a-z0-9-]{0,99}$/.test(error.code)
    ? error.code
    : "product-acceptance-failed";
}

function positiveInteger(value) {
  return /^\d+$/u.test(value ?? "") && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

export function parseProductAcceptanceArgs(args) {
  if (args.length === 1 && args[0] === "--self-test") return { mode: "self-test" };
  const mode =
    {
      "--preflight": "preflight",
      "--live": "live",
      "--diagnostic-preflight": "diagnostic-preflight",
      "--diagnostic-live": "diagnostic-live",
    }[args[0]] ?? null;
  requireThat(mode, "invalid-product-acceptance-arguments");
  const rest = args.slice(1);
  requireThat(rest.length % 2 === 0, "invalid-product-acceptance-arguments");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    requireThat(
      ["--revision", "--approved-max-nano-usd", "--approved-identity-sha256"].includes(key) &&
        value &&
        !value.startsWith("--"),
      "invalid-product-acceptance-arguments",
    );
    const name = key.slice(2);
    requireThat(!Object.hasOwn(options, name), "invalid-product-acceptance-arguments");
    options[name] = value;
  }
  requireThat(COMMIT.test(options.revision ?? ""), "invalid-product-acceptance-revision");
  const live = mode === "live" || mode === "diagnostic-live";
  if (live) requireThat(positiveInteger(options["approved-max-nano-usd"]), "cost-approval-required");
  else requireThat(options["approved-max-nano-usd"] === undefined, "invalid-product-acceptance-arguments");
  if (mode === "diagnostic-live")
    requireThat(SHA256.test(options["approved-identity-sha256"] ?? ""), "diagnostic-identity-approval-required");
  else requireThat(options["approved-identity-sha256"] === undefined, "invalid-product-acceptance-arguments");
  return {
    mode,
    revision: options.revision,
    ...(live ? { approvedMaxNanoUsd: Number(options["approved-max-nano-usd"]) } : {}),
    ...(mode === "diagnostic-live" ? { approvedIdentitySha256: options["approved-identity-sha256"] } : {}),
  };
}

function localUrl(raw, code) {
  requireThat(raw, code);
  const url = new URL(raw);
  requireThat(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname), code);
  return url;
}

export function gitIdentity(run = execFileSync) {
  const git = (...args) => run("git", args, { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  return {
    head: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain", "--", "src", "scripts", "supabase", "package.json", "package-lock.json") !== "",
  };
}

function runtimeConfiguration() {
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

function codeDigest(run = execFileSync) {
  const names = run(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "src/lib/pdf-processing",
      "src/lib/pdf-import-api.ts",
      "src/pages/api/imports",
      "scripts",
      "package.json",
      "package-lock.json",
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  return digest(JSON.stringify(names.map((name) => [name, digest(readFileSync(path.join(PROJECT_ROOT, name)))])));
}

function localServices(run = execFileSync) {
  const status = JSON.parse(
    run("npx", ["--no-install", "supabase", "status", "-o", "json"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const supabaseUrl = localUrl(status.API_URL, "local-supabase-unavailable");
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  const publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  requireThat(secretKey && publicKey, "local-supabase-unavailable");
  return {
    supabaseUrl,
    secretKey,
    publicKey,
    admin: createClient(supabaseUrl.href, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

function availableNanoUsd(scope) {
  return scope ? Number(scope.limit_nano_usd) - Number(scope.spent_nano_usd) - Number(scope.held_nano_usd) : 0;
}

export async function readProductBudget(client) {
  const monthKey = "month:" + new Date().toISOString().slice(0, 7);
  const { data, error } = await client.rpc("get_pdf_budget_scope", { p_scope_key: monthKey });
  requireThat(!error && Array.isArray(data), "ledger-read-failed");
  return { [monthKey]: data[0] ?? null };
}

export function plannedCost(prepared) {
  const fixtures = prepared.map(({ fixture, batches }) => ({
    id: fixture.id,
    batches: batches.length,
    maximumNanoUsd: batches.length * OPENAI_MAXIMUM_COST_NANO_USD,
  }));
  return {
    calls: fixtures.reduce((sum, fixture) => sum + fixture.batches, 0),
    maximumNanoUsd: fixtures.reduce((sum, fixture) => sum + fixture.maximumNanoUsd, 0),
    fixtures,
  };
}

export function preflightFixtureFailures(prepared, fixtureIds = PRODUCT_ACCEPTANCE_FIXTURES) {
  const failures = [];
  if (prepared.some((item) => !fixtureIds.includes(item.fixture?.id))) failures.push("fixture-scope-mismatch");
  for (const id of fixtureIds) {
    const matches = prepared.filter((item) => item.fixture?.id === id);
    if (matches.length !== 1) {
      failures.push("fixture-missing");
      continue;
    }
    const [{ fixture, source, manifestDigest, readerDigest }] = matches;
    if (
      !fixture.sha256 ||
      fixture.sha256 !== source?.sha256 ||
      !fixture.referenceSha256 ||
      !manifestDigest ||
      !readerDigest
    )
      failures.push("fixture-hash-mismatch");
  }
  return [...new Set(failures)];
}

export function assertProductBudget(snapshot, plan) {
  requireThat(
    plan.fixtures.every((fixture) => fixture.maximumNanoUsd <= PDF_LIMITS.importBudgetNanoUsd),
    "import-budget-insufficient",
  );
  const monthKey = "month:" + new Date().toISOString().slice(0, 7);
  const month = snapshot[monthKey];
  const monthlyAvailable = month ? availableNanoUsd(month) : PDF_LIMITS.monthBudgetNanoUsd;
  requireThat(monthlyAvailable >= plan.maximumNanoUsd, "monthly-budget-insufficient");
  return { monthKey, monthlyAvailableNanoUsd: monthlyAvailable, ...plan };
}

async function endpointAvailable(baseUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    return response.status > 0;
  } catch {
    return false;
  }
}

export async function preflightProductAcceptance(options, dependencies = {}) {
  const root = dependencies.root ?? REVIEW_ROOT;
  const diagnostic = options.mode === "diagnostic-preflight" || options.mode === "diagnostic-live";
  const fixtureIds = diagnostic ? PRODUCT_DIAGNOSTIC_FIXTURES : PRODUCT_ACCEPTANCE_FIXTURES;
  const prepared = (dependencies.prepareFixtures ?? prepareReviewFixtures)(root, fixtureIds);
  const fixtureFailures = preflightFixtureFailures(prepared, fixtureIds);
  requireThat(fixtureFailures.length === 0, fixtureFailures[0]);
  const identity = (dependencies.gitIdentity ?? gitIdentity)();
  requireThat(!identity.dirty, "dirty-revision");
  requireThat(identity.head === options.revision, "revision-mismatch");
  const services = (dependencies.localServices ?? localServices)();
  const budgetSnapshot = await (dependencies.readBudget ?? readProductBudget)(services.admin);
  const budget = assertProductBudget(budgetSnapshot, plannedCost(prepared));
  const baseUrl = localUrl(
    dependencies.baseUrl ?? process.env.BASE_URL ?? "http://localhost:4321",
    "local-worker-unavailable",
  );
  requireThat(await (dependencies.endpointAvailable ?? endpointAvailable)(baseUrl), "local-worker-unavailable");
  if (!process.env.OPENAI_API_KEY) {
    try {
      loadEnvFile(path.join(PROJECT_ROOT, ".env"));
    } catch {
      // A missing env file is reported through the stable provider-key code below.
    }
  }
  requireThat((dependencies.apiKey ?? process.env.OPENAI_API_KEY)?.trim(), "provider-key-missing");
  const codeIdentity = (dependencies.codeDigest ?? codeDigest)();
  const configIdentity = digest(JSON.stringify(runtimeConfiguration()));
  const fixtures = prepared.map(({ fixture, batches, manifestDigest, readerDigest }) => ({
    id: fixture.id,
    batches: batches.length,
    fixtureSha256: fixture.sha256,
    referenceSha256: fixture.referenceSha256,
    manifestDigest,
    readerDigest,
  }));
  const identitySha256 = digest(
    JSON.stringify({ revision: identity.head, codeDigest: codeIdentity, configDigest: configIdentity, fixtures }),
  );
  return {
    ok: true,
    mode: diagnostic ? "diagnostic-preflight" : "preflight",
    revision: identity.head,
    codeDigest: codeIdentity,
    configDigest: configIdentity,
    identitySha256,
    budget,
    fixtures,
    prepared,
    services,
    baseUrl,
  };
}

function storeCookies(jar, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attributes] = raw.split(";");
    const [name, ...value] = pair.split("=");
    const expired = attributes.some((attribute) => {
      const [key, ...parts] = attribute.trim().split("=");
      if (key.toLowerCase() === "max-age") return Number(parts.join("=")) <= 0;
      if (key.toLowerCase() === "expires") return Date.parse(parts.join("=")) <= Date.now();
      return false;
    });
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), value.join("="));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function signIn(baseUrl, actor, fetchImpl) {
  const response = await fetchImpl(new URL("/api/auth/signin", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { Origin: baseUrl.origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: actor.email, password: actor.password }).toString(),
  });
  storeCookies(actor.jar, response);
  requireThat(response.status === 302 && actor.jar.size > 0, "product-owner-signin-failed");
}

function httpRequest(baseUrl, actor, fetchImpl) {
  return async (requestPath, init = {}, signal) => {
    let response;
    try {
      response = await fetchImpl(new URL(requestPath, baseUrl), {
        ...init,
        ...(signal ? { signal } : {}),
        redirect: "manual",
        headers: {
          Cookie: cookieHeader(actor.jar),
          Origin: baseUrl.origin,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      });
    } catch {
      throw new ProductAcceptanceError("product-http-failed");
    }
    storeCookies(actor.jar, response);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new ProductAcceptanceError("invalid-product-response");
    }
    if (!response.ok)
      throw new ProductAcceptanceError(typeof body?.error === "string" ? body.error : "product-http-failed", {
        diagnosticId: body?.diagnosticId,
      });
    return body;
  };
}

function ledgerBatchEvidence(batch) {
  return {
    batchIndex: Number.isSafeInteger(batch?.batchIndex) ? batch.batchIndex : null,
    status: typeof batch?.status === "string" ? batch.status : null,
    reservationState: typeof batch?.reservationState === "string" ? batch.reservationState : null,
    reservedCostNanoUsd: Number.isSafeInteger(batch?.reservedCostNanoUsd) ? batch.reservedCostNanoUsd : null,
    actualCostNanoUsd: Number.isSafeInteger(batch?.actualCostNanoUsd) ? batch.actualCostNanoUsd : null,
    inputTokens: Number.isSafeInteger(batch?.inputTokens) ? batch.inputTokens : null,
    outputTokens: Number.isSafeInteger(batch?.outputTokens) ? batch.outputTokens : null,
  };
}

async function readFailureState(admin, ownerId, importId) {
  try {
    const parameters = { p_owner_id: ownerId, p_import_id: importId };
    const [storedImport, storedLedger] = await Promise.all([
      admin.rpc("get_pdf_import", { ...parameters, p_channel: "product" }),
      admin.rpc("get_pdf_import_state", parameters),
    ]);
    return {
      importStatus:
        !storedImport.error && typeof storedImport.data?.[0]?.status === "string" ? storedImport.data[0].status : null,
      batches:
        !storedLedger.error && Array.isArray(storedLedger.data?.[0]?.batches)
          ? storedLedger.data[0].batches.map(ledgerBatchEvidence)
          : [],
    };
  } catch {
    return { importStatus: null, batches: [] };
  }
}

async function cleanupOwner(admin, ownerId) {
  try {
    const result = await admin.auth.admin.deleteUser(ownerId);
    return result?.error ? "failed" : "deleted";
  } catch {
    return "failed";
  }
}

export function productAcceptanceFailureRecord(error, fixture) {
  const state = error?.failureState;
  return {
    kind: "dishly-pdf-product-acceptance-failure",
    version: 1,
    recordedAt: new Date().toISOString(),
    fixture,
    error: errorCode(error),
    diagnosticId: UUID.test(error?.diagnosticId ?? "") ? error.diagnosticId : null,
    importStatus: typeof state?.importStatus === "string" ? state.importStatus : null,
    ledgerBatches: Array.isArray(state?.batches) ? state.batches.map(ledgerBatchEvidence) : [],
    cleanupStatus: ["deleted", "failed"].includes(error?.cleanupStatus) ? error.cleanupStatus : "failed",
  };
}

export function persistedRecipe(row) {
  return {
    title: row.title,
    category: row.category,
    sourceCategory: row.source_category,
    pages: row.source_pages,
    sourceStart: { page: row.source_start_page, itemIndex: row.source_start_item },
    ingredientGroups: row.ingredient_groups,
    instructions: row.instructions,
    servings: row.servings,
    footnotes: row.footnotes,
  };
}

export function usageOf(ledger) {
  const usage = { inputTokens: 0, outputTokens: 0, confirmedNanoUsd: 0, heldNanoUsd: 0 };
  for (const batch of ledger?.batches ?? []) {
    usage.inputTokens += Number(batch.inputTokens ?? 0);
    usage.outputTokens += Number(batch.outputTokens ?? 0);
    if (batch.status === "reconciled") usage.confirmedNanoUsd += Number(batch.actualCostNanoUsd ?? 0);
    if (batch.status !== "reconciled") usage.heldNanoUsd += Number(batch.reservedCostNanoUsd ?? 0);
  }
  return usage;
}

export function productReport(importRow, ledger, rows) {
  const recipes = rows.map(persistedRecipe);
  return {
    failure: importRow.status === "committed" ? null : `import-${importRow.status}`,
    completedBatches: (importRow.results ?? []).length,
    requiredBatches: importRow.batch_count,
    ledgerBatches: ledger?.batches ?? [],
    actual: { recipes },
    reconciliation: {
      candidates: recipes.map(() => ({ status: "complete" })),
      invalidCount: (importRow.results ?? []).reduce((sum, result) => sum + Number(result.invalidCount ?? 0), 0),
      conflicts: [],
    },
  };
}

export function recordFailures(record) {
  const failures = [];
  const fail = (code) => failures.push(code);
  if (record.identity.dirty) fail("dirty-revision");
  if (record.identity.head !== record.identity.approvedRevision) fail("revision-mismatch");
  if (
    !record.fixtureIdentity.fixtureSha256 ||
    !record.fixtureIdentity.sourceSha256 ||
    !record.fixtureIdentity.referenceSha256 ||
    !record.fixtureIdentity.approvedReferenceSha256 ||
    !record.fixtureIdentity.readerSha256 ||
    !record.fixtureIdentity.manifestSha256
  )
    fail("fixture-identity-missing");
  if (
    record.fixtureIdentity.fixtureSha256 !== record.fixtureIdentity.sourceSha256 ||
    record.fixtureIdentity.referenceSha256 !== record.fixtureIdentity.approvedReferenceSha256
  )
    fail("fixture-hash-mismatch");
  if (record.outcome.status !== "committed") fail("not-committed");
  if (!record.outcome.readBack) fail("read-back-unconfirmed");
  if (record.outcome.pending !== 0 || record.outcome.unresolvedDecisions !== 0) fail("pending-decisions");
  if (record.outcome.alreadySaved !== 0 || record.outcome.saved !== record.expectedRecipes)
    fail("saved-count-mismatch");
  if (record.outcome.persistedRows !== record.outcome.saved) fail("persisted-count-mismatch");
  if (!record.semanticBlocking.ok) fail("semantic-mismatch");
  if (!(record.elapsedMs <= MAX_ELAPSED_MS)) fail("elapsed-over-300s");
  if (record.usage.heldNanoUsd !== 0 || record.unresolvedHolds !== 0) fail("unreconciled-cost");
  return [...new Set(failures)];
}

export async function executeFixtureAcceptance({ prepared, preflight, dependencies = {} }) {
  const { admin } = preflight.services;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const ownerId = randomUUID();
  const importId = randomUUID();
  const actor = {
    id: ownerId,
    email: `pdf-product-acceptance-${ownerId}@example.invalid`,
    password: `Local-acceptance-${randomUUID()}!`,
    jar: new Map(),
  };
  const startedAt = Date.now();
  let completed;
  let failure;
  try {
    const created = await admin.auth.admin.createUser({
      id: ownerId,
      email: actor.email,
      password: actor.password,
      email_confirm: true,
    });
    requireThat(!created.error, "product-owner-creation-failed");
    await signIn(preflight.baseUrl, actor, fetchImpl);
    const result = await executeClientImport({
      apiBase: "/api/imports",
      file: {
        name: prepared.source.filename,
        size: prepared.source.byteLength,
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      signal: new globalThis.AbortController().signal,
      importId,
      read: async () => ({ source: prepared.source, pages: prepared.pages }),
      request: httpRequest(preflight.baseUrl, actor, fetchImpl),
      update: () => undefined,
    });
    const parameters = { p_owner_id: ownerId, p_import_id: importId };
    const [storedImport, storedLedger, storedRecipes] = await Promise.all([
      admin.rpc("get_pdf_import", { ...parameters, p_channel: "product" }),
      admin.rpc("get_pdf_import_state", parameters),
      admin
        .from("recipes")
        .select(
          "id,source_start_page,source_start_item,source_pages,title,category,source_category,ingredient_groups,instructions,servings,footnotes",
        )
        .eq("owner_id", ownerId)
        .eq("import_id", importId)
        .order("source_start_page")
        .order("source_start_item"),
    ]);
    requireThat(!storedImport.error && storedImport.data?.length === 1, "product-import-read-failed");
    requireThat(!storedLedger.error && storedLedger.data?.length === 1, "product-ledger-read-failed");
    requireThat(!storedRecipes.error, "product-recipes-read-failed");
    const importRow = storedImport.data[0];
    const ledger = storedLedger.data[0];
    const rows = storedRecipes.data ?? [];
    const referenceBytes = readFileSync(privateFile(dependencies.root ?? REVIEW_ROOT, prepared.fixture.referencePath));
    const reference = JSON.parse(referenceBytes);
    const scored = scoreFixture(reference, productReport(importRow, ledger, rows));
    const usage = usageOf(ledger);
    const outcome = result.outcome;
    const finalIdentity = (dependencies.gitIdentity ?? gitIdentity)();
    const record = {
      kind: "dishly-pdf-product-acceptance",
      version: 1,
      recordedAt: new Date().toISOString(),
      fixture: prepared.fixture.id,
      identity: {
        approvedRevision: preflight.revision,
        head: finalIdentity.head,
        dirty: finalIdentity.dirty,
        codeDigest: preflight.codeDigest,
        configDigest: preflight.configDigest,
      },
      fixtureIdentity: {
        fixtureSha256: prepared.fixture.sha256,
        sourceSha256: prepared.source.sha256,
        referenceSha256: prepared.fixture.referenceSha256,
        approvedReferenceSha256: digest(referenceBytes),
        readerSha256: prepared.readerDigest,
        manifestSha256: prepared.manifestDigest,
      },
      ownerId,
      importId,
      expectedRecipes: reference.recipes.length,
      outcome: {
        status: outcome.status,
        readBack: outcome.readBack,
        pending: outcome.pending,
        saved: outcome.saved,
        alreadySaved: outcome.alreadySaved,
        persistedRows: rows.length,
        unresolvedDecisions: (outcome.decisions ?? []).filter((item) => item.state === "pending").length,
      },
      semanticBlocking: { ok: scored.blocking.ok, reasons: scored.blocking.reasons.map((reason) => reason.code) },
      elapsedMs: Date.now() - startedAt,
      usage,
      unresolvedHolds: (ledger.batches ?? []).filter((batch) => batch.status !== "reconciled").length,
    };
    const failures = recordFailures(record);
    completed = { record, failures };
  } catch (error) {
    failure = error;
  }
  const failureState = failure ? await readFailureState(admin, ownerId, importId) : null;
  const cleanupStatus = await cleanupOwner(admin, ownerId);
  if (failure)
    throw new ProductAcceptanceError(errorCode(failure), {
      diagnosticId: failure.diagnosticId,
      failureState,
      cleanupStatus,
    });
  if (cleanupStatus === "failed")
    throw new ProductAcceptanceError("product-owner-cleanup-failed", {
      failureState: { importStatus: completed.record.outcome.status, batches: [] },
      cleanupStatus,
    });
  return completed;
}

export function writePrivateRecord(filename, value) {
  writeFileSync(filename, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

function createEvidenceDirectory(root, runId = randomUUID()) {
  const parent = path.join(root, PRODUCT_ACCEPTANCE_ROOT);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o700);
  const directory = path.join(parent, runId);
  mkdirSync(directory, { mode: 0o700 });
  return { runId, directory };
}

export async function runLiveProductAcceptance(options, dependencies = {}) {
  const preflight = await preflightProductAcceptance(options, dependencies);
  requireThat(options.approvedMaxNanoUsd === preflight.budget.maximumNanoUsd, "cost-approval-mismatch");
  if (options.mode === "diagnostic-live")
    requireThat(options.approvedIdentitySha256 === preflight.identitySha256, "diagnostic-identity-mismatch");
  const { runId, directory } = createEvidenceDirectory(dependencies.root ?? REVIEW_ROOT, dependencies.runId);
  const results = [];
  for (const prepared of preflight.prepared) {
    let result;
    try {
      result = await (dependencies.executeFixture ?? executeFixtureAcceptance)({
        prepared,
        preflight,
        dependencies,
      });
    } catch (error) {
      const record = productAcceptanceFailureRecord(error, prepared.fixture.id);
      writePrivateRecord(path.join(directory, `${prepared.fixture.id}.failure.json`), record);
      results.push({
        fixture: prepared.fixture.id,
        ok: false,
        failures: [record.error, ...(record.cleanupStatus === "failed" ? ["product-owner-cleanup-failed"] : [])],
        diagnosticId: record.diagnosticId,
        heldNanoUsd: record.ledgerBatches.reduce(
          (sum, batch) =>
            sum + (batch.reservationState === "dispatch-claimed" ? Number(batch.reservedCostNanoUsd ?? 0) : 0),
          0,
        ),
      });
      break;
    }
    writePrivateRecord(path.join(directory, `${prepared.fixture.id}.json`), result.record);
    results.push({
      fixture: prepared.fixture.id,
      ok: result.failures.length === 0,
      failures: result.failures,
      elapsedMs: result.record.elapsedMs,
      saved: result.record.outcome.saved,
      confirmedNanoUsd: result.record.usage.confirmedNanoUsd,
    });
  }
  const summary = {
    ok: results.length === preflight.prepared.length && results.every((item) => item.ok),
    mode: options.mode === "diagnostic-live" ? "diagnostic-live" : "live",
    runId,
    revision: preflight.revision,
    results,
  };
  writePrivateRecord(path.join(directory, "result.json"), summary);
  return summary;
}

function passingRecord() {
  return {
    identity: { approvedRevision: "a".repeat(40), head: "a".repeat(40), dirty: false },
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
    semanticBlocking: { ok: true, reasons: [] },
    elapsedMs: 1,
    usage: { heldNanoUsd: 0 },
    unresolvedHolds: 0,
  };
}

export function productAcceptanceSelfTest() {
  const cases = [
    ["missing fixture identity", (record) => (record.fixtureIdentity.fixtureSha256 = null), "fixture-identity-missing"],
    [
      "fixture hash mismatch",
      (record) => (record.fixtureIdentity.sourceSha256 = "x".repeat(64)),
      "fixture-hash-mismatch",
    ],
    ["dirty revision", (record) => (record.identity.dirty = true), "dirty-revision"],
    ["mismatched revision", (record) => (record.identity.head = "b".repeat(40)), "revision-mismatch"],
    ["incomplete outcome", (record) => (record.outcome.status = "processing"), "not-committed"],
    ["missing read-back", (record) => (record.outcome.readBack = false), "read-back-unconfirmed"],
    ["pending decisions", (record) => (record.outcome.pending = 1), "pending-decisions"],
    ["wrong saved count", (record) => (record.outcome.saved = 1), "saved-count-mismatch"],
    ["wrong persisted count", (record) => (record.outcome.persistedRows = 1), "persisted-count-mismatch"],
    ["semantic mismatch", (record) => (record.semanticBlocking.ok = false), "semantic-mismatch"],
    ["over 300 seconds", (record) => (record.elapsedMs = MAX_ELAPSED_MS + 1), "elapsed-over-300s"],
    ["unreconciled cost", (record) => (record.usage.heldNanoUsd = 1), "unreconciled-cost"],
  ];
  assert.deepEqual(recordFailures(passingRecord()), []);
  for (const [name, mutate, expected] of cases) {
    const record = passingRecord();
    mutate(record);
    assert.ok(recordFailures(record).includes(expected), name);
  }
  const fixture = (id) => ({
    fixture: { id, sha256: "f".repeat(64), referenceSha256: "r".repeat(64) },
    source: { sha256: "f".repeat(64) },
    manifestDigest: "m".repeat(64),
    readerDigest: "d".repeat(64),
  });
  const prepared = PRODUCT_ACCEPTANCE_FIXTURES.map(fixture);
  assert.deepEqual(preflightFixtureFailures(prepared), []);
  assert.deepEqual(preflightFixtureFailures(prepared.slice(1)), ["fixture-missing"]);
  prepared[0].source.sha256 = "x".repeat(64);
  assert.deepEqual(preflightFixtureFailures(prepared), ["fixture-hash-mismatch"]);
  return { ok: true, mode: "self-test", plantedFailures: cases.length + 2, passingControls: 2 };
}

export async function runProductAcceptance(args, dependencies = {}) {
  const options = parseProductAcceptanceArgs(args);
  if (options.mode === "self-test") return productAcceptanceSelfTest();
  if (options.mode === "preflight" || options.mode === "diagnostic-preflight") {
    const result = await preflightProductAcceptance(options, dependencies);
    return {
      ok: result.ok,
      mode: result.mode,
      revision: result.revision,
      maximumNanoUsd: result.budget.maximumNanoUsd,
      ...(result.mode === "diagnostic-preflight" ? { identitySha256: result.identitySha256 } : {}),
      calls: result.budget.calls,
      fixtures: result.fixtures.map(({ id, batches }) => ({ id, batches })),
    };
  }
  return runLiveProductAcceptance(options, dependencies);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runProductAcceptance(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: errorCode(error) }));
    process.exitCode = 1;
  }
}
