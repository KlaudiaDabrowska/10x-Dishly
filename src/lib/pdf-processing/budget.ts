import { PDF_LIMITS } from "./limits.ts";

export const NANO_USD_PER_USD = 1_000_000_000 as const;
export const PRICE_DENOMINATOR = 1_000_000 as const;

export interface PricingSnapshot {
  provider: string;
  model: string;
  inputNanoUsdPerMillionTokens: number;
  outputNanoUsdPerMillionTokens: number;
}

export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
}

function positiveSafeInteger(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid-${name}`);
  return BigInt(value);
}

function roundUpCost(tokens: number, rate: number): bigint {
  const numerator = positiveSafeInteger(tokens, "token-count") * positiveSafeInteger(rate, "price");
  if (numerator === 0n) return 0n;
  return (numerator + BigInt(PRICE_DENOMINATOR - 1)) / BigInt(PRICE_DENOMINATOR);
}

export function calculateCostNanoUsd(usage: UsageCounts, pricing: PricingSnapshot): number {
  const cost =
    roundUpCost(usage.inputTokens, pricing.inputNanoUsdPerMillionTokens) +
    roundUpCost(usage.outputTokens, pricing.outputNanoUsdPerMillionTokens);
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("cost-out-of-range");
  return Number(cost);
}

export function assertMaximumCost(maximumCostNanoUsd: number): number {
  if (!Number.isSafeInteger(maximumCostNanoUsd) || maximumCostNanoUsd < 1) throw new Error("invalid-maximum-cost");
  if (maximumCostNanoUsd > PDF_LIMITS.importBudgetNanoUsd) throw new Error("maximum-cost-exceeds-import-budget");
  return maximumCostNanoUsd;
}
