import { sourceItemKey } from "./contracts.ts";
import type { RecipeCandidate } from "./contracts.ts";
import type { CandidateValidation } from "./validation.ts";

export interface ReconciledCandidate {
  candidate: RecipeCandidate;
  status: "complete" | "incomplete";
  warnings: string[];
  batches: number[];
}

export interface ReconciliationConflict {
  sourceStart: string;
  batches: number[];
  reason: "content-conflict";
}

function comparable(candidate: RecipeCandidate): string {
  const { pages: _pages, ...content } = candidate;
  return JSON.stringify(content);
}

export function reconcileCandidates(
  batches: readonly { batchIndex: number; validations: readonly CandidateValidation[] }[],
): { candidates: ReconciledCandidate[]; conflicts: ReconciliationConflict[]; invalidCount: number } {
  const candidates = new Map<string, ReconciledCandidate>();
  const conflicts = new Map<string, ReconciliationConflict>();
  let invalidCount = 0;
  for (const batch of [...batches].sort((left, right) => left.batchIndex - right.batchIndex)) {
    if (!Number.isSafeInteger(batch.batchIndex) || batch.batchIndex < 0) throw new Error("invalid-batch-index");
    for (const validation of batch.validations) {
      if (validation.status === "invalid") {
        invalidCount++;
        continue;
      }
      const key = sourceItemKey(validation.candidate.sourceStart);
      const priorConflict = conflicts.get(key);
      if (priorConflict) {
        priorConflict.batches = [...new Set([...priorConflict.batches, batch.batchIndex])].sort((a, b) => a - b);
        continue;
      }
      const existing = candidates.get(key);
      if (!existing) {
        candidates.set(key, {
          candidate: { ...validation.candidate, pages: [...validation.candidate.pages].sort((a, b) => a - b) },
          status: validation.status,
          warnings: [...new Set(validation.warnings)].sort(),
          batches: [batch.batchIndex],
        });
        continue;
      }
      const batchIds = [...new Set([...existing.batches, batch.batchIndex])].sort((a, b) => a - b);
      if (comparable(existing.candidate) !== comparable(validation.candidate)) {
        conflicts.set(key, { sourceStart: key, batches: batchIds, reason: "content-conflict" });
        candidates.delete(key);
        continue;
      }
      existing.candidate.pages = [...new Set([...existing.candidate.pages, ...validation.candidate.pages])].sort(
        (a, b) => a - b,
      );
      existing.batches = batchIds;
      existing.warnings = [...new Set([...existing.warnings, ...validation.warnings])].sort();
      if (validation.status === "incomplete") existing.status = "incomplete";
    }
  }
  return {
    candidates: [...candidates.values()].sort(
      (left, right) =>
        left.candidate.sourceStart.page - right.candidate.sourceStart.page ||
        left.candidate.sourceStart.itemIndex - right.candidate.sourceStart.itemIndex,
    ),
    conflicts: [...conflicts.values()].sort((left, right) => left.sourceStart.localeCompare(right.sourceStart)),
    invalidCount,
  };
}
