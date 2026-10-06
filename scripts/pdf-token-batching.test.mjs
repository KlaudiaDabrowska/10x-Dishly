import assert from "node:assert/strict";
import test from "node:test";
import { PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";
import { OpenAiPdfError, prepareOpenAiPdfBatches } from "../src/lib/pdf-processing/openai.ts";

function document() {
  const source = { version: 1, sha256: "f".repeat(64), filename: "synthetic.pdf", byteLength: 100, pageCount: 10 };
  const pages = Array.from({ length: 10 }, (_, index) => ({
    page: index + 1,
    width: 600,
    height: 800,
    rotation: 0,
    items: [
      {
        anchor: { page: index + 1, itemIndex: 0 },
        text: index === 0 ? "Dinner" : "Source text",
        transform: [12, 0, 0, 12, 30, 700],
        width: 100,
        height: 12,
        direction: "ltr",
        hasEOL: true,
      },
    ],
  }));
  return { source, pages };
}

function tokenResponse(tokens) {
  return new globalThis.Response(JSON.stringify({ object: "response.input_tokens", input_tokens: tokens }), {
    headers: { "content-type": "application/json" },
  });
}

test("oversize token counts rebuild deterministic narrower ranges with intact ownership and all context", async () => {
  const { source, pages } = document();
  const attempts = [];
  const calls = [];
  const options = {
    apiKey: "offline-test",
    processingStartedAt: 100,
    now: () => 100,
    onCountAttempt(batch, attempt) {
      attempts.push({ attempt, core: batch.corePages });
    },
    async fetch(url, init) {
      assert.ok(url.endsWith("/responses/input_tokens"), "preflight must never use the paid endpoint");
      const request = JSON.parse(init.body);
      const input = JSON.parse(request.input);
      calls.push(input);
      return tokenResponse(input.corePages.length > 2 ? PDF_LIMITS.maxInputTokens + 1 : 100);
    },
  };
  const batches = await prepareOpenAiPdfBatches(source, pages, options);
  assert.deepEqual(
    batches.map((batch) => batch.corePages),
    [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ],
  );
  assert.deepEqual(
    batches.flatMap((batch) => batch.corePages),
    pages.map((page) => page.page),
  );
  assert.deepEqual(
    attempts.map((entry) => entry.attempt),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    calls.slice(0, 2).map((input) => input.corePages.length),
    [8, 4],
  );
  for (const batch of batches) {
    assert.deepEqual(batch.documentContextPages, [1, 2, 3]);
    assert.equal(new Set(batch.pages.map((page) => page.page)).size, batch.pages.length);
    for (const page of batch.pages) assert.deepEqual(page, pages[page.page - 1]);
  }
  const final = calls.at(-1);
  assert.deepEqual(final.pages.find((page) => page.page === 1).roles, ["document-context"]);
  assert.deepEqual(final.pages.find((page) => page.page === 8).roles, ["adjacent-context"]);
  assert.deepEqual(final.pages.find((page) => page.page === 9).roles, ["core"]);
  assert.deepEqual(await prepareOpenAiPdfBatches(source, pages, { ...options, onCountAttempt: undefined }), batches);
});

test("non-limit counting failures stop immediately without rebatching or any paid request", async () => {
  const { source, pages } = document();
  for (const failure of [
    new OpenAiPdfError("input-token-count-unavailable"),
    new OpenAiPdfError("cancelled"),
    new Error("local-count-error"),
  ]) {
    let attempts = 0;
    let network = 0;
    await assert.rejects(
      prepareOpenAiPdfBatches(source, pages, {
        apiKey: "offline-test",
        onCountAttempt() {
          attempts++;
        },
        async countInput() {
          throw failure;
        },
        async fetch() {
          network++;
          throw Error("must-not-dispatch");
        },
      }),
      (error) => error === failure,
    );
    assert.equal(attempts, 1);
    assert.equal(network, 0);
  }
});

test("irreducible one-core-page input stops after bounded counting and never reaches a paid endpoint", async () => {
  const { source, pages } = document();
  const cores = [];
  let countCalls = 0;
  await assert.rejects(
    prepareOpenAiPdfBatches(source, pages, {
      apiKey: "offline-test",
      onCountAttempt(batch) {
        cores.push(batch.corePages.length);
      },
      async fetch(url) {
        assert.ok(url.endsWith("/responses/input_tokens"));
        countCalls++;
        return tokenResponse(PDF_LIMITS.maxInputTokens + 1);
      },
    }),
    { code: "input-token-limit-exceeded" },
  );
  assert.deepEqual(cores, [8, 4, 2, 1]);
  assert.equal(countCalls, 4);
});

test("every count across splitting shares one import start timestamp", async () => {
  const { source, pages } = document();
  for (const explicit of [true, false]) {
    let clock = 1_000;
    const starts = [];
    const batches = await prepareOpenAiPdfBatches(source, pages, {
      apiKey: "offline-test",
      now: () => clock++,
      ...(explicit ? { processingStartedAt: 900 } : {}),
      async countInput(batch, _options, startedAt) {
        starts.push(startedAt);
        clock += 1_000;
        if (batch.corePages.length > 4) throw new OpenAiPdfError("input-token-limit-exceeded");
        return 100;
      },
    });
    assert.equal(batches.length, 3);
    assert.deepEqual(starts, Array(4).fill(explicit ? 900 : 1_000));
  }
});

test("token counting receives changed geometry on repeated document context", async () => {
  const { source, pages } = document();
  const collect = async (inputPages) => {
    const requests = [];
    await prepareOpenAiPdfBatches(source, inputPages, {
      apiKey: "offline-test",
      async fetch(url, init) {
        assert.ok(url.endsWith("/responses/input_tokens"));
        requests.push(JSON.parse(init.body));
        return tokenResponse(100);
      },
    });
    return requests;
  };
  const original = await collect(pages);
  const changed = globalThis.structuredClone(pages);
  changed[0].width = 900;
  changed[0].items[0].transform[4] = 400;
  const updated = await collect(changed);
  assert.equal(original.length, 2);
  for (let index = 0; index < original.length; index++) {
    assert.notEqual(original[index].input, updated[index].input);
    const page = JSON.parse(updated[index].input).pages[0];
    assert.equal(page.width, 900);
    assert.equal(page.items[0].transform[4], 400);
    assert.equal(page.items[0].text, "Dinner");
  }
  assert.deepEqual(JSON.parse(updated[1].input).pages[0].roles, ["document-context"]);
});
