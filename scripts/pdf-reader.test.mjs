import { URL } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { readWithEngine } from "../src/lib/pdf-processing/reader-core.ts";
import { createTextBatches, batchBodyBytes } from "../src/lib/pdf-processing/batching.ts";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";

const pdfBytes = readFileSync(new URL("../evaluation/validate-pdf-processing/synthetic/layout.pdf", import.meta.url));
const file = (bytes = pdfBytes) => ({
  name: "synthetic.pdf",
  size: bytes.length,
  arrayBuffer: async () => Uint8Array.from(bytes).buffer,
});
const item = (str = "Synthetic dish", x = 10, y = 700) => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width: 50,
  height: 12,
  dir: "ltr",
  hasEOL: true,
});
function fake({ count = 1, items = [item()], loading, pageWait, chunkWait, failPage = false } = {}) {
  const calls = { load: 0, destroy: 0, cleanup: 0, pages: [], closed: 0, hashBeforeTransfer: false };
  let rejectLoad;
  const loadingPromise = loading
    ? new Promise((_resolve, reject) => {
        rejectLoad = reject;
      })
    : undefined;
  let rejectPage;
  const waitingPage = pageWait
    ? new Promise((_resolve, reject) => {
        rejectPage = reject;
      })
    : undefined;
  let rejectChunk;
  const waitingChunk = chunkWait
    ? new Promise((_resolve, reject) => {
        rejectChunk = reject;
      })
    : undefined;
  const page = {
    width: 600,
    height: 800,
    rotation: 0,
    async *chunks() {
      try {
        if (waitingChunk) await waitingChunk;
        yield items;
      } finally {
        calls.closed++;
      }
    },
    cleanup() {
      calls.cleanup++;
    },
  };
  const engine = {
    load(data) {
      calls.load++;
      calls.hashBeforeTransfer = data.byteLength > 0;
      globalThis.structuredClone(data, { transfer: [data.buffer] });
      return {
        promise:
          loadingPromise ??
          Promise.resolve({
            numPages: count,
            async getPage(number) {
              calls.pages.push(number);
              if (failPage) throw Error("bad page");
              if (waitingPage) await waitingPage;
              return page;
            },
          }),
        async destroy() {
          calls.destroy++;
          rejectLoad?.(Error("destroyed"));
          rejectPage?.(Error("destroyed"));
          rejectChunk?.(Error("destroyed"));
        },
      };
    },
  };
  return { engine, calls };
}
test("byte limit rejects before allocation/load; fingerprint survives transferred bytes", async () => {
  const f = fake();
  await assert.rejects(
    readWithEngine(
      {
        ...file(),
        size: 20_000_001,
        arrayBuffer() {
          throw Error("must not read");
        },
      },
      f.engine,
    ),
    { code: "file-too-large" },
  );
  assert.equal(f.calls.load, 0);
  const output = await readWithEngine(file(), f.engine);
  assert.equal(output.source.sha256, createHash("sha256").update(pdfBytes).digest("hex"));
  assert.equal(f.calls.destroy, 1);
  assert.equal(f.calls.cleanup, 1);
});
test("page gate accepts 113/115 and rejects 116 before text access; developer selection stays separate", async () => {
  for (const count of [116, 130]) {
    const f = fake({ count });
    await assert.rejects(readWithEngine(file(), f.engine), { code: "too-many-pages" });
    assert.deepEqual(f.calls.pages, []);
    assert.equal(f.calls.destroy, 1);
  }
  for (const count of [113, 115]) {
    const f = fake({ count });
    const result = await readWithEngine(file(), f.engine);
    assert.equal(result.pages.length, count);
    assert.deepEqual(result.pages.at(-1).items[0].anchor, { page: count, itemIndex: 0 });
    const batches = createTextBatches(result.source, result.pages);
    assert.deepEqual(
      batches.flatMap((entry) => entry.corePages),
      Array.from({ length: count }, (_, index) => index + 1),
    );
    assert.equal(f.calls.cleanup, count);
    assert.equal(f.calls.destroy, 1);
  }
  const selection = await readWithEngine(file(), fake({ count: 116 }).engine, {}, [7, 113]);
  assert.deepEqual(
    selection.pages.map((p) => p.page),
    [7, 113],
  );
  assert.throws(() => createTextBatches(selection.source, selection.pages), { code: "invalid-page-sequence" });
});
test("empty/scanned-only input is explicit, source item positions and geometry stay intact", async () => {
  const empty = fake({ items: [] });
  await assert.rejects(readWithEngine(file(), empty.engine), { code: "unreadable-document" });
  assert.equal(empty.calls.cleanup, 1);
  assert.equal(empty.calls.destroy, 1);
  const entries = [{ type: "beginMarkedContent" }, item("Left", 30), item("Middle", 220), item("Right", 410)];
  const result = await readWithEngine(file(), fake({ items: entries }).engine);
  assert.deepEqual(
    result.pages[0].items.map((i) => i.anchor.itemIndex),
    [1, 2, 3],
  );
  assert.deepEqual(
    result.pages[0].items.map((i) => i.transform[4]),
    [30, 220, 410],
  );
  assert.equal(result.pages[0].items[0].hasEOL, true);
});
test("cancellation before loading, during loading, page lookup and text stream destroys exactly once", async () => {
  for (const stage of ["before", "loading", "pageWait", "chunkWait"]) {
    const controller = new globalThis.AbortController();
    const f = fake({ [stage]: true });
    if (stage === "before") controller.abort();
    const pending = readWithEngine(file(), f.engine, { signal: controller.signal });
    const rejected = assert.rejects(pending, { code: "cancelled" });
    if (stage !== "before") {
      // Wait for the intended dependency boundary, without assuming digest timing.
      for (let n = 0; n < 100 && (stage === "loading" ? !f.calls.load : !f.calls.pages.length); n++)
        await new Promise((resolve) => globalThis.setTimeout(resolve, 1));
      controller.abort();
    }
    await rejected;
    assert.equal(f.calls.destroy, stage === "before" ? 0 : 1);
    if (stage === "chunkWait") assert.equal(f.calls.cleanup, 1);
  }
});
test("load/page errors and unsupported password map to explicit failures with cleanup", async () => {
  for (const name of ["PasswordException", "InvalidPDFException"]) {
    let destroyed = 0;
    await assert.rejects(
      readWithEngine(file(), {
        load() {
          return {
            promise: Promise.reject(Object.assign(Error("private detail"), { name })),
            async destroy() {
              destroyed++;
            },
          };
        },
      }),
      { code: name === "PasswordException" ? "encrypted-document" : "invalid-document" },
    );
    assert.equal(destroyed, 1);
  }
  const f = fake({ failPage: true });
  await assert.rejects(readWithEngine(file(), f.engine), { code: "invalid-document" });
  assert.equal(f.calls.destroy, 1);
});
test("excess extracted text fails without truncation and releases the active page", async () => {
  const f = fake({ items: [item("x".repeat(PDF_LIMITS.maxImportInputBytes))] });
  await assert.rejects(readWithEngine(file(), f.engine), { code: "text-too-large" });
  assert.equal(f.calls.cleanup, 1);
  assert.equal(f.calls.destroy, 1);
  assert.equal(f.calls.closed, 1);
});
test("core ownership is unique; adjacent pages overlap deterministically across spanning recipes", async () => {
  const result = await readWithEngine(file(), fake({ count: 17 }).engine);
  const batches = createTextBatches(result.source, result.pages);
  assert.deepEqual(
    batches.map((b) => b.corePages),
    [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16], [17]],
  );
  assert.deepEqual(
    batches.map((b) => b.pages.map((p) => p.page)),
    [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      [1, 2, 3, 16, 17],
    ],
  );
  assert.equal(new Set(batches.flatMap((b) => b.corePages)).size, 17);
  assert.ok(batches.every((b) => new Set(b.pages.map((p) => p.page)).size === b.pages.length));
  assert.deepEqual(batches[1].documentContextPages, [1, 2, 3]);
  assert.deepEqual(batches[1].adjacentContextPages, [8, 17]);
  assert.deepEqual(batches, createTextBatches(result.source, result.pages));
});
test("batch boundaries count UTF-8 JSON and repeated context, shrink core ranges, reject oversized pages", async () => {
  const result = await readWithEngine(file(), fake({ count: 8, items: [item("ą".repeat(33_000))] }).engine);
  const batches = createTextBatches(result.source, result.pages);
  assert.ok(batches.length > 1);
  const split = createTextBatches(result.source, result.pages, { corePagesPerBatch: 2 });
  assert.ok(split.length > 1);
  assert.ok(split.every((b) => b.corePages.length <= 2));
  assert.throws(
    () => createTextBatches(result.source, result.pages, { corePagesPerBatch: 9 }),
    /invalid-core-page-limit/,
  );
  assert.ok(batches.every((b) => batchBodyBytes(b) <= PDF_LIMITS.maxBatchBodyBytes));
  assert.deepEqual(
    batches.flatMap((b) => b.corePages),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  const huge = await readWithEngine(file(), fake({ items: [item("ą".repeat(270_000))] }).engine);
  assert.throws(() => createTextBatches(huge.source, huge.pages), { code: "batch-too-large" });
  const contextual = await readWithEngine(file(), fake({ count: 8, items: [item("ą".repeat(50_000))] }).engine);
  assert.throws(() => createTextBatches(contextual.source, contextual.pages), { code: "batch-too-large" });
  const many = await readWithEngine(file(), fake({ count: 30, items: [item("x".repeat(60_000))] }).engine);
  assert.throws(() => createTextBatches(many.source, many.pages), { code: "text-too-large" });
});

test("real PDF.js reads synthetic columns, rotation, image/empty pages and continuation deterministically", async () => {
  // Legacy provides Node's DOM polyfills; the browser adapter uses the native browser build.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const engine = {
    load(data) {
      const task = pdfjs.getDocument({ data, verbosity: 0, disableFontFace: true, useSystemFonts: false });
      return {
        promise: task.promise.then((doc) => ({
          numPages: doc.numPages,
          async getPage(n) {
            const p = await doc.getPage(n),
              view = p.getViewport({ scale: 1 });
            return {
              width: view.width,
              height: view.height,
              rotation: p.rotate,
              async *chunks() {
                yield (await p.getTextContent({ disableNormalization: true })).items;
              },
              cleanup() {
                p.cleanup();
              },
            };
          },
        })),
        destroy: () => task.destroy(),
      };
    },
  };
  const result = await readWithEngine(file(), engine);
  assert.equal(result.source.pageCount, 5);
  const nonEmpty = (p) => p.items.filter((i) => i.text.trim());
  const first = nonEmpty(result.pages[0]);
  assert.deepEqual(
    first.map((i) => i.text),
    ["Variant A", "Variant B", "Variant C", "Recipe starts here"],
  );
  assert.deepEqual(
    first.slice(0, 3).map((i) => i.transform[4]),
    [30, 220, 410],
  );
  const second = nonEmpty(result.pages[1]);
  assert.ok(second.some((i) => i.text === "Ingredients" && i.transform[4] === 30));
  assert.ok(second.some((i) => i.text === "Instructions" && i.transform[4] === 310));
  const rotated = second.find((i) => i.text === "Rotated note");
  assert.deepEqual(rotated.transform.slice(0, 4), [0, 12, -12, 0]);
  assert.equal(result.pages[2].items.length, 0);
  assert.equal(result.pages[3].items.length, 0);
  assert.equal(nonEmpty(result.pages[4])[0].text, "Recipe continuation");
  assert.deepEqual(result, await readWithEngine(file(), engine));
  assert.equal((await webcrypto.subtle.digest("SHA-256", pdfBytes)).byteLength, 32);
});
