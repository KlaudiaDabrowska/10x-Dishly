import assert from "node:assert/strict";
import test from "node:test";
import { authFailureLocation, publicAuthError } from "../src/lib/auth-errors.ts";
import { normalizeClientErrorCode } from "../src/lib/pdf-processing/client-import.ts";
import {
  publicDecisionReference,
  publicImportStatus,
  publicTerminalOutcome,
} from "../src/lib/pdf-processing/public-contract.ts";
import { pdfFailureEvent, sanitizePdfErrorCode } from "../src/lib/pdf-security.ts";

const SENTINEL = "PRIVATE_PDF_SENTINEL_DO_NOT_EXPOSE";
const DECISION_ID = "5f12c96d-42d7-4dd0-b3db-f1e270f7b90a";

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
  assert.equal(sanitizePdfErrorCode(SENTINEL), "internal-error");
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
  assert.throws(
    () =>
      publicDecisionReference({
        decisionId: DECISION_ID,
        sourceStart: { page: 1, itemIndex: 0 },
        state: "pending",
        missingReasonCodes: [SENTINEL],
      }),
    (error) => error?.code === "import-read-failed" && !String(error).includes(SENTINEL),
  );
  assert.throws(
    () =>
      publicDecisionReference({
        decisionId: SENTINEL,
        sourceStart: { page: 1, itemIndex: 0 },
        state: "pending",
        missingReasonCodes: [],
      }),
    (error) => error?.code === "import-read-failed" && !String(error).includes(SENTINEL),
  );
});

test("unknown client-facing codes normalize before reaching client state or evidence", () => {
  assert.equal(normalizeClientErrorCode("provider-rate-limited"), "provider-rate-limited");
  assert.equal(normalizeClientErrorCode(SENTINEL), "unexpected-error");
  assert.equal(normalizeClientErrorCode({ message: SENTINEL }), "unexpected-error");
});
