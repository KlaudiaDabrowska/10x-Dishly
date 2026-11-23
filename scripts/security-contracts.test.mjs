import assert from "node:assert/strict";
import test from "node:test";
import { authFailureLocation, publicAuthError } from "../src/lib/auth-errors.ts";
import { normalizeClientErrorCode } from "../src/lib/pdf-processing/client-import.ts";
import {
  publicDecisionReference,
  publicImportOutcome,
  publicImportStatus,
  publicTerminalOutcome,
} from "../src/lib/pdf-processing/public-contract.ts";
import { pdfFailureEvent, sanitizePdfErrorCode } from "../src/lib/pdf-security.ts";

const SENTINEL = "PRIVATE_PDF_SENTINEL_DO_NOT_EXPOSE";
const DECISION_ID = "5f12c96d-42d7-4dd0-b3db-f1e270f7b90a";
const PUBLIC_PDF_ERROR_CODES = [
  "active-import-exists",
  "authentication-required",
  "batch-already-dispatched",
  "batch-already-processed",
  "batch-result-recording-failed",
  "batch-results-missing",
  "batch-too-large",
  "decision-conflict",
  "decision-payload-mismatch",
  "decision-resolution-failed",
  "encrypted-document",
  "file-size-changed",
  "finalization-failed",
  "import-budget-insufficient",
  "import-cancel-failed",
  "import-creation-failed",
  "import-id-conflict",
  "import-not-found",
  "import-not-processing",
  "import-read-failed",
  "import-update-failed",
  "input-token-accounting-mismatch",
  "input-token-count-incompatible",
  "input-token-count-unavailable",
  "input-token-limit-exceeded",
  "internal-error",
  "invalid-document",
  "invalid-json",
  "invalid-layout",
  "invalid-page-sequence",
  "invalid-processing-start",
  "invalid-request",
  "manifest-mismatch",
  "outcome-missing",
  "output-token-accounting-mismatch",
  "output-token-limit-exceeded",
  "payload-digest-mismatch",
  "pricing-model-incompatible",
  "processing-timeout",
  "provider-blocked",
  "provider-configuration-error",
  "provider-http-error",
  "provider-incomplete-response",
  "provider-invalid-structured-output",
  "provider-malformed-json",
  "provider-malformed-response",
  "provider-missing-candidates",
  "provider-missing-output",
  "provider-missing-usage",
  "provider-rate-limited",
  "provider-refused",
  "provider-response-too-large",
  "provider-server-error",
  "provider-timeout",
  "provider-transport-error",
  "reader-timeout",
  "reconciliation-failed",
  "request-too-large",
  "reservation-failed",
  "text-too-large",
  "too-many-batches",
  "unreadable-document",
  "worker-origin",
];
const CLIENT_CODES_IN_MUTATION_SCOPE = [
  "text-too-large",
  "too-many-batches",
  "too-many-pages",
  "unexpected-error",
  "unreadable-document",
  "unsupported-media-type",
  "worker-origin",
];
const IMPORT_STATUSES = ["created", "processing", "ready", "committed", "failed", "cancelled"];
const DECISION_STATES = ["pending", "kept", "discarded"];
const OMISSION_CODES = [
  "missing-title",
  "missing-ingredients",
  "missing-instructions",
  "missing-category",
  "missing-source-metadata",
  "missing-ingredient-content",
  "missing-variant-content",
  "missing-continuation",
  "absent-servings",
  "absent-footnotes",
];

function assertImportReadFailed(run) {
  assert.throws(run, (error) => error?.code === "import-read-failed" && !String(error).includes(SENTINEL));
}

function decision(overrides = {}) {
  return {
    decisionId: DECISION_ID,
    sourceStart: { page: 1, itemIndex: 0 },
    state: "pending",
    missingReasonCodes: ["missing-title"],
    ...overrides,
  };
}

test("auth exposes fixed copy only for the public auth_failed code", () => {
  assert.equal(publicAuthError("signin", "auth_failed"), "Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.");
  assert.equal(
    publicAuthError("signup", "auth_failed"),
    "Nie udało się utworzyć konta. Sprawdź dane i spróbuj ponownie.",
  );
  assert.equal(publicAuthError("signin", SENTINEL), null);
  assert.equal(publicAuthError("signup", "provider_error"), null);
  assert.equal(authFailureLocation("signin"), "/auth/signin?error=auth_failed");
  assert.equal(authFailureLocation("signup"), "/auth/signup?error=auth_failed");
});

test("generic PDF failure event has an exact content-free allowlist", () => {
  const providerError = new Error(SENTINEL, {
    cause: { code: "23505", message: SENTINEL, body: { sourceText: SENTINEL } },
  });
  Object.assign(providerError, { code: SENTINEL, providerBody: SENTINEL });
  const event = pdfFailureEvent(providerError, 500, "status", "product", "internal-error");
  assert.deepEqual(Object.keys(event), ["event", "channel", "route", "status", "code", "db_code"]);
  assert.deepEqual(event, {
    event: "pdf_import_error",
    channel: "product",
    route: "status",
    status: 500,
    code: "internal-error",
    db_code: "23505",
  });
  assert.equal(JSON.stringify(event).includes(SENTINEL), false);
  assert.equal(
    pdfFailureEvent(new Error(SENTINEL, { cause: { code: SENTINEL } }), 500, "status", "product", "internal-error")
      .db_code,
    null,
  );
  for (const code of PUBLIC_PDF_ERROR_CODES) assert.equal(sanitizePdfErrorCode(code), code);
  for (const value of [SENTINEL, "", null, undefined, 500, { code: "import-not-found" }])
    assert.equal(sanitizePdfErrorCode(value), "internal-error");

  for (const cause of [undefined, null, {}, { code: 23505 }, { code: "2350" }, { code: "23505x" }, { code: "abcde" }]) {
    const error = cause === undefined ? SENTINEL : new Error(SENTINEL, { cause });
    assert.equal(pdfFailureEvent(error, 500, "status", "product", "internal-error").db_code, null);
  }
});

