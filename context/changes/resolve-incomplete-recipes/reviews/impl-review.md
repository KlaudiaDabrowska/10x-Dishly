<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Resolve Incomplete Recipes Implementation Plan

- **Plan**: context/changes/resolve-incomplete-recipes/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Stale read-back truth can allow an unconfirmed redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-processing/client-import.ts:203
- **Detail**: `mergeDecisionOutcome` combines `readBack` with boolean OR. Product finalization can legitimately return `readBack = true` when the import contains only pending decisions and there are no recipe IDs to verify. If a later keep inserts a recipe but its owner-scoped read-back fails, merging preserves the earlier `true`; once pending reaches zero, `productCompletion` can redirect despite the kept recipe never being confirmed. Concurrent partial responses have the same problem because the boolean is not tied to the IDs represented by the merged counters.
- **Fix**: Make the resolve endpoint verify every `savedId` and `existingId` in its returned outcome, and have the client use the incoming read-back result rather than OR-ing unrelated confirmations. Add regression cases for finalize-true → keep-false and concurrent stale responses.
  - Strength: Restores the plan's redirect invariant and matches the full-outcome verification already used by finalize/status.
  - Tradeoff: Resolve read-back may query more than the single decision recipe, though the existing chunked helper bounds the request.
  - Confidence: HIGH — the initial vacuous `true` and the current OR are directly observable in the implementation.
  - Blind spot: A richer client model could associate confirmations with ID sets, but the current client outcome does not carry those IDs.
- **Decision**: FIXED — resolve now verifies the complete outcome ID set; client merging ties read-back to monotonic recipe counts, with regression coverage for unconfirmed keeps and stale responses.

### F2 — Blank incomplete titles cannot be kept

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-processing/validation.ts:213
- **Detail**: Validation correctly adds `missing-title` for an empty or whitespace-only title, but the canonical candidate retains the original non-null string. The keep RPC then attempts to store that string while the database requires `title is null` exactly when `missing-title` is present and separately rejects blank titles. The UI therefore offers Keep for a validated incomplete candidate that the persistence contract cannot save.
- **Fix**: Canonicalize an empty or whitespace-only validated title to `null` before normalization, reconciliation, and digesting; add unit and keep-path regression coverage.
- **Decision**: FIXED — validation now canonicalizes empty and whitespace-only titles to `null` before reconciliation and digesting, with focused regression coverage.

### F3 — Commit-after-cancel recovery can lose the only decision cards

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/pdf-processing/client-import.ts:645
- **Detail**: If the user cancels while finalize is in flight, the server may commit before the aborted response reaches the browser. `executeClientImport` rethrows the non-lost `cancelled` failure; the outer recovery can discover a committed outcome, but it updates only stage/outcome and does not rebuild decisions from the still-local candidates. A pending count can then be shown without actionable cards, and leaving the tab loses the only candidate payloads.
- **Fix**: Preserve candidates through post-finalize recovery and rebuild product decisions whenever recovered status is committed; add a cancel-after-server-commit test with a pending decision.
  - Strength: Keeps the current-tab-only payload guarantee usable in the exact race where the server won commit.
  - Tradeoff: Requires moving or widening recovery state so candidates remain available to the outer branch.
  - Confidence: HIGH — the normal path builds decisions at lines 627–636, while the committed recovery branch at lines 650–660 omits them.
  - Blind spot: Browser timing may make the race uncommon, but it cannot make it impossible.
- **Decision**: FIXED — cancelled finalize responses now recover only a confirmed committed status and return the retained local candidates, with a regression test that rebuilds the pending decision card.

### F4 — Manual gate 4.6 is checked without the stated end-to-end evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/resolve-incomplete-recipes/visual-verification.md:65
- **Detail**: The authenticated smoke directly seeded content-free decision metadata and exercised resolve/status, rather than running a product create → batch → finalize import. The navigation warning was supported by unit tests and preview evidence, not observed in an authenticated browser session. Those are useful component-level proofs, but they do not fully satisfy the exact manual criterion marked complete in Progress 4.6.
- **Fix**: Return Progress 4.6 to pending until an authenticated browser-level product import verifies the complete flow and navigation warning, then record the exact evidence without substituting unit/preview checks.
  - Strength: Makes the plan's source of truth accurately reflect the evidence actually gathered.
  - Tradeoff: Requires another explicitly authorized runtime session and may invoke the configured AI provider.
  - Confidence: HIGH — the verification record explicitly describes the metadata-seeded harness and substituted navigation evidence.
  - Blind spot: A prior manual browser run not recorded in the repository would change this conclusion.
- **Decision**: FIXED — an explicitly authorized authenticated headless-browser run exercised real product
  create → batch → finalize → resolve calls through the configured AI provider. Keep-all (one decision), discard-all
  (one decision), and mixed keep/discard (two decisions) all passed, including the active-tab navigation warning,
  owner-scoped read-back, redirect semantics, and neutral discard-all completion. Temporary runtime artifacts and the
  test account were removed, Supabase was stopped, and ports 4321/4322/4323 were confirmed free.

### F5 — Roadmap narrative still describes S-03 as not started

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:228
- **Detail**: The roadmap status remains `in-progress`, which is consistent with the toolkit lifecycle until archive, but the readiness, sequence, and next-move prose still says S-03 “can be planned” or “may proceed.” That prose is stale after implementation and review and weakens the Phase 4 documentation handoff.
- **Fix**: Update the narrative/readiness rows to describe S-03 as implemented and awaiting archive while leaving the formal roadmap status transition to `/10x-archive`.
- **Decision**: PENDING

## Verification record

- `npm run test:pdf` — PASS, 128/128 tests. The first sandboxed attempt failed only because three CLI tests could not spawn controlled `git` subprocesses (`EPERM`); the required escalated rerun passed.
- `npm run lint` — PASS; semantic UI contract passed for seven scoped product files.
- `npx astro check` — PASS; zero errors and zero warnings, with 35 hints from ignored generated preview output.
- `npm run build` — PASS, including Cloudflare server and PDF reader builds. Wrangler's optional user-level log write emitted the known read-only-filesystem warning without failing the build.
- `npm run test:pdf:db` — prior authorized evidence on the reviewed commit: PASS, 27/27, isolated project removed.
- `npm run test:pdf:migration` — prior authorized evidence on the reviewed commit: PASS, equivalent schemas/data and both isolated projects removed.
- `npm run check:ui-preview` and `npm run capture:ui-preview` — prior authorized evidence: PASS; 26 screenshots are present and the preview process was stopped.
- Manual UI wording, responsive, theme, focus, keyboard, rollout, privacy, authenticated resolve/status, full browser
  product-import flow, and runtime cleanup evidence is recorded in `visual-verification.md`.
