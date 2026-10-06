import type { PdfTextBatch } from "./batching.ts";
import { batchBodyBytes } from "./batching.ts";
import { PDF_CONTRACT_VERSION } from "./contracts.ts";
import type { PageText, PageTextItem, PdfSource } from "./contracts.ts";
import { PDF_LIMITS, fileLimitFailure } from "./limits.ts";

export interface ManifestBatch {
  batchIndex: number;
  corePageStart: number;
  corePageEnd: number;
  inputDigest: string;
  bodyBytes: number;
}

// Non-content import metadata. The source filename stays metadata; page text is only digested.
export interface SourceManifest {
  version: 1;
  source: PdfSource;
  pageDigests: string[];
  batches: ManifestBatch[];
}

export class PdfRequestError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "PdfRequestError";
    this.code = code;
  }
}

const HEX_64 = /^[0-9a-f]{64}$/;

function fail(code = "invalid-request"): never {
  throw new PdfRequestError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

function positiveInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) fail();
  return Number(value);
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail();
  return value;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Explicit key order: identical to the reader/batch builder, so digests are reproducible on both sides.
export function parseSource(raw: unknown): PdfSource {
  if (!isRecord(raw) || !exactKeys(raw, ["version", "sha256", "filename", "byteLength", "pageCount"])) fail();
  if (raw.version !== PDF_CONTRACT_VERSION || typeof raw.sha256 !== "string" || !HEX_64.test(raw.sha256)) fail();
  if (typeof raw.filename !== "string" || !raw.filename.trim() || raw.filename.length > 255) fail();
  const byteLength = positiveInteger(raw.byteLength, PDF_LIMITS.maxFileBytes);
  const pageCount = positiveInteger(raw.pageCount, PDF_LIMITS.maxPages);
  if (fileLimitFailure(byteLength, pageCount)) fail();
  return { version: PDF_CONTRACT_VERSION, sha256: raw.sha256, filename: raw.filename, byteLength, pageCount };
}

function parseItem(raw: unknown, page: number, minimumIndex: number): PageTextItem {
  if (
    !isRecord(raw) ||
    !exactKeys(raw, ["anchor", "text", "transform", "width", "height", "direction", "hasEOL"]) ||
    !isRecord(raw.anchor) ||
    !exactKeys(raw.anchor, ["page", "itemIndex"])
  )
    fail();
  if (raw.anchor.page !== page || !Number.isSafeInteger(raw.anchor.itemIndex)) fail();
  const itemIndex = Number(raw.anchor.itemIndex);
  // Stable, strictly increasing item IDs: each source item appears exactly once per page.
  if (itemIndex < minimumIndex) fail();
  if (typeof raw.text !== "string" || typeof raw.direction !== "string" || raw.direction.length > 10) fail();
  if (typeof raw.hasEOL !== "boolean" || !Array.isArray(raw.transform) || raw.transform.length !== 6) fail();
  return {
    anchor: { page, itemIndex },
    text: raw.text,
    transform: raw.transform.map(finite) as PageTextItem["transform"],
    width: finite(raw.width),
    height: finite(raw.height),
    direction: raw.direction,
    hasEOL: raw.hasEOL,
  };
}

export function parsePage(raw: unknown): PageText {
  if (!isRecord(raw) || !exactKeys(raw, ["page", "width", "height", "rotation", "items"])) fail();
  const page = positiveInteger(raw.page, PDF_LIMITS.maxPages);
  if (!Array.isArray(raw.items)) fail();
  const items: PageTextItem[] = [];
  let next = 0;
  for (const entry of raw.items as unknown[]) {
    const item = parseItem(entry, page, next);
    next = item.anchor.itemIndex + 1;
    items.push(item);
  }
  const width = finite(raw.width);
  const height = finite(raw.height);
  if (width <= 0 || height <= 0) fail();
  return { page, width, height, rotation: finite(raw.rotation), items };
}

