import { PDF_CONTRACT_VERSION } from "./contracts.ts";
import type { PageText, PageTextItem, PdfSource } from "./contracts.ts";
import { fileLimitFailure, PDF_LIMITS } from "./limits.ts";

export class PdfReadError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "PdfReadError";
    this.code = code;
  }
}
export interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir: string;
  hasEOL: boolean;
}
export interface ReaderPage {
  width: number;
  height: number;
  rotation: number;
  chunks(): AsyncIterable<(RawTextItem | { type: string })[]>;
  cleanup(): void;
}
export interface ReaderDocument {
  numPages: number;
  getPage(page: number): Promise<ReaderPage>;
}
export interface ReaderTask {
  promise: Promise<ReaderDocument>;
  destroy(): Promise<void>;
}
export interface ReaderFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface ReadResult {
  source: PdfSource;
  pages: PageText[];
}
export interface ReaderOptions {
  signal?: AbortSignal;
}
export interface ReaderDependencies {
  load(data: Uint8Array): ReaderTask;
}

// Kept independent of the browser adapter so lifecycle failures can be tested without a fake DOM.
export async function readWithEngine(
  file: ReaderFile,
  engine: ReaderDependencies,
  options: ReaderOptions = {},
  inspectionPages?: readonly number[],
): Promise<ReadResult> {
  const sizeFailure = fileLimitFailure(file.size);
  if (sizeFailure) throw new PdfReadError(sizeFailure);
  const signal = options.signal;
  const checkCancelled = () => {
    if (signal?.aborted) throw new PdfReadError("cancelled");
  };
  checkCancelled();
  let task: ReaderTask | undefined;
  let destruction: Promise<void> | undefined;
  const state = { timedOut: false };
  const stop = () => {
    if (task) destruction ??= task.destroy();
    // Observe immediately; the final await still propagates cleanup failures.
    void destruction?.catch(() => undefined);
  };
  let rejectInterrupted: ((reason: Error) => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });
  // Also observe cancellation when there is no in-flight operation to race.
  void interrupted.catch(() => undefined);
  const abort = () => {
    stop();
    rejectInterrupted?.(new PdfReadError("cancelled"));
  };
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    state.timedOut = true;
    stop();
    rejectInterrupted?.(new PdfReadError("reader-timeout"));
  }, PDF_LIMITS.processingDeadlineMs);
  const wait = <T>(promise: Promise<T>) => Promise.race([promise, interrupted]);
  try {
    checkCancelled();
    let sha256: string;
    {
      const data = new Uint8Array(await wait(file.arrayBuffer()));
      if (data.byteLength !== file.size) throw new PdfReadError("file-size-changed");
      const digest = await wait(crypto.subtle.digest("SHA-256", data));
      sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      checkCancelled();
      // PDF.js transfers this buffer; the fingerprint MUST already have been computed.
      task = engine.load(data);
    }
    const document = await wait(task.promise);
    const pageFailure = fileLimitFailure(file.size, document.numPages);
    if (pageFailure && !(inspectionPages && pageFailure === "too-many-pages")) throw new PdfReadError(pageFailure);
    const selected = inspectionPages
      ? [...inspectionPages]
      : Array.from({ length: document.numPages }, (_unused, index) => index + 1);
    if (
      selected.length === 0 ||
      selected.length > PDF_LIMITS.maxPages ||
      selected.some(
        (page, index) =>
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > document.numPages ||
          (index > 0 && page <= selected[index - 1]),
      )
    )
      throw new PdfReadError("invalid-inspection-pages");
    const pages: PageText[] = [];
    let readable = false;
    let inputBytes = 2;
    for (const pageNumber of selected) {
      checkCancelled();
      const page = await wait(document.getPage(pageNumber));
      try {
        if (![page.width, page.height, page.rotation].every(Number.isFinite) || page.width <= 0 || page.height <= 0)
          throw new PdfReadError("invalid-layout");
        const result: PageText = {
          page: pageNumber,
          width: page.width,
          height: page.height,
          rotation: page.rotation,
          items: [],
        };
        let itemIndex = 0;
        const iterator = page.chunks()[Symbol.asyncIterator]();
        try {
          for (;;) {
            const chunk = await wait(iterator.next());
            if (chunk.done) break;
            for (const item of chunk.value) {
              const index = itemIndex++;
              if (!("str" in item)) continue;
              if (
                item.transform.length !== 6 ||
                !item.transform.every(Number.isFinite) ||
                !Number.isFinite(item.width) ||
                !Number.isFinite(item.height)
              )
                throw new PdfReadError("invalid-layout");
              const value: PageTextItem = {
                anchor: { page: pageNumber, itemIndex: index },
                text: item.str,
                transform: [...item.transform] as PageTextItem["transform"],
                width: item.width,
                height: item.height,
                direction: item.dir,
                hasEOL: item.hasEOL,
              };
              inputBytes += new TextEncoder().encode(JSON.stringify(value)).byteLength + 1;
              if (inputBytes > PDF_LIMITS.maxImportInputBytes) throw new PdfReadError("text-too-large");
              readable ||= /[\p{L}\p{N}]/u.test(item.str);
              result.items.push(value);
            }
          }
        } finally {
          // The adapter cancels/releases its stream in the generator's finally block.
          await iterator.return?.();
        }
        inputBytes += new TextEncoder().encode(JSON.stringify({ ...result, items: [] })).byteLength;
        if (inputBytes > PDF_LIMITS.maxImportInputBytes) throw new PdfReadError("text-too-large");
        pages.push(result);
      } finally {
        page.cleanup();
      }
    }
    if (!readable) throw new PdfReadError("unreadable-document");
    checkCancelled();
    return {
      source: {
        version: PDF_CONTRACT_VERSION,
        sha256,
        filename: file.name,
        byteLength: file.size,
        pageCount: document.numPages,
      },
      pages,
    };
  } catch (error) {
    if (state.timedOut) throw new PdfReadError("reader-timeout");
    if (signal?.aborted) throw new PdfReadError("cancelled");
    if (error instanceof PdfReadError) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new PdfReadError("encrypted-document");
    throw new PdfReadError("invalid-document");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    stop();
    await destruction;
  }
}
