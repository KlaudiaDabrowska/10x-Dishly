import { fileLimitFailure } from "./limits.ts";
import { PdfReadError, readWithEngine } from "./reader-core.ts";
import type { ReaderDependencies, ReaderFile, ReaderOptions } from "./reader-core.ts";
import type { TextContent } from "pdfjs-dist/types/src/display/api.js";
export { PdfReadError } from "./reader-core.ts";
export type { ReadResult, ReaderOptions } from "./reader-core.ts";

async function browserEngine(): Promise<ReaderDependencies> {
  if (typeof window === "undefined") throw new PdfReadError("browser-required");
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  const url = new URL(workerUrl, window.location.href);
  if (url.origin !== window.location.origin) throw new PdfReadError("worker-origin");
  return {
    load(data) {
      // An explicit native worker forbids PDF.js's main-thread fake-worker fallback.
      const nativeWorker = new Worker(url, { type: "module" });
      const worker = (() => {
        try {
          return pdfjs.PDFWorker.create({ port: nativeWorker });
        } catch (error) {
          nativeWorker.terminate();
          throw error;
        }
      })();
      const loading = (() => {
        try {
          return pdfjs.getDocument({
            data,
            worker,
            enableXfa: false,
            useWorkerFetch: false,
            disableFontFace: true,
            useSystemFonts: false,
            stopAtErrors: true,
            verbosity: 0,
          });
        } catch (error) {
          worker.destroy();
          nativeWorker.terminate();
          throw error;
        }
      })();
      return {
        promise: loading.promise.then((document) => ({
          numPages: document.numPages,
          async getPage(pageNumber) {
            const page = await document.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            return {
              width: viewport.width,
              height: viewport.height,
              rotation: page.rotate,
              async *chunks() {
                const stream = page.streamTextContent({
                  includeMarkedContent: false,
                  disableNormalization: true,
                }) as ReadableStream<TextContent>;
                const reader = stream.getReader();
                try {
                  for (;;) {
                    const next = await reader.read();
                    if (next.done) break;
                    yield next.value.items;
                  }
                } finally {
                  try {
                    await reader.cancel();
                  } finally {
                    reader.releaseLock();
                  }
                }
              },
              cleanup: () => {
                page.cleanup();
              },
            };
          },
        })),
        async destroy() {
          try {
            await loading.destroy();
          } finally {
            worker.destroy();
            nativeWorker.terminate();
          }
        },
      };
    },
  };
}

export async function readPdf(file: ReaderFile, options: ReaderOptions = {}) {
  // Reject size/cancellation before importing the large parser or creating a worker.
  if (options.signal?.aborted) throw new PdfReadError("cancelled");
  const failure = fileLimitFailure(file.size);
  if (failure) throw new PdfReadError(failure);
  return readWithEngine(file, await browserEngine(), options);
}

// Separate developer API; never usable by the product reader or a production bundle.
// It keeps the file-size/text-memory caps and requires an explicit ascending page list.
export async function inspectPdfPages(file: ReaderFile, pages: readonly number[], options: ReaderOptions = {}) {
  if (!import.meta.env.DEV) throw new PdfReadError("inspection-disabled");
  return readWithEngine(file, await browserEngine(), options, pages);
}
