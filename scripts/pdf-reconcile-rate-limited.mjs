import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createImportState } from "../src/lib/pdf-processing/import-state.ts";
import { REVIEW_ROOT, digest, errorCode, localSupabase, writePrivateJson } from "./pdf-extract-review.mjs";

// One-time trusted reconciliation of a historical HTTP 429 that was left held before
// automatic zero-cost 429 accounting existed. It refuses unless saved run evidence proves
// the batch was rejected with 429 and produced no provider response.
class ReconcileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new ReconcileError(code);
}
const readJson = (filename) => JSON.parse(readFileSync(filename, "utf8"));

// Deterministic report identity: repeating the command for the same reservation is idempotent.
export function rateLimitReportId(reservationId) {
  const hex = digest("pdf-rate-limited:" + reservationId);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function verifyRateLimitedEvidence(reportPath, batchIndexArgument, root = REVIEW_ROOT) {
  requireThat(typeof reportPath === "string" && /^\d{1,2}$/.test(batchIndexArgument ?? ""), "invalid-arguments");
  const batchIndex = Number(batchIndexArgument);
  const resolved = realpathSync(reportPath);
  const parent = realpathSync(path.join(root, "local/extraction-review"));
  const fixtureDir = path.dirname(resolved);
  const runDir = path.dirname(fixtureDir);
  requireThat(path.basename(resolved) === "report.json" && path.dirname(runDir) === parent, "invalid-report-path");
  const reportBytes = readFileSync(resolved);
  const report = JSON.parse(reportBytes);
  const result = readJson(path.join(runDir, "result.json"));
  const recorded = result.results?.find((item) => item.fixture === report.fixture);
  requireThat(
    report.fixture === path.basename(fixtureDir) && recorded?.reportDigest === digest(reportBytes),
    "report-evidence-mismatch",
  );
  requireThat(
    report.failure === "provider-rate-limited" && recorded.failure === "provider-rate-limited",
    "not-rate-limited",
  );
  requireThat(report.completedBatches === batchIndex && batchIndex < report.requiredBatches, "batch-not-failed");
  const input = readJson(path.join(fixtureDir, `batch-${batchIndex}-input.json`));
  requireThat(input.batch?.index === batchIndex && typeof input.inputDigest === "string", "batch-input-missing");
  const responseFiles = readdirSync(fixtureDir).filter(
    (name) => name.startsWith(`batch-${batchIndex}-`) && /-(response|result)\.json$/.test(name),
  );
  requireThat(responseFiles.length === 0, "provider-response-present");
  requireThat(typeof report.ownerId === "string" && typeof report.importId === "string", "report-identity-missing");
  return {
    ownerId: report.ownerId,
    importId: report.importId,
    batchIndex,
    inputDigest: input.inputDigest,
    fixtureDir,
  };
}

export async function reconcileRateLimited(args, dependencies = {}) {
  requireThat(args.length === 2, "invalid-arguments");
  const evidence = verifyRateLimitedEvidence(args[0], args[1], dependencies.root ?? REVIEW_ROOT);
  const evidenceFile = path.join(evidence.fixtureDir, `batch-${evidence.batchIndex}-rate-limit-reconciliation.json`);
  requireThat(!existsSync(evidenceFile), "already-reconciled");
  const supabase = (dependencies.localSupabase ?? localSupabase)();
  const { data, error } = await supabase.rpc("get_pdf_import_state", {
    p_owner_id: evidence.ownerId,
    p_import_id: evidence.importId,
  });
  requireThat(!error && Array.isArray(data) && data.length === 1, "ledger-read-failed");
  const batch = data[0].batches.find((entry) => entry.batchIndex === evidence.batchIndex);
  requireThat(
    batch &&
      batch.status === "dispatch-claimed" &&
      batch.reservationState === "dispatch-claimed" &&
      batch.inputDigest === evidence.inputDigest &&
      batch.outputDigest === null &&
      typeof batch.reservationId === "string",
    "ledger-batch-not-held",
  );
  const reportId = rateLimitReportId(batch.reservationId);
  const state = createImportState(supabase, evidence.ownerId);
  const reconciled = await state.reconcileRateLimited(batch.reservationId, reportId);
  const after = await supabase.rpc("get_pdf_import_state", {
    p_owner_id: evidence.ownerId,
    p_import_id: evidence.importId,
  });
  requireThat(!after.error && Array.isArray(after.data), "ledger-read-failed");
  const record = {
    version: 1,
    kind: "rate-limited-zero-cost-reconciliation",
    reconciledAt: new Date().toISOString(),
    ownerId: evidence.ownerId,
    importId: evidence.importId,
    batchIndex: evidence.batchIndex,
    reservationId: batch.reservationId,
    reportId,
    reconciled,
    before: batch,
    after: after.data[0].batches.find((entry) => entry.batchIndex === evidence.batchIndex),
  };
  writePrivateJson(evidenceFile, record);
  return { ok: true, ...record, evidence: evidenceFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await reconcileRateLimited(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: errorCode(error) }));
    process.exitCode = 1;
  }
}