export function pageDigest(page: PageText): Promise<string> {
  return sha256Hex(JSON.stringify(parsePage(page)));
}

// The same canonical body digested by the evaluation runner (JSON of the shared batch shape).
export function batchInputDigest(batch: PdfTextBatch): Promise<string> {
  return sha256Hex(JSON.stringify(batch));
}

export function manifestDigest(manifest: SourceManifest): Promise<string> {
  return sha256Hex(JSON.stringify(manifest));
}

export async function buildManifest(
  source: PdfSource,
  pages: readonly PageText[],
  batches: readonly PdfTextBatch[],
): Promise<{ manifest: SourceManifest; manifestDigest: string }> {
  const pageDigests: string[] = [];
  for (const page of pages) pageDigests.push(await pageDigest(page));
  const manifestBatches: ManifestBatch[] = [];
  for (const batch of batches)
    manifestBatches.push({
      batchIndex: batch.index,
      corePageStart: batch.corePages[0],
      corePageEnd: batch.corePages[batch.corePages.length - 1],
      inputDigest: await batchInputDigest(batch),
      bodyBytes: batchBodyBytes(batch),
    });
  const manifest: SourceManifest = {
    version: 1,
    source: parseSource(source),
    pageDigests,
    batches: manifestBatches,
  };
  return { manifest, manifestDigest: await manifestDigest(manifest) };
}

// Server-side check of a server-built manifest: core ranges partition pages 1..pageCount exactly once.
export function assertManifestPartition(manifest: SourceManifest): void {
  if (manifest.pageDigests.length !== manifest.source.pageCount) fail("invalid-manifest-partition");
  if (manifest.batches.length < 1 || manifest.batches.length > PDF_LIMITS.maxBatches) fail("too-many-batches");
  let nextPage = 1;
  let totalBytes = 0;
  for (const [index, entry] of manifest.batches.entries()) {
    if (
      entry.batchIndex !== index ||
      entry.corePageStart !== nextPage ||
      entry.corePageEnd < nextPage ||
      entry.corePageEnd - nextPage + 1 > PDF_LIMITS.corePagesPerBatch ||
      !HEX_64.test(entry.inputDigest) ||
      entry.bodyBytes > PDF_LIMITS.maxBatchBodyBytes
    )
      fail("invalid-manifest-partition");
    totalBytes += entry.bodyBytes;
    nextPage = entry.corePageEnd + 1;
  }
  if (nextPage !== manifest.source.pageCount + 1) fail("invalid-manifest-partition");
  if (totalBytes > PDF_LIMITS.maxImportInputBytes) fail("text-too-large");
}

// jsonb storage reorders object keys; rebuild the canonical order before digest comparison.
export function normalizeManifest(raw: unknown): SourceManifest {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.pageDigests) || !Array.isArray(raw.batches))
    fail("manifest-mismatch");
  const manifest: SourceManifest = {
    version: 1,
    source: parseSource(raw.source),
    pageDigests: (raw.pageDigests as unknown[]).map(String),
    batches: (raw.batches as unknown[]).map((entry) => {
      if (!isRecord(entry)) fail("manifest-mismatch");
      return {
        batchIndex: Number(entry.batchIndex),
        corePageStart: Number(entry.corePageStart),
        corePageEnd: Number(entry.corePageEnd),
        inputDigest: String(entry.inputDigest),
        bodyBytes: Number(entry.bodyBytes),
      };
    }),
  };
  assertManifestPartition(manifest);
  return manifest;
}

// Untrusted import text: exact shape, pages 1..pageCount in order, strictly increasing item IDs.
export function parseSourcePages(raw: unknown): { source: PdfSource; pages: PageText[] } {
  if (!isRecord(raw) || !exactKeys(raw, ["source", "pages"]) || !Array.isArray(raw.pages)) fail();
  const source = parseSource(raw.source);
  const pages = (raw.pages as unknown[]).map(parsePage);
  if (pages.length !== source.pageCount || pages.some((page, index) => page.page !== index + 1))
    fail("invalid-page-sequence");
  return { source, pages };
}

const IMPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Create request: a browser-chosen import id (idempotency key) plus the untrusted import text.
export function parseCreateRequest(raw: unknown): { importId: string; source: PdfSource; pages: PageText[] } {
  if (!isRecord(raw) || !exactKeys(raw, ["importId", "source", "pages"])) fail();
  if (typeof raw.importId !== "string" || !IMPORT_ID.test(raw.importId)) fail();
  return { importId: raw.importId, ...parseSourcePages({ source: raw.source, pages: raw.pages }) };
}

const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_unused, index) => start + index);

// Rebuilds one manifest batch with the same context roles as createTextBatches. Used by the browser
// to send each batch and by the backend to prove a submitted batch is exactly that manifest entry.
export function batchFromManifest(
  source: PdfSource,
  pages: readonly PageText[],
  entry: Pick<ManifestBatch, "batchIndex" | "corePageStart" | "corePageEnd">,
): PdfTextBatch {
  const pageCount = source.pageCount;
  const corePages = range(entry.corePageStart, entry.corePageEnd);
  const adjacentContextPages = range(
    Math.max(1, entry.corePageStart - PDF_LIMITS.contextPagesPerSide),
    Math.min(pageCount, entry.corePageEnd + PDF_LIMITS.contextPagesPerSide),
  ).filter((page) => !corePages.includes(page));
  const documentContextPages = range(1, Math.min(3, pageCount));
  const included = new Set([...corePages, ...adjacentContextPages, ...documentContextPages]);
  return {
    version: 2,
    index: entry.batchIndex,
    source,
    corePages,
    adjacentContextPages,
    documentContextPages,
    pages: pages.filter((page) => included.has(page.page)),
  };
}

export async function verifyBatch(raw: unknown, manifest: SourceManifest): Promise<PdfTextBatch> {
  if (
    !isRecord(raw) ||
    !exactKeys(raw, [
      "version",
      "index",
      "source",
      "corePages",
      "adjacentContextPages",
      "documentContextPages",
      "pages",
    ])
  )
    fail();
  if (raw.version !== 2 || !Number.isSafeInteger(raw.index)) fail();
  const entry = manifest.batches[Number(raw.index)] as ManifestBatch | undefined;
  if (!entry) fail("unknown-batch");
  const source = parseSource(raw.source);
  if (JSON.stringify(source) !== JSON.stringify(manifest.source)) fail("source-mismatch");
  if (!Array.isArray(raw.pages)) fail();
  const supplied: PageText[] = [];
  for (const entryPage of raw.pages as unknown[]) {
    const page = parsePage(entryPage);
    if (page.page > source.pageCount) fail("invalid-batch-context");
    if ((await sha256Hex(JSON.stringify(page))) !== manifest.pageDigests[page.page - 1]) fail("page-digest-mismatch");
    supplied.push(page);
  }
  const batch = batchFromManifest(source, supplied, entry);
  // Any missing, extra, reordered or relabelled page/context is rejected, never repaired.
  if (
    raw.index !== batch.index ||
    JSON.stringify(raw.corePages) !== JSON.stringify(batch.corePages) ||
    JSON.stringify(raw.adjacentContextPages) !== JSON.stringify(batch.adjacentContextPages) ||
    JSON.stringify(raw.documentContextPages) !== JSON.stringify(batch.documentContextPages) ||
    JSON.stringify(supplied.map((page) => page.page)) !== JSON.stringify(batch.pages.map((page) => page.page))
  )
    fail("invalid-batch-context");
  const bytes = batchBodyBytes(batch);
  if (bytes > PDF_LIMITS.maxBatchBodyBytes || bytes !== entry.bodyBytes) fail("batch-size-mismatch");
  if ((await batchInputDigest(batch)) !== entry.inputDigest) fail("input-digest-mismatch");
  return batch;
}
