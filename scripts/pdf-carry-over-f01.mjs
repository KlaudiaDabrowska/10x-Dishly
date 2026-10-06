import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";
import { REVIEW_ROOT, digest, errorCode, localSupabase, readBudget, writePrivateJson } from "./pdf-extract-review.mjs";

// One-time transfer of the cumulative F-01 ledger (confirmed spend + held unknown charges) from the
// local evaluation database into the deployed project's f01 scope. Dry-run by default; --apply is
// required to write. Output is numeric/ID only; the evidence file stays in the ignored local tree.
class CarryOverError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new CarryOverError(code);
}

export function parseCarryOverArgs(args) {
  requireThat(args.length === 0 || (args.length === 1 && args[0] === "--apply"), "invalid-carry-over-arguments");
  return { apply: args[0] === "--apply" };
}

// Explicit remote target only. Loopback targets are refused so the local ledger is never doubled.
export function remoteTarget(env = process.env) {
  const url = env.PDF_TARGET_SUPABASE_URL;
  const key = env.PDF_TARGET_SUPABASE_SECRET_KEY;
  requireThat(url && key, "target-credentials-missing");
  const parsed = new URL(url);
  requireThat(parsed.protocol === "https:", "target-url-not-https");
  requireThat(!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname), "target-is-local");
  return {
    host: parsed.hostname,
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export function carryOverPlan(local, remote, existing = null) {
  const source = local.f01;
  requireThat(source, "f01-ledger-missing");
  const spent = source.spent_nano_usd;
  const held = source.held_nano_usd;
  requireThat(Number.isSafeInteger(spent) && Number.isSafeInteger(held) && spent + held > 0, "nothing-to-carry");
  requireThat(source.limit_nano_usd === PDF_LIMITS.f01BudgetNanoUsd, "f01-limit-mismatch");
  // Binds the carried amounts to the exact local snapshot they came from.
  const evidence = {
    kind: "dishly-f01-carry-over-evidence",
    version: 1,
    scopeKey: "f01",
    spentNanoUsd: spent,
    heldNanoUsd: held,
    limitNanoUsd: source.limit_nano_usd,
  };
  const evidenceDigest = digest(JSON.stringify(evidence));
  const target = remote.f01 ?? null;
  const targetLimit = target?.limit_nano_usd ?? PDF_LIMITS.f01BudgetNanoUsd;
  const targetSpent = target?.spent_nano_usd ?? 0;
  const targetHeld = target?.held_nano_usd ?? 0;
  requireThat(targetLimit === PDF_LIMITS.f01BudgetNanoUsd, "target-f01-limit-mismatch");
  const alreadyApplied =
    existing !== null &&
    Number(existing.carried_spent_nano_usd) === spent &&
    Number(existing.carried_held_nano_usd) === held &&
    existing.evidence_digest === evidenceDigest;
  requireThat(existing === null || alreadyApplied, "carry-over-already-applied-differently");
  const after = alreadyApplied
    ? { spentNanoUsd: targetSpent, heldNanoUsd: targetHeld }
    : { spentNanoUsd: targetSpent + spent, heldNanoUsd: targetHeld + held };
  requireThat(after.spentNanoUsd + after.heldNanoUsd <= targetLimit, "carry-over-exceeds-limit");
  return {
    evidence,
    evidenceDigest,
    alreadyApplied,
    carry: { spentNanoUsd: spent, heldNanoUsd: held },
    targetBefore: {
      limitNanoUsd: targetLimit,
      spentNanoUsd: targetSpent,
      heldNanoUsd: targetHeld,
      exists: target !== null,
    },
    targetAfter: {
      limitNanoUsd: targetLimit,
      ...after,
      availableNanoUsd: targetLimit - after.spentNanoUsd - after.heldNanoUsd,
    },
  };
}

async function existingCarryOver(client) {
  const { data, error } = await client.rpc("get_pdf_budget_carryover", { p_scope_key: "f01" });
  requireThat(!error && Array.isArray(data), "target-schema-missing");
  return data[0] ?? null;
}

export async function carryOver(args, dependencies = {}) {
  const { apply } = parseCarryOverArgs(args);
  const root = dependencies.root ?? REVIEW_ROOT;
  const target = (dependencies.remoteTarget ?? remoteTarget)();
  const local = await readBudget((dependencies.localSupabase ?? localSupabase)());
  const remote = await readBudget(target.client).catch((error) => {
    // A fresh project has no f01 row yet; the RPC creates it with the standard default.
    if (error?.code === "f01-ledger-missing") return {};
    throw error;
  });
  const plan = carryOverPlan(local, remote, await existingCarryOver(target.client));
  const result = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    targetHost: target.host,
    ...plan,
    applied: false,
    evidenceFile: "",
  };
  if (apply && !plan.alreadyApplied) {
    const { data, error } = await target.client.rpc("carry_over_pdf_f01_budget", {
      p_spent_nano_usd: plan.carry.spentNanoUsd,
      p_held_nano_usd: plan.carry.heldNanoUsd,
      p_source_limit_nano_usd: plan.evidence.limitNanoUsd,
      p_evidence_digest: plan.evidenceDigest,
    });
    requireThat(!error && Array.isArray(data) && data[0], "carry-over-failed");
    result.applied = data[0].applied === true;
    const after = await readBudget(target.client);
    result.targetAfter = {
      limitNanoUsd: after.f01.limit_nano_usd,
      spentNanoUsd: after.f01.spent_nano_usd,
      heldNanoUsd: after.f01.held_nano_usd,
      availableNanoUsd: after.f01.limit_nano_usd - after.f01.spent_nano_usd - after.f01.held_nano_usd,
    };
  }
  // Private evidence for both modes; a dry run records the plan that --apply would execute.
  const directory = path.join(root, "local/carry-over");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  result.evidenceFile = path.join(directory, `f01-${result.mode}-${Date.now()}.json`);
  writePrivateJson(result.evidenceFile, { ...result, recordedAt: new Date().toISOString(), localSnapshot: local.f01 });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await carryOver(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: errorCode(error) }));
    process.exitCode = 1;
  }
}
