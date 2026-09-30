import type { PageText, PdfSource } from "./contracts.ts";
import { PDF_LIMITS } from "./limits.ts";
import { PdfReadError } from "./reader-core.ts";

export interface PdfTextBatch {
  version: 1;
  index: number;
  source: PdfSource;
  corePages: number[];
  pages: PageText[];
}
export function batchBodyBytes(batch: PdfTextBatch): number {
  return new TextEncoder().encode(JSON.stringify(batch)).byteLength;
}

// Deterministic contiguous core ranges; context is read-only provenance, never a second owner.
// The returned value is the entire canonical body. Any later envelope must be counted again.
export function createTextBatches(source: PdfSource, pages: readonly PageText[]): PdfTextBatch[] {
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
    let end = Math.min(start + PDF_LIMITS.corePagesPerBatch, pages.length);
    let batch: PdfTextBatch;
    for (;;) {
      batch = {
        version: 1,
        index: batches.length,
        source,
        corePages: pages.slice(start, end).map((page) => page.page),
        pages: pages.slice(
          Math.max(0, start - PDF_LIMITS.contextPagesPerSide),
          Math.min(pages.length, end + PDF_LIMITS.contextPagesPerSide),
        ),
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
