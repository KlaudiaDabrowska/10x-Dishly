# Resolve incomplete recipes — Plan Brief

> Full plan: `context/changes/resolve-incomplete-recipes/plan.md`
> Research: `context/changes/resolve-incomplete-recipes/research.md`

## What & Why

S-03 adds explicit keep/discard decisions for detected incomplete recipes. Complete recipes remain automatic, while incomplete candidates enter the collection only after an owner-authorized, idempotent keep decision.

## Starting Point

The browser currently retains incomplete payloads in memory, while the database stores only candidate metadata and digests. Finalization saves complete recipes, reports incomplete source identities as pending, and marks the import committed; no decision API exists.

## Desired End State

The user sees one canonical card per incomplete recipe, its missing elements, and independent keep/discard actions. Decisions survive retries and lost responses, but unsaved recipe content remains confined to the current tab. Resolved outcomes distinguish kept, discarded, pending, newly saved, and already-existing recipes.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Workflow | Post-finalize resolve operation | Preserves automatic complete saves and the established S-02 lifecycle | Research |
| Missing category | Allow `category = null` only for a recipe linked to an explicit keep decision | Does not invent source data; this is a documented exception to exactly-one-category and remains excluded from category filtering | Plan review |
| Provenance | Keep filename, pages, and source anchor mandatory | Protects digest identity, deduplication, and source navigation | Plan |
| Outcome | Persist per-decision state plus kept/discarded counters | Makes replay and discard-all unambiguous | Plan |
| Reimport | Preserve the existing recipe row, original `import_id`, and origin `kept_from_decision_id`; the new decision may reference it as deduplicated | Retains owner edits and creation provenance without requiring the later decision's import to match the recipe's original import | Plan review amendment |
| Channel | Product API only | Keeps F-01 evaluation behavior unchanged | Plan |
| Completeness | Store import-time and current omissions separately | Preserves provenance while allowing later correction | Plan |
| Field invariants | Structural current omission codes exactly mirror nullable/empty required fields; semantic codes remain independent of shape | Prevents recipe content and current omission state from drifting | Plan review |
| Decision digest | Add `canonicalDecisionDigest` without changing `digestValidatedCandidate` | Canonical decisions span batches while legacy finalization and F-01 depend on the existing batch-bound digest | Plan review |
| Pending content | Current-tab memory only | Matches the accepted no-return-later scope | Research |
| Conflicts | Non-keepable invalid results | A conflicting extraction has no trusted canonical payload | Research |
| Shared surfaces | S-03 owns the first decision-aware roadmap, contract registry, DB-suite, and UI-preview changes | Avoids deferring the integration contract to S-04/S-06 or reopening S-08 | Plan review |

## Scope

**In scope:** additive migration, canonical decision records, product-only resolve API, client recovery, keep/discard UI, semantic design-system migration for the touched import view, contract tests, visual evidence, and rollout documentation.

**Out of scope:** returning to decisions in a later session, storing pending recipe content, editing during import, category selection during keep, relaxing source provenance, overwriting an existing recipe on reimport, F-01 decision controls, S-04 browsing, and S-06 editing.

## Architecture / Approach

`batch results → canonical reconciliation → product finalize → complete recipe writes + pending decision metadata → keep/discard endpoint → atomic decision/outcome update`

Keep resubmits the exact canonical payload retained in the tab. The backend recomputes a separate owner/import/schema-bound `canonicalDecisionDigest` before a privileged RPC writes the recipe. The existing batch-bound `digestValidatedCandidate` remains unchanged. Discard sends no recipe content.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data contract | Forward migration, decision rows, incomplete recipe representation, product RPCs | Migration-first compatibility |
| 2. Service and API | Canonical digest, resolve endpoint, replay, ownership, status recovery | Race and payload integrity |
| 3. Client and UX | Accessible per-card decisions, discard-all, semantic UI and fixtures | Lost in-memory content |
| 4. Verification and rollout | Regression suite, visual evidence, docs and staged release | Supabase/runtime gates require approval |

**Prerequisites:** S-02 and S-08 are complete; database-backed and port-bound verification requires explicit user approval.
**Estimated effort:** high; four separately reviewable phases, with no calendar estimate.

## Open Risks & Assumptions

- Leaving the tab with unresolved decisions does not auto-discard them; no later-session UI is added.
- A kept recipe without category remains outside category-filtered results until a later capability corrects it.
- Nullable category is a narrow keep-only exception to the PRD's exactly-one-category rule; S-06 does not provide category correction.
- New nullable recipe fields are backward-compatible because the current application has no collection reader that assumes they are populated.
- Reset, selecting another file, and starting another run require confirmation while unresolved payloads remain in memory.
- `finalize_pdf_validation_import`, evaluation behavior, and `get_pdf_import_recipes` retain their exact existing contracts.
- Rollback disables new imports first; unresolved decision metadata may remain safely stored without pending content.
- Supabase, `test:pdf:db`, smoke, migration-equivalence processes, and ports 4321/4322 are not run without explicit user approval.

## Success Criteria Summary

- Each canonical incomplete recipe can be kept or discarded exactly once, with safe replay and owner isolation.
- Kept incomplete recipes preserve verified provenance and explicit omission metadata without overwriting existing rows.
- Mixed, keep-all, discard-all, lost-response, duplicate, and concurrent-decision outcomes are represented honestly.
- The import view follows the Dishly semantic UI contract and has reviewed desktop/mobile state evidence.
