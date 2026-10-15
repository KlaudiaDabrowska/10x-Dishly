<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Resolve Incomplete Recipes Implementation Plan

- **Plan**: `context/changes/resolve-incomplete-recipes/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-14
- **Verdict**: SOUND after fixes
- **Findings**: 0 critical, 10 warnings, 0 observations

## Verdicts

| Dimension | Initial | After fixes |
| --- | --- | --- |
| End-State Alignment | WARNING | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | WARNING | PASS |
| Blind Spots | WARNING | PASS |
| Plan Completeness | FAIL | PASS |

## Grounding

12/12 existing paths verified, 7/7 referenced symbols verified, plan and brief consistent, and all 26 Success Criteria entries map to the canonical Progress section. Planned-new migration, route, evidence, and review paths were treated as creation targets rather than missing existing files.

No product tests, Supabase processes, smoke checks, migration-equivalence commands, or processes on ports 4321/4322 were run during review or triage.

## Findings

### F1 — Recipe fields and current omission codes lacked exact invariants

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Public Contracts / Phase 1
- **Detail**: The original plan allowed nullable/empty content without defining which structural codes must match it or how semantic and optional omission codes behave.
- **Fix**: Added exact field/code invariants, known/unique/canonical code constraints, semantic-code rules, optional-code implications, strict provenance, keep-time equality, immutable import provenance, and trusted atomic current-state updates.
- **Decision**: FIXED

### F2 — Canonical decisions risked changing the legacy candidate digest

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Canonical decision contract
- **Detail**: `digestValidatedCandidate` is batch-bound and used by finalization and F-01, while a reconciled decision may span batches.
- **Fix**: Introduced a domain-separated `canonicalDecisionDigest` without batch identity and explicitly froze the signature, payload, algorithm, and callers of `digestValidatedCandidate`.
- **Decision**: FIXED

### F3 — Nullable category was not constrained to an explicit keep exception

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Recipe persistence / Migration Notes
- **Detail**: The original plan did not explicitly reconcile `category = null` with the PRD's exactly-one-category rule or prove that only keep could create the exception.
- **Fix**: Documented the FR-003/FR-006 exception, added durable origin-decision linkage and deferred consistency enforcement for the creating decision, kept automatic/evaluation/backfill writes strict, and documented filtering and correction consequences. A later deduplicated decision may reference the existing recipe without replacing its origin link or matching its original import.
- **Decision**: FIXED via recommended relational enforcement

### F4 — Legacy finalization and evaluation compatibility was underspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 / Migration Notes
- **Detail**: The old finalizer currently serves deployed product code as well as evaluation, and benchmark readers depend on an exact function result.
- **Fix**: Froze the old finalizer signature and result, evaluation behavior, `get_pdf_validation_import`, and the eleven-column evaluation-only `get_pdf_import_recipes` contract including grants and ordering.
- **Decision**: FIXED

### F5 — Ownership of shared S-03 surfaces was implicit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phases 3–4
- **Detail**: The plan named shared files without assigning responsibility for their first decision-aware version.
- **Fix**: Made S-03 the initial owner of roadmap, contract-surfaces, shared DB decision tests, and UI preview/capture changes while preserving prior content and evidence.
- **Decision**: FIXED

### F6 — Decision references lacked a public response shape

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Completeness
- **Location**: Public Contracts / Phase 2
- **Detail**: Deterministic local joining and lost-response recovery required fields and ordering that the original plan did not define.
- **Fix**: Added the shared content-free `DecisionReference` shape and stable page/item ordering for finalize, status, and resolve.
- **Decision**: FIXED

### F7 — Pending payload could be lost without navigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Client controller
- **Detail**: Reset, selecting another file, and starting another run clear memory without triggering a navigation warning.
- **Fix**: Required blocking or explicit confirmation for all three paths and added them to client verification.
- **Decision**: FIXED

### F8 — The central guard and error mapper was omitted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Product API and access guard
- **Detail**: `src/lib/pdf-validation.ts` owns bounded parsing, UUID validation, same-origin enforcement, sanitized status mapping, logging, and read-back.
- **Fix**: Added the file and the exact second-UUID, 409, body-limit, private-cache, logging, and read-back responsibilities.
- **Decision**: FIXED

### F9 — Shared client changes could alter F-01

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — Client controller
- **Detail**: `useClientImport` is shared with the evaluation panel, but the original plan did not define a capability boundary.
- **Fix**: Selected an explicit product-decision capability that is disabled for evaluation and required preservation tests for evaluation pending cards, outcome defaults, run records, and completion behavior.
- **Decision**: FIXED via recommended shared-controller capability

### F10 — Reimport could incorrectly replace or overconstrain recipe origin

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Recipe persistence / Phase 1 / Phase 4 database tests
- **Detail**: Requiring every kept decision to match `recipe.import_id` would reject a valid later reimport that deduplicates to an existing recipe. Replacing `recipe.kept_from_decision_id` would erase which decision originally created the incomplete row.
- **Fix**: Limited owner/import/source consistency to the origin decision that created the recipe. Later keep decisions require matching owner and stable source identity, may point to the existing recipe as deduplicated, and neither change its original `import_id` nor its immutable `kept_from_decision_id`. Added the D1 → R → D2 database-test contract.
- **Decision**: FIXED

## Triage Summary

- **Fixed**: F1, F2, F3, F4, F5, F6, F7, F8, F9, F10
- **Skipped**: none
- **Accepted risks**: none
- **Dismissed**: none
- **Verdict after fixes**: SOUND
