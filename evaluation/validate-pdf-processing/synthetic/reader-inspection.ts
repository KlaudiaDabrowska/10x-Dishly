import { readPdf, inspectPdfPages } from "../../../src/lib/pdf-processing/browser-reader.ts";
import type { ReadResult } from "../../../src/lib/pdf-processing/browser-reader.ts";
import { createTextBatches } from "../../../src/lib/pdf-processing/batching.ts";

declare global {
  interface Window {
    pdfInspection: { read: typeof readPdf; inspect: typeof inspectPdfPages; batches: typeof createTextBatches };
  }
}
window.pdfInspection = { read: readPdf, inspect: inspectPdfPages, batches: createTextBatches };
function requireElement<T extends HTMLElement>(element: T | null): T {
  if (!element) throw new Error("Missing inspection element");
  return element;
}
const fileInput = requireElement(document.querySelector<HTMLInputElement>("#file"));
const pageInput = requireElement(document.querySelector<HTMLInputElement>("#page"));
const source = requireElement(document.querySelector<HTMLIFrameElement>("#source"));
const layout = requireElement(document.querySelector<HTMLDivElement>("#layout"));
const status = requireElement(document.querySelector<HTMLPreElement>("#status"));
let controller: AbortController | undefined;
let result: ReadResult | undefined;
let sourceUrl: string | undefined;
function clear() {
  controller?.abort();
  result = undefined;
  layout.replaceChildren();
  source.removeAttribute("src");
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = undefined;
}
function render() {
  layout.replaceChildren();
  const page = result?.pages.find((entry) => entry.page === Number(pageInput.value));
  if (!page) return;
  if (sourceUrl) source.src = `${sourceUrl}#page=${page.page}`;
  layout.style.width = `${page.width}px`;
  layout.style.height = `${page.height}px`;
  for (const item of page.items) {
    const span = document.createElement("span");
    span.textContent = item.text;
    span.title = JSON.stringify(item.anchor);
    const [a, b, c, d, x, y] = item.transform;
    Object.assign(span.style, {
      position: "absolute",
      left: "0",
      top: "0",
      whiteSpace: "pre",
      fontSize: "1px",
      transformOrigin: "0 0",
      lineHeight: "1",
      transform: `matrix(${a},${-b},${c},${-d},${x},${page.height - y}) scaleY(-1)`,
    });
    layout.appendChild(span);
  }
}
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  clear();
  if (!file) return;
  const current = new AbortController();
  controller = current;
  status.textContent = "Odczyt…";
  void readPdf(file, { signal: current.signal })
    .then((value) => {
      if (controller !== current || current.signal.aborted) return;
      const batches = createTextBatches(value.source, value.pages);
      result = value;
      sourceUrl = URL.createObjectURL(file);
      pageInput.value = "1";
      pageInput.max = String(value.source.pageCount);
      status.textContent = JSON.stringify({ source: value.source, batches: batches.length }, null, 2);
      render();
    })
    .catch((error: unknown) => {
      if (controller !== current) return;
      clear();
      status.textContent = error instanceof Error ? error.message : "Błąd odczytu";
    });
});
requireElement(document.querySelector<HTMLButtonElement>("#cancel")).addEventListener("click", () => {
  clear();
  status.textContent = "Anulowano";
});
pageInput.addEventListener("change", render);
window.addEventListener("pagehide", clear);