test("status and decisions are rebuilt from exact public allowlists", () => {
  const privateDecision = {
    decisionId: DECISION_ID,
    sourceStart: { page: 2, itemIndex: 4, sourceText: SENTINEL },
    state: "pending",
    missingReasonCodes: ["missing-title"],
    recipeId: SENTINEL,
    resolvedAt: SENTINEL,
    providerPayload: SENTINEL,
  };
  const status = publicImportStatus(
    {
      importId: SENTINEL,
      expiresAt: SENTINEL,
      batchCount: 1,
      status: "committed",
      outcome: {
        saved: 1,
        alreadySaved: 0,
        pending: 1,
        kept: 0,
        discarded: 0,
        decisions: [privateDecision],
        savedIds: [SENTINEL],
        existingIds: [SENTINEL],
        committedAt: SENTINEL,
      },
    },
    "product",
  );
  const response = { ...status, readBack: true };
  assert.deepEqual(Object.keys(response), ["status", "outcome", "readBack"]);
  assert.deepEqual(Object.keys(response.outcome), [
    "saved",
    "alreadySaved",
    "pending",
    "kept",
    "discarded",
    "decisions",
  ]);
  assert.deepEqual(Object.keys(response.outcome.decisions[0]), [
    "decisionId",
    "sourceStart",
    "state",
    "missingReasonCodes",
  ]);
  assert.deepEqual(Object.keys(response.outcome.decisions[0].sourceStart), ["page", "itemIndex"]);
  assert.equal(JSON.stringify(response).includes(SENTINEL), false);

  const terminal = publicTerminalOutcome(
    {
      status: "committed",
      saved: 1,
      alreadySaved: 0,
      pending: 0,
      savedIds: [SENTINEL],
      existingIds: [],
    },
    "evaluation",
  );
  assert.deepEqual(Object.keys(terminal), ["status", "saved", "alreadySaved", "pending"]);
});

test("malformed required public fields fail closed with a sanitized code", () => {
  for (const value of [null, [], SENTINEL, 1]) assertImportReadFailed(() => publicImportStatus(value, "product"));
  for (const status of IMPORT_STATUSES) {
    assert.deepEqual(publicImportStatus({ status, outcome: null }, "product"), { status, outcome: null });
    assert.equal(publicTerminalOutcome({ status, saved: 0, alreadySaved: 0, pending: 0 }, "evaluation").status, status);
  }
  for (const status of [SENTINEL, "", null, 1]) {
    assertImportReadFailed(() => publicImportStatus({ status, outcome: null }, "product"));
    assertImportReadFailed(() =>
      publicTerminalOutcome({ status, saved: 0, alreadySaved: 0, pending: 0 }, "evaluation"),
    );
  }

  for (const field of ["saved", "alreadySaved", "pending"]) {
    for (const invalid of [undefined, null, "0", -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      assertImportReadFailed(() =>
        publicImportOutcome({ saved: 0, alreadySaved: 0, pending: 0, [field]: invalid }, "evaluation"),
      );
    }
  }
  for (const field of ["kept", "discarded"]) {
    assertImportReadFailed(() =>
      publicImportOutcome(
        { saved: 0, alreadySaved: 0, pending: 0, kept: 0, discarded: 0, decisions: [], [field]: -1 },
        "product",
      ),
    );
  }
  assertImportReadFailed(() =>
    publicImportOutcome({ saved: 0, alreadySaved: 0, pending: 0, kept: 0, discarded: 0, decisions: null }, "product"),
  );

  for (const state of DECISION_STATES) assert.equal(publicDecisionReference(decision({ state })).state, state);
  assert.deepEqual(
    publicDecisionReference(decision({ missingReasonCodes: OMISSION_CODES })).missingReasonCodes,
    OMISSION_CODES,
  );
  for (const invalid of [SENTINEL, `prefix-${DECISION_ID}`, `${DECISION_ID}-suffix`, null, 1])
    assertImportReadFailed(() => publicDecisionReference(decision({ decisionId: invalid })));
  for (const sourceStart of [
    null,
    [],
    SENTINEL,
    { page: 0, itemIndex: 0 },
    { page: 1.5, itemIndex: 0 },
    { page: 1, itemIndex: -1 },
    { page: 1, itemIndex: 0.5 },
  ])
    assertImportReadFailed(() => publicDecisionReference(decision({ sourceStart })));
  for (const state of [SENTINEL, "", null, 1])
    assertImportReadFailed(() => publicDecisionReference(decision({ state })));
  for (const missingReasonCodes of [null, SENTINEL, [SENTINEL], [1]])
    assertImportReadFailed(() => publicDecisionReference(decision({ missingReasonCodes })));
});

test("unknown client-facing codes normalize before reaching client state or evidence", () => {
  for (const code of CLIENT_CODES_IN_MUTATION_SCOPE) assert.equal(normalizeClientErrorCode(code), code);
  for (const value of [SENTINEL, "", null, undefined, 500, { message: SENTINEL }])
    assert.equal(normalizeClientErrorCode(value), "unexpected-error");
});
