import type { PageText, PdfSource } from "./contracts.ts";
import { PDF_LIMITS } from "./limits.ts";
import { PdfReadError } from "./reader-core.ts";

export interface PdfTextBatch {
  version: 2;
  index: number;
  source: PdfSource;
  corePages: number[];
  adjacentContextPages: number[];
  documentContextPages: number[];
  pages: PageText[];
}
export function batchBodyBytes(batch: PdfTextBatch): number {
  return new TextEncoder().encode(JSON.stringify(batch)).byteLength;
}

// Deterministic contiguous core ranges; context is read-only provenance, never a second owner.
// The returned value is the entire canonical body. Any later envelope must be counted again.
export function createTextBatches(
  source: PdfSource,
  pages: readonly PageText[],
  options: { corePagesPerBatch?: number } = {},
): PdfTextBatch[] {
  const corePagesPerBatch = options.corePagesPerBatch ?? PDF_LIMITS.corePagesPerBatch;
  if (
    !Number.isSafeInteger(corePagesPerBatch) ||
    corePagesPerBatch < 1 ||
    corePagesPerBatch > PDF_LIMITS.corePagesPerBatch
  )
    throw new Error("invalid-core-page-limit");
  if (
    source.pageCount > PDF_LIMITS.maxPages ||
    pages.length !== source.pageCount ||
    pages.some((page, index) => page.page !== index + 1)
  )
    throw new PdfReadError("invalid-page-sequence");
  if (new TextEncoder().encode(JSON.stringify({ source, pages })).byteLength > PDF_LIMITS.maxImportInputBytes)
    throw new PdfReadError("text-too-large");
  const batches: PdfTextBatch[] = [];
  let start = 0;
  let totalBytes = 0;
  while (start < pages.length) {
    let end = Math.min(start + corePagesPerBatch, pages.length);
    let batch: PdfTextBatch;
    for (;;) {
      const corePages = pages.slice(start, end).map((page) => page.page);
      const adjacentPages = pages.slice(
        Math.max(0, start - PDF_LIMITS.contextPagesPerSide),
        Math.min(pages.length, end + PDF_LIMITS.contextPagesPerSide),
      );
      const documentPages = pages.slice(0, 3);
      const includedPages = new Set([...adjacentPages, ...documentPages].map((page) => page.page));
      batch = {
        version: 2,
        index: batches.length,
        source,
        corePages,
        adjacentContextPages: adjacentPages.filter((page) => !corePages.includes(page.page)).map((page) => page.page),
        documentContextPages: documentPages.map((page) => page.page),
        pages: pages.filter((page) => includedPages.has(page.page)),
      };
      if (batchBodyBytes(batch) <= PDF_LIMITS.maxBatchBodyBytes) break;
      if (end === start + 1) throw new PdfReadError("batch-too-large");
      end--;
    }
    totalBytes += batchBodyBytes(batch);
    // Include repeated context and metadata in the cumulative transmitted input bound.
    if (totalBytes > PDF_LIMITS.maxImportInputBytes) throw new PdfReadError("text-too-large");
    batches.push(batch);
    if (batches.length > PDF_LIMITS.maxBatches) throw new PdfReadError("too-many-batches");
    start = end;
  }
  return batches;
}
