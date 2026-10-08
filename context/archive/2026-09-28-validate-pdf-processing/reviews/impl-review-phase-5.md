<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Validate PDF Processing

- **Plan**: context/changes/validate-pdf-processing/plan.md
- **Scope**: Phase 5 of 6
- **Reviewed phases**: 5
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria were re-run at review time:
- `test:pdf:db` 17/17
- `test:pdf` 93/93
- `lint`, `astro check`, `test:deployment` 12/12 and `test:deploy-config` 8/8 pass
- 5.4 (builds, check:deploy, preview isolation, auth smoke) and 5.5 (user-run screen check) were verified before commit b46b966

The Phase 4 handoff is met: candidate digests are recorded durably in the database before the batch handler returns them (`service.ts:192-206`, migration `:292-307`).

## Findings

### F1 — Cancelled or expired import can still reserve and dispatch a paid call

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-processing/service.ts:123; supabase/migrations/20261006120000_pdf_processing_f01_budget_7.sql:64-98
- **Detail**: `processBatch` checks that the import is open without a lock, then counts tokens (a network call of up to 120 s), then reserves. `reserve_pdf_batch` locks the import row but, for a newly inserted batch, checks only identity (owner/fingerprint/manifest digest), not `status = 'processing'` or `expires_at`. Only the 429-retry path checks those. A cancel, failure or expiry in that window still produces a reservation and a paid OpenAI call; `record_pdf_batch_result` then rejects the result, so money is spent and the output discarded. `cancel_pdf_validation_import` and finalize's expiry branch also do not fail `created` batches. No budget leak (the charge is accounted), but it wastes spend, and the plan says cancellation before commit prevents further work.
- **Fix**: In a new additive migration, make `reserve_pdf_batch` refuse a new reservation when the locked import has `batch_count` set and is not `processing` or has expired, and have cancel/expiry fail `created` batches. Add a DB test: cancel, then reserve, and expect no claim and no dispatch.
  - Strength: Closes the race at the single serialization point (the locked import row) the plan already relies on.
  - Tradeoff: Touches a Phase 3/4 accounting RPC, which needs a careful migration and a re-run of all ledger tests. Ledger-only imports (`batch_count` null) must keep their behavior.
  - Confidence: HIGH — read the function body; the check exists only on the retry branch.
  - Blind spot: Not reproduced live; this is a timing window of a few seconds.
- **Decision**: FIXED — migration 20261007100000 (reserve_pdf_batch refuses non-processing/expired validation imports; cancel/fail close created batches), `import-not-processing` mapping in import-state.ts, DB test "a cancel that lands after the open check…" (break-check red without the guard).

### F2 — Cancel during create can leave an un-cancellable active import (409 for up to 5 min)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/pdf-processing/PdfValidationPanel.tsx:147-154, :227-230
- **Detail**: While the create request is in flight, the client does not know the import id. Cancel aborts only the browser fetch. If the server completes, a `processing` import remains that no one can cancel. The next attempt gets `active-import-exists` until it expires (≤300 s). A lost create response has the same effect. No cost (create only counts tokens), but it blocks the evaluator and complicates the Phase 6 matrix.
- **Fix A ⭐ Recommended**: The client generates the import id (UUID) and sends it in create; the server uses it as an idempotency key, so the client can always cancel/check status by that id.
  - Strength: Also solves the lost-create-response case and matches how status already recovers lost finalize responses.
  - Tradeoff: Changes the create contract (API + panel + DB test); the server must reject reuse of an id by another owner.
  - Confidence: MEDIUM — straightforward, but touches three layers.
  - Blind spot: Retries of create under the same id with different text must be rejected explicitly.
- **Fix B**: `create_pdf_validation_import` closes the owner's earlier `processing` import that has no dispatched batches before rejecting.
  - Strength: Server-only change, small.
  - Tradeoff: Implicit cancellation; an import with an in-flight batch still blocks.
  - Confidence: MEDIUM.
  - Blind spot: Interaction with a concurrently running batch from another tab.
- **Decision**: FIXED (Fix A) — create takes a browser-chosen `importId` (idempotency key; same owner + manifest returns the existing import, any other reuse → `import-id-conflict` 409) in migration 20261007100000; the panel sets the id before sending and cancels an unconfirmed id before the next import; DB test "a client-chosen import id…" (break-check red without the idempotency branch).

