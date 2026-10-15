import assert from "node:assert/strict";
import test from "node:test";
import {
  canResolveClientDecision,
  ClientRequestFailure,
  executeClientImport,
  hasUnresolvedLocalDecisions,
  importIdForEvidence,
  joinProductDecisions,
  mayClearLocalDecisions,
  mergeDecisionOutcome,
  mergeDecisionReferences,
  polishImportError,
  productCompletion,
  resolveClientDecision,
  warnBeforeUnresolvedDecisionNavigation,
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
  assert.equal(productCompletion(outcome({ saved: 0, alreadySaved: 0, discarded: 2 })), "discarded");
  assert.equal(productCompletion(outcome({ readBack: false })), "unconfirmed");
  assert.equal(productCompletion(outcome({ status: "processing", readBack: false })), "unconfirmed");
  assert.equal(productCompletion(outcome({ status: "failed" })), "failure");
});

const incompleteCandidate = {
  ...candidate,
  status: "incomplete",
  candidate: {
    ...candidate.candidate,
    title: null,
    category: null,
    missingFieldReasons: [
      { code: "missing-category", fieldPath: "category" },
      { code: "missing-title", fieldPath: "title" },
    ],
  },
  explanations: ["Brakuje kategorii.", "Brakuje tytułu przepisu."],
};
const decisionId = "22222222-2222-4222-8222-222222222222";

function pendingProductOutcome(overrides = {}) {
  return outcome({
    saved: 0,
    pending: 1,
    kept: 0,
    discarded: 0,
    decisions: [
      {
        decisionId,
        sourceStart: incompleteCandidate.candidate.sourceStart,
        state: "pending",
        missingReasonCodes: ["missing-title", "missing-category"],
        recipeId: null,
        resolvedAt: null,
      },
    ],
    ...overrides,
  });
}

test("product decisions use one canonical source card and preserve evaluation candidates separately", () => {
  const duplicate = {
    ...incompleteCandidate,
    batchIndex: 1,
    candidateIndex: 4,
    candidate: { ...incompleteCandidate.candidate, pages: [1, 2] },
  };
  const decisions = joinProductDecisions([incompleteCandidate, duplicate], pendingProductOutcome());
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0].candidate.pages, [1, 2]);
  assert.deepEqual(decisions[0].missingMessages, ["Brakuje tytułu przepisu.", "Brakuje kategorii."]);
  assert.equal([incompleteCandidate, duplicate].filter((item) => item.status !== "complete").length, 2);
});

test("decision actions lock only the active card and unresolved payloads protect destructive transitions", () => {
  const [pending] = joinProductDecisions([incompleteCandidate], pendingProductOutcome());
  const second = { ...pending, decisionId: "33333333-3333-4333-8333-333333333333" };
  const keeping = { ...pending, status: "keeping" };
  assert.equal(canResolveClientDecision(pending, false), true);
  assert.equal(canResolveClientDecision(pending, true), false);
  assert.equal(canResolveClientDecision(keeping, false), false);
  assert.equal(canResolveClientDecision(second, false), true);
  assert.equal(hasUnresolvedLocalDecisions([keeping]), true);

  for (const action of ["reset", "new-file", "rerun"]) {
    let confirms = 0;
    assert.equal(
      mayClearLocalDecisions(action, [pending], "product", () => {
        confirms++;
        return false;
      }),
      false,
    );
    assert.equal(confirms, 1);
    assert.equal(
      mayClearLocalDecisions(action, [pending], undefined, () => false),
      true,
    );
  }
  assert.equal(hasUnresolvedLocalDecisions([{ ...pending, status: "kept" }]), false);
  const navigationEvent = {
    prevented: false,
    returnValue: undefined,
    preventDefault() {
      this.prevented = true;
    },
  };
  assert.equal(warnBeforeUnresolvedDecisionNavigation([pending], navigationEvent), true);
  assert.equal(navigationEvent.prevented, true);
  assert.equal(navigationEvent.returnValue, "");
});

