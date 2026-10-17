<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-04 — Owner-scoped lista i szczegóły przepisów

- **Plan**: `context/changes/browse-and-read-recipes/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-14
- **Verdict before triage**: REVISE
- **Verdict after triage**: SOUND
- **Findings**: 2 critical, 5 warnings, 0 observations

## Verdicts

| Dimension | Before | After |
| --- | --- | --- |
| End-State Alignment | WARNING | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | WARNING | PASS |
| Blind Spots | WARNING | PASS |
| Plan Completeness | FAIL | PASS |

## Grounding

Grounding: 12/12 existing paths ✓, 8/8 symbols ✓, brief↔plan ✓. Progress matched all original phase criteria before triage and was updated one-to-one with the accepted fixes.

## Findings

### F1 — Missing hard `merge S-03 → rebase S-04` boundary

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details, Phase 3–4
- **Detail**: The plan allowed Phases 1–2 in parallel but did not prevent Phase 4, or all of Phase 3, from starting before S-03 merged and S-04 rebased.
- **Fix**: Add a hard pre-Phase-3 checkpoint, ancestry evidence, conflict review, and the rule that both Phases 3–4 remain blocked until it passes.
- **Decision**: FIXED — the plan and brief now permit parallel Phases 1–2 and explicitly gate Phases 3–4 on merge, rebase, inspection, and Progress evidence.

### F2 — S-03 persistence semantics were still conditional and stale

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Current State, Phase 3
- **Detail**: S-03 had already published exact persistence fields, but S-04 still described the contract as unavailable and allowed omission inference conditionally.
- **Fix**: Name the exact fields and make `current_missing_reason_codes` the sole source of current omissions, validated as `OmissionCode` and mapped through `PDF_OMISSION_RULES`; never infer omissions from null or empty arrays.
- **Decision**: FIXED — exact fields, provenance semantics, code validation, explanation mapping, fallback boundaries, and mapping-error behavior are now explicit.

### F3 — Shared rebase hotspots lacked a preservation protocol

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details, Phase 4
- **Detail**: Both changes target `roadmap.md`, `contract-surfaces.md`, `pdf-processing-db.test.mjs`, `check-ui-contract.mjs`, `ui-preview.mjs`, and `tools/ui-preview/**`.
- **Fix**: Register every hotspot with an additive resolution rule and require a post-rebase diff review.
- **Decision**: FIXED — all six surfaces and their preservation rules are recorded; `roadmap.md` is now an explicit Phase 4 path.

### F4 — Common 404 contract lacked full automated parity coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, Phase 2, Phase 4
- **Detail**: The plan specified a common 404 for foreign, nonexistent, and malformed IDs, but HTTP verification compared only foreign and nonexistent IDs.
- **Fix**: Map all three cases to one public `not-found` response and assert the same status, marker, neutral content, and non-disclosure behavior; keep database errors as 500.
- **Decision**: FIXED — malformed stops before query, foreign/nonexistent share the RLS zero-row path, and all three are required in smoke coverage.

### F5 — Phase 2 claimed UI-guard coverage before the shared guard could be edited

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Automated Verification
- **Detail**: The current guard does not scan S-04 files, while modifying it before rebase would conflict with S-03.
- **Fix**: Use scoped ESLint plus a static S-08 audit in Phase 2 and defer additive guard integration to post-rebase Phase 4.
- **Decision**: FIXED — Phase 2 and Progress now state that split explicitly.

### F6 — Phase 4 verification setup was incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 4 Automated Verification
- **Detail**: Authenticated smoke had no way to create recipes for two accounts, and the planned `check-preview.mjs` change had no execution criterion.
- **Fix**: Add local test-only admin seeding with cleanup and no application exposure; add a separately approved port-4321 credentialless preview gate.
- **Decision**: FIXED — the plan names CI/smoke files, secret boundaries, cleanup, the exact preview check, and process shutdown.

### F7 — Reader and dashboard-shell boundaries were under-specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1–2
- **Detail**: The plan did not decide how Node tests avoid Astro runtime imports or how detail/404/500 preserve the dashboard shell.
- **Fix**: Have Astro create the cookie-bound client and inject a minimal query port into pure reader functions; make `DashboardView` a shared content shell.
- **Decision**: FIXED — both boundaries and their test/UI expectations are now explicit in the plan and brief.

## Triage Summary

- **Fixed**: F1, F2, F3, F4, F5, F6, F7
- **Accepted risk**: none
- **Skipped**: none
- **Dismissed**: none
- **Implementation started**: no
