// Decimal product size limit; independent backend resource limits use binary KiB/MiB.
export const PDF_LIMITS = Object.freeze({
  maxFileBytes: 20_000_000,
  maxPages: 100,
  maxBatchBodyBytes: 512 * 1024,
  maxImportInputBytes: 2 * 1024 * 1024,
  maxFinalizationBodyBytes: 2 * 1024 * 1024,
  maxInputTokens: 32_768,
  candidateCount: 1,
  maxOutputTokens: 8_192,
  thinkingBudgetTokens: 1_024,
  corePagesPerBatch: 8,
  contextPagesPerSide: 1,
  maxBatches: 32,
  providerDeadlineMs: 60_000,
  processingDeadlineMs: 270_000,
  endToEndDeadlineMs: 300_000,
  f01BudgetNanoUsd: 5_000_000_000,
  monthlyBudgetNanoUsd: 10_000_000_000,
  importBudgetNanoUsd: 500_000_000,
});

export function fileLimitFailure(byteLength: number, pageCount?: number) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) return "invalid-file-size";
  if (byteLength > PDF_LIMITS.maxFileBytes) return "file-too-large";
  if (pageCount !== undefined) {
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) return "invalid-page-count";
    if (pageCount > PDF_LIMITS.maxPages) return "too-many-pages";
  }
  return null;
}