test("a decision response preserves another card's independent submitting state", () => {
  const [pending] = joinProductDecisions([incompleteCandidate], pendingProductOutcome());
  const otherId = "33333333-3333-4333-8333-333333333333";
  const other = { ...pending, decisionId: otherId, status: "discarding" };
  const references = [
    { ...pendingProductOutcome().decisions[0], state: "kept", recipeId: "44444444-4444-4444-8444-444444444444" },
    { ...pendingProductOutcome().decisions[0], decisionId: otherId },
  ];
  const merged = mergeDecisionReferences([pending, other], references);
  assert.equal(merged[0].status, "kept");
  assert.equal(merged[1].status, "discarding");
  assert.equal(productCompletion(outcome({ saved: 1, pending: 0, discarded: 1 })), "redirect");
});

test("late concurrent responses cannot regress resolved cards or outcome counters", () => {
  const [pending] = joinProductDecisions([incompleteCandidate], pendingProductOutcome());
  const resolved = { ...pending, status: "discarded", recipeId: null };
  const staleReference = pendingProductOutcome().decisions[0];
  const [merged] = mergeDecisionReferences([resolved], [staleReference]);
  assert.equal(merged.status, "discarded");

  const latest = outcome({ saved: 1, pending: 0, kept: 1, discarded: 1 });
  const stale = outcome({ saved: 0, pending: 1, kept: 1, discarded: 0 });
  assert.deepEqual(mergeDecisionOutcome(latest, stale), {
    ...stale,
    saved: 1,
    pending: 0,
    kept: 1,
    discarded: 1,
    readBack: true,
  });
});

test("keep and discard responses update decision-aware outcomes", async () => {
  const [decision] = joinProductDecisions([incompleteCandidate], pendingProductOutcome());
  for (const action of ["keep", "discard"]) {
    const state = action === "keep" ? "kept" : "discarded";
    const reference = {
      ...pendingProductOutcome().decisions[0],
      state,
      recipeId: action === "keep" ? "44444444-4444-4444-8444-444444444444" : null,
      resolvedAt: "2026-10-15T10:00:00.000Z",
    };
    const resolvedOutcome = pendingProductOutcome({
      pending: 0,
      kept: action === "keep" ? 1 : 0,
      discarded: action === "discard" ? 1 : 0,
      saved: action === "keep" ? 1 : 0,
      decisions: [reference],
    });
    let body;
    const result = await resolveClientDecision({
      apiBase: "/api/imports",
      importId,
      decision,
      action,
      request: async (path, init) => {
        assert.equal(path, `/api/imports/${importId}/decisions/${decisionId}`);
        body = JSON.parse(init.body);
        return { decision: reference, outcome: resolvedOutcome, readBack: true };
      },
    });
    assert.equal(result.decision.state, state);
    assert.equal(result.outcome.pending, 0);
    assert.equal("candidate" in body, action === "keep");
  }
});

test("a lost decision response recovers the durable result from status without resubmitting", async () => {
  const [decision] = joinProductDecisions([incompleteCandidate], pendingProductOutcome());
  const kept = {
    ...pendingProductOutcome().decisions[0],
    state: "kept",
    recipeId: "44444444-4444-4444-8444-444444444444",
    resolvedAt: "2026-10-15T10:00:00.000Z",
  };
  let resolveCalls = 0;
  let statusCalls = 0;
  const sleeps = [];
  const result = await resolveClientDecision({
    apiBase: "/api/imports",
    importId,
    decision,
    action: "keep",
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    request: async (path) => {
      if (path.endsWith(`/decisions/${decisionId}`)) {
        resolveCalls++;
        throw new ClientRequestFailure("network-error", true);
      }
      statusCalls++;
      const reference = statusCalls === 1 ? pendingProductOutcome().decisions[0] : kept;
      return {
        status: "committed",
        readBack: true,
        outcome: {
          saved: statusCalls === 1 ? 0 : 1,
          alreadySaved: 0,
          pending: statusCalls === 1 ? 1 : 0,
          kept: statusCalls === 1 ? 0 : 1,
          discarded: 0,
          savedIds: [],
          existingIds: [],
          decisions: [reference],
        },
      };
    },
  });
  assert.equal(resolveCalls, 1);
  assert.equal(statusCalls, 2);
  assert.deepEqual(sleeps, [250]);
  assert.equal(result.decision.state, "kept");
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