### F3 — Production deploy now requires experiment secrets, contrary to "missing config disables"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: wrangler.jsonc:17-25; .env.example:4
- **Detail**: `secrets.required` now includes `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `PDF_VALIDATION_ENABLED` and `PDF_VALIDATION_EVALUATOR_IDS`, so `publish-workers` refuses a production deploy until all four are set, even with the experiment off. The plan says missing configuration disables the experiment and the switch defaults off. `.env.example` says missing values keep it disabled, which contradicts the deploy guard. The plan also says to keep secret guards synchronized, so this is a real choice.
- **Fix**: Decide explicitly. Either keep it required and correct the `.env.example` comment and the deployment note (production must set `PDF_VALIDATION_ENABLED=false` explicitly), or drop the four from `secrets.required`/`requiredSecrets` and keep runtime fail-closed.
- **Decision**: FIXED — experiment secrets are optional: removed from `wrangler.jsonc` `secrets.required` and `requiredSecrets` (back to the pre-Phase 5 set); still forbidden as plain vars and preview secrets; runtime stays fail-closed. deploy-config test asserts they are never required (break-check red when one is re-added).

### F4 — Deterministic database rejections surface as HTTP 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/pdf-processing/persistence.ts:61-74; src/lib/pdf-validation.ts:48-59
- **Detail**: Only six RPC error messages map to codes. `manifest mismatch`, `invalid finalization`, `invalid batch result`, `batch is not reconciled` and `invalid validation import` fall through to generic codes absent from `STATUS_BY_CODE`, so the client sees 500 for predictable rejections, and the screen shows `internal-error`.
- **Fix**: Map these messages to existing codes (`manifest-mismatch`, `invalid-request`, `batch-results-missing`) with 400/409 statuses, and add them to `STATUS_BY_CODE`.
- **Decision**: FIXED — `RPC_REJECTIONS` table in persistence.ts maps every deterministic RPC rejection to an existing code (`manifest-mismatch`, `invalid-request`, `batch-results-missing`, …); `invalid-request` → 400 in STATUS_BY_CODE; unknown DB errors stay generic. Unit test in pdf-processing.test.mjs.

### F5 — Unexpected errors leave no server-side trace

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-validation.ts:62-69
- **Detail**: Unknown errors become `internal-error` with no log line, and the `cause` attached in `persistence.ts` is never read. Phase 6 needs outcome evidence from the actual host, and failed runs will be hard to diagnose.
- **Fix**: Log only the error name/code, route and import id (no content, no messages from the provider or DB).
- **Decision**: FIXED — `errorResponse` logs one content-free JSON line (`pdf_validation_error`: route, status, error name/code, SQLSTATE) for every 5xx, following the `logProbe` pattern; routes pass their name.

### F6 — Status GET ignores the result of closing an expired import

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-processing/service.ts:304
- **Detail**: `status()` calls `close_expired_pdf_import` and does not check its `error`. Low risk: it acts only on the owner's own expired imports.
- **Fix**: Check `error` and map it to `import-update-failed`.
- **Decision**: FIXED — `status()` checks the `close_expired_pdf_import` error and throws `import-update-failed` (logged as 5xx by F5).

### F7 — O(n²) lookup in finalize and an unchunked read-back

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-processing/service.ts:264; src/lib/pdf-validation.ts:154-157
- **Detail**: `submitted.find(...)` runs inside the reconciled loop, up to about 3,200 × 3,200 comparisons in the worst case, which costs Workers CPU. `verifyReadBack` sends every id in one `.in()` GET; a few hundred recipes can exceed URL limits and falsely report a failed read-back. Neither matters for the 5-recipe fixtures.
- **Fix**: Use a map keyed by `batch:page:item`, and chunk the read-back ids (about 100 per request).
- **Decision**: FIXED — finalize builds a first-wins map keyed by `batch:page:item` (same semantics as `find`); `verifyReadBack` reads ids in chunks of 100.

### F8 — Mixed error-code styles and the ready state never used

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/pdf-validation.ts:123-137; migration :435
- **Detail**: The guard returns snake_case codes (`authentication_required`, `cross_origin_forbidden`), the rest of the API uses kebab-case. The plan's `processing → ready → committed` flow skips `ready`: finalize accepts `processing` directly. Behavior is unaffected. There is also no DB test for finalizing an already-expired import, though the code enforces it (migration :439-443).
- **Fix**: Leave the codes (the middleware and preview checks depend on the snake_case `experiment_unavailable`); record the `ready` simplification in evaluation.md; optionally add the expired-finalize test.
- **Decision**: FIXED — `ready` simplification and the snake_case guard codes recorded in evaluation.md; DB test "an import that expired before finalize saves nothing…" added (break-check red without the expiry branch). Codes left unchanged.
