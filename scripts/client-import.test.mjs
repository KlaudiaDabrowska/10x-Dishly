import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientRequestFailure,
  executeClientImport,
  importIdForEvidence,
  polishImportError,
  productCompletion,
} from "../src/lib/pdf-processing/client-import.ts";

const importId = "11111111-1111-4111-8111-111111111111";
const source = {
  version: 1,
  sha256: "a".repeat(64),
  filename: "recipes.pdf",
  byteLength: 100,
  pageCount: 1,
};
const page = {
  page: 1,
  width: 600,
  height: 800,
  rotation: 0,
  items: [
    {
      anchor: { page: 1, itemIndex: 0 },
      text: "Przepis",
      transform: [10, 0, 0, 10, 20, 700],
      width: 50,
      height: 10,
      direction: "ltr",
      hasEOL: true,
    },
  ],
};
const candidate = {
  batchIndex: 0,
  candidateIndex: 0,
  status: "complete",
  candidate: {
    version: 2,
    sourceStart: { page: 1, itemIndex: 0 },
    pages: [1],
    title: "Przepis",
    category: "lunch",
    sourceCategory: null,
    ingredientGroups: [
      { label: null, ingredients: [{ name: "mąka", quantity: "1", unit: "g", sourceText: "1 g mąki" }] },
    ],
    instructions: ["Wymieszaj."],
    servings: null,
    footnotes: [],
    missingFieldReasons: [],
  },
  warnings: [],
  explanations: [],
};
const manifest = {
  version: 1,
  source,
  pageDigests: ["b".repeat(64)],
  batches: [{ batchIndex: 0, corePageStart: 1, corePageEnd: 1, inputDigest: "c".repeat(64), bodyBytes: 100 }],
};

function outcome(overrides = {}) {
  return { status: "committed", saved: 1, alreadySaved: 0, pending: 0, readBack: true, ...overrides };
}

function runner(request, signal = new globalThis.AbortController().signal, options = {}) {
  const states = [];
  return executeClientImport({
    apiBase: "/api/imports",
    file: { name: source.filename, size: source.byteLength, arrayBuffer: async () => new ArrayBuffer(0) },
    signal,
    importId,
    read: async () => ({ source, pages: [page] }),
    request,
    ...options,
    now: (() => {
      let value = 0;
      return () => ++value;
    })(),
    update: (state) => states.push(state),
  }).then((result) => ({ result, states }));
}

test("controller completes read, create, batch and finalize", async () => {
  const calls = [];
  const expected = outcome();
  const { result, states } = await runner(async (path) => {
    calls.push(path);
    if (path === "/api/imports") return { importId, manifestDigest: "digest", manifest };
    if (path.endsWith("/batch")) return { candidates: [candidate] };
    if (path.endsWith("/finalize")) return expected;
    throw new Error(`unexpected request ${path}`);
  });
  assert.deepEqual(calls, ["/api/imports", `/api/imports/${importId}/batch`, `/api/imports/${importId}/finalize`]);
  assert.deepEqual(result.outcome, expected);
  assert.equal(states.at(-1).stage, "saving");
});

test("controller recovers a lost finalize response using status", async () => {
  const expected = outcome({ saved: 0, alreadySaved: 1 });
  let finalizeCalls = 0;
  const { result } = await runner(async (path) => {
    if (path === "/api/imports") return { importId, manifestDigest: "digest", manifest };
    if (path.endsWith("/batch")) return { candidates: [candidate] };
    if (path.endsWith("/finalize")) {
      finalizeCalls++;
      throw new ClientRequestFailure("network-error", true);
    }
    if (path === `/api/imports/${importId}`)
      return { status: "committed", outcome: { saved: 0, alreadySaved: 1, pending: 0 }, readBack: true };
    throw new Error(`unexpected request ${path}`);
  });
  assert.equal(finalizeCalls, 1);
  assert.deepEqual(result.outcome, expected);
});

test("controller waits for an in-flight finalize to become committed after a lost response", async () => {
  const expected = outcome({ saved: 0, alreadySaved: 1 });
  const sleeps = [];
  let statusCalls = 0;
  let finalizeCalls = 0;
  const { result } = await runner(
    async (path) => {
      if (path === "/api/imports") return { importId, manifestDigest: "digest", manifest };
      if (path.endsWith("/batch")) return { candidates: [candidate] };
      if (path.endsWith("/finalize")) {
        finalizeCalls++;
        throw new ClientRequestFailure("network-error", true);
      }
      if (path === `/api/imports/${importId}`) {
        statusCalls++;
        if (statusCalls === 1) return { status: "processing", outcome: null, readBack: false };
        return { status: "committed", outcome: { saved: 0, alreadySaved: 1, pending: 0 }, readBack: true };
      }
      throw new Error(`unexpected request ${path}`);
    },
    undefined,
    {
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    },
  );

  assert.equal(finalizeCalls, 1);
  assert.equal(statusCalls, 2);
  assert.deepEqual(sleeps, [250]);
  assert.deepEqual(result.outcome, expected);
});

test("controller stops before dispatching a batch after cancellation", async () => {
  const abort = new globalThis.AbortController();
  await assert.rejects(
    runner(async (path) => {
      if (path === "/api/imports") {
        abort.abort();
        return { importId, manifestDigest: "digest", manifest };
      }
      throw new Error(`unexpected request ${path}`);
    }, abort.signal),
    (error) => error instanceof ClientRequestFailure && error.code === "cancelled",
  );
});

test("a local reader failure never dispatches create or exposes a server import id", async () => {
  let dispatched = false;
  await assert.rejects(
    executeClientImport({
      apiBase: "/api/imports",
      file: { name: source.filename, size: source.byteLength, arrayBuffer: async () => new ArrayBuffer(0) },
      signal: new globalThis.AbortController().signal,
      importId,
      read: async () => {
        throw new ClientRequestFailure("unreadable-document");
      },
      request: async () => {
        throw new Error("request must not run");
      },
      onImportDispatched: () => {
        dispatched = true;
      },
      update: () => undefined,
    }),
    (error) => error instanceof ClientRequestFailure && error.code === "unreadable-document",
  );
  assert.equal(dispatched, false);
  assert.equal(importIdForEvidence(importId, dispatched), null);
  assert.equal(importIdForEvidence(importId, true), importId);
});

test("product completion distinguishes pending, empty and unconfirmed results", () => {
  assert.equal(productCompletion(outcome()), "redirect");
  assert.equal(productCompletion(outcome({ pending: 1 })), "pending");
  assert.equal(productCompletion(outcome({ saved: 0, alreadySaved: 0 })), "empty");
  assert.equal(productCompletion(outcome({ readBack: false })), "unconfirmed");
  assert.equal(productCompletion(outcome({ status: "processing", readBack: false })), "unconfirmed");
  assert.equal(productCompletion(outcome({ status: "failed" })), "failure");
});

test("known error classes have Polish guidance without exposing internal codes", () => {
  const codes = [
    "file-too-large",
    "too-many-pages",
    "unreadable-document",
    "network-error",
    "import_unavailable",
    "authentication_required",
    "active-import-exists",
    "import-budget-insufficient",
    "processing-timeout",
    "provider-server-error",
    "invalid-response",
  ];
  for (const code of codes) {
    const message = polishImportError(code);
    assert.ok(message.title.length > 0);
    assert.ok(message.action.length > 0);
    assert.equal(`${message.title} ${message.action}`.includes(code), false);
  }
});
