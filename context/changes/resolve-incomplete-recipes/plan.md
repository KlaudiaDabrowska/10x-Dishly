# Resolve Incomplete Recipes Implementation Plan

## Overview

Extend the product PDF import with an owner-scoped keep/discard workflow for canonical incomplete recipes. Preserve the current complete-recipe finalization, in-memory pending content, privileged persistence, source-identity deduplication, F-01 behavior, and migration-first rollout.

This change introduces one deliberate exception to the PRD's exactly-one-category rule: `category = null` is permitted only for an incomplete recipe explicitly persisted by a successful product `keep` decision. Automatic saves, evaluation imports, historical backfill, and every other recipe write continue to require exactly one category.

## Current State Analysis

The product client completes local reading, batch recognition, and finalization before displaying raw incomplete candidates. The database records their batch identity, source anchor, status, and digest, but not their content or omission reasons.

The complete-only finalizer writes a fixed outcome and changes the import to `committed`. The `recipes` schema cannot represent missing title, category, ingredients, or instructions, and the API exposes no decision mutation.

The current UI lists raw batch candidates, whereas database pending counts use distinct source identities. Overlapping results and reconciliation conflicts can therefore make visible cards differ from the persisted pending count.

## Desired End State

Product finalization saves complete recipes and atomically creates one pending decision per reconciled incomplete source identity. The status API exposes decision references and outcome counters without returning unsaved recipe content.

The current tab joins those references with its canonical in-memory payloads. Keep verifies the exact payload and writes a kept-incomplete recipe; discard records a resolution without writing recipe content. Both operations are owner-scoped, transactional, idempotent, and recoverable through status lookup.

### Key Discoveries

- Candidate v2 already represents nullable and empty recipe fields with typed omission reasons: `src/lib/pdf-processing/contracts.ts:1-29,74-102`.
- Current finalization accepts persisted recipes only for recorded complete candidates: `src/lib/pdf-processing/service.ts:212-300`.
- Recipe identity already protects owner edits through `(owner_id, file_fingerprint, source_start_page, source_start_item)`: `supabase/migrations/20261008120000_pdf_processing.sql:204-205`.
- Product and evaluation channels already share infrastructure while preserving separate access rules: `supabase/migrations/20261009120000_product_pdf_import.sql:1-25`.
- Shared Card, Alert, and Button primitives and an isolated UI preview already exist; the touched import view still bypasses the semantic-token contract.

## What We’re NOT Doing

- Persisting pending recipe payloads or adding a later-session decision inbox.
- Editing recipe fields or selecting a category during import.
- Allowing keep without verified filename, pages, and source-start identity.
- Automatically replacing an existing recipe during reimport.
- Adding keep/discard to `/api/pdf-validation/**` or changing F-01 scoring.
- Implementing collection browsing, filtering, or saved-recipe editing.
- Changing the AI model, prompt, extraction limits, or completeness rules.
- Deploying, enabling flags, running Supabase, smoke, `test:pdf:db`, or starting ports without approval.

## Implementation Approach

Add a forward migration after the two deployed PDF migrations. Keep `finalize_pdf_validation_import`, the evaluation channel, `get_pdf_validation_import`, and `get_pdf_import_recipes` contract-compatible and introduce separate product-specific finalization and resolution RPCs. During migration-first rollout the old finalizer remains callable for both already-deployed product code and evaluation; the new application routes product imports to the new RPC while evaluation stays on the old path.

Product finalization receives server-derived canonical incomplete decision metadata alongside complete recipes. It inserts complete recipes, the initial outcome, and decision rows in one transaction. A product-only HTTP endpoint resolves each decision with a row lock and updates the recipe, decision, and outcome atomically.

The client performs the same shared reconciliation over its validated batch results, matches canonical source identities to server decision references, and retains full payloads only in memory.

## Public Contracts

### Recipe persistence

Kept incomplete recipes support:

- nullable `title` and `category`;
- empty `ingredient_groups` and `instructions`;
- mandatory `source_filename`, `source_pages`, and source-start identity;
- immutable `incomplete_at_import`;
- immutable `import_missing_reason_codes`;
- mutable `current_missing_reason_codes`, initially equal to the import-time codes.
- a durable `kept_from_decision_id` origin link proving which first product keep decision created the incomplete row.

Existing rows are backfilled as complete with empty omission arrays. Complete automatic writes continue to satisfy the original non-null/nonempty constraints through conditional checks.

The database and trusted write path enforce these invariants:

| Stored content      | Required relationship to `current_missing_reason_codes`                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `title`             | `title is null` iff `missing-title` is present. Blank strings remain invalid.                                                            |
| `category`          | `category is null` iff `missing-category` is present. A non-null value remains one of the four allowed categories.                       |
| `instructions`      | The array is empty iff `missing-instructions` is present; stored entries remain nonblank.                                                |
| `ingredient_groups` | The array is empty, or at least one group has an empty `ingredients` array, iff `missing-ingredients` is present.                        |
| `servings`          | `absent-servings` implies `servings is null`; a null value does not require the optional code because validation does not synthesize it. |
| `footnotes`         | `absent-footnotes` implies an empty array; an empty array does not require the optional code because validation does not synthesize it.  |

`missing-continuation`, `missing-ingredient-content`, and `missing-variant-content` are semantic omissions: they may remain present when ingredient and instruction structures are nonempty and must not be inferred or cleared solely from shape. `missing-source-metadata` is forbidden on saved recipes because filename, pages, and source anchor are mandatory.

Both omission arrays contain only known, unique codes in canonical order. `incomplete_at_import` is true exactly when `import_missing_reason_codes` contains at least one required omission; at keep time the current and import arrays are equal. Existing and newly automatic complete rows use `false`, `[]`, and `[]`. A database trigger protects `incomplete_at_import`, `import_missing_reason_codes`, and `kept_from_decision_id` from later mutation. A future trusted edit may update recipe content and `current_missing_reason_codes` together, but never import-time provenance.

The owner/import/source consistency enforced for `kept_from_decision_id` applies only to the origin decision that first inserted the incomplete recipe. On a later reimport, a new keep decision may deduplicate to that existing recipe even though the new decision has a different `import_id`. In that case the recipe keeps its original `import_id` and `kept_from_decision_id`; the new decision records the existing recipe ID as its deduplicated result. Resolution must not relink the recipe to the new decision or require the new decision's import ID to equal the recipe's original import ID. Owner and stable source identity still have to match for deduplication.

The nullable-category case is the documented exception to FR-003/FR-006 and the exactly-one-category rule. It requires `incomplete_at_import = true`, `missing-category` in the immutable import codes, `missing-category` in current codes while the value remains null, and a valid origin `kept_from_decision_id` whose final kept decision has the same owner, original import, and source identity as the recipe. Later deduplicated decisions may reference the recipe without satisfying original-import equality and without changing that origin link. Such a recipe is absent from category-filtered results until a future category-correction capability; S-06 does not supply that capability.

### Decision persistence

A product decision row contains:

- UUID decision ID;
- owner/import and canonical source identity;
- canonical payload digest;
- validated omission codes;
- `pending | kept | discarded` state;
- optional recipe ID;
- created and resolved timestamps.

There is exactly one row per import and canonical source identity. Pending rows have no recipe or resolution timestamp; kept rows reference a recipe; discarded rows do not.

Decision rows store a separate `canonicalDecisionDigest`, computed over a domain/version marker, owner ID, import ID, recipe schema name and version, and the complete canonical reconciled candidate. It intentionally excludes batch index, candidate index, and batch membership. The existing `digestValidatedCandidate` signature, payload, algorithm, and callers remain unchanged for recorded batch candidates, legacy finalization, and F-01.

Finalize, status, and resolve expose the same content-free decision reference, ordered by source page and item index:

```ts
interface DecisionReference {
  decisionId: string;
  sourceStart: { page: number; itemIndex: number };
  state: "pending" | "kept" | "discarded";
  missingReasonCodes: OmissionCode[];
  recipeId: string | null;
  resolvedAt: string | null;
}
```

The omission codes are unique and canonically ordered. References never expose candidate content or either digest.

### Outcome

Product outcomes expose:

- `saved`: all newly inserted recipes, including explicit keeps;
- `alreadySaved`: all deduplicated existing recipes;
- `pending`: unresolved canonical decisions;
- `kept`: decisions resolved with keep;
- `discarded`: decisions resolved with discard;
- saved/existing IDs and decision references.

### Product API

Add:

`POST /api/imports/:importId/decisions/:decisionId`

Accepted bodies:

- `{ "action": "discard" }`
- `{ "action": "keep", "candidate": <canonical RecipeCandidate> }`

The response contains the resolved decision, updated outcome, and owner-scoped read-back confirmation when keep produces or finds a recipe.

Same-action replay returns the stored result. An opposite action returns `409 decision-conflict`. Missing/cross-owner/cross-channel decisions return the existing non-disclosing not-found behavior. A mismatched payload returns `409 decision-payload-mismatch`.

Product status includes decision references and counters but no candidate content. Resolve is a database-only operation and remains available for an already-created import when product creation or the provider credential is disabled.

## Critical Implementation Details

### Timing and lifecycle

The import remains `committed` after automatic complete-recipe finalization even while decision rows are pending. Leaving the page neither cancels the committed import nor converts pending rows to discarded; the UI warns before navigation but provides no later-session recovery screen.

### State sequencing

Finalize creates complete recipe writes, outcome, and canonical decision rows atomically. Resolve locks the decision/import state, verifies the action and payload, performs any deduplicated recipe insert, and updates decision and counters in the same transaction.

### Reconciliation conflicts

A source identity with conflicting canonical content is invalid and does not create a keepable decision. It must not inflate `pending`; tests preserve the rule that no arbitrary candidate wins.

### Digest boundaries

`canonicalDecisionDigest` is a new decision-domain primitive and is stable across the raw batch membership that produced the same reconciled candidate. Keep recomputes it before calling the resolution RPC. `digestValidatedCandidate` continues to bind a raw validated candidate to owner, import, schema, and batch exactly as it does today; S-03 does not change or repurpose it.

### Shared-surface ownership

S-03 owns the first decision-aware version of `context/foundation/roadmap.md`, `docs/reference/contract-surfaces.md`, `scripts/pdf-processing-db.test.mjs`, and the shared UI preview/capture tooling. These changes are not deferred to S-04 or S-06 and do not reopen completed S-08. Existing roadmap content, legacy database coverage, preview fixtures, and archived S-08 evidence remain intact; S-03 adds or parameterizes only its own contract, cases, and evidence destination.

## Phase 1: Data Contract and Forward Migration

### Overview

Create the backward-compatible database representation for incomplete saved recipes and product decisions while leaving evaluation and legacy finalization callable.

### Changes Required

#### 1. Forward migration

**File:** `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql`

**Intent:** Extend the deployed schema without rewriting historical migrations.

**Contract:** Add the recipe completeness fields and `kept_from_decision_id`, encode the structural/semantic omission invariants above, conditionally relax content constraints only for explicitly kept incomplete rows, protect import-time provenance with a trigger, retain mandatory source provenance, add decision-state and outcome constraints, backfill existing rows as complete, and preserve the current source-identity unique key. A deferred consistency check proves that the origin keep decision which created an incomplete row resolves to the same owner, original import, source identity, and recipe. Later decision rows may reference that existing recipe after owner/source deduplication without matching its original import and without changing either recipe provenance field.

#### 2. Product decision table and privileges

**File:** `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql`

**Intent:** Persist resolution metadata without storing unsaved recipe content.

**Contract:** Add the decision table, unique canonical source key, state-shape checks, foreign keys, indexes, RLS, revoked browser privileges, and service-role-only RPC access.

#### 3. Product-specific finalization and resolution RPCs

**File:** `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql`

**Intent:** Keep evaluation behavior stable while making product finalization and decisions atomic.

**Contract:** Add product-only finalize, resolve, and decision-read functions. Preserve without signature, return-column, ordering, grant, or channel-semantics changes `finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb)`, its six-column result, `get_pdf_validation_import`, the evaluation channel, and the eleven-column evaluation-only `get_pdf_import_recipes(uuid, uuid)`. The old finalizer remains a migration-first compatibility bridge for already-deployed product code. Extend only product outcome JSON with kept/discarded counters and decision references; legacy consumers continue to receive their established contract.

### Success Criteria

#### Automated Verification

- The forward migration backfills existing recipes/outcomes and preserves the exact legacy finalizer, evaluation, and benchmark-reader contracts.
- Database tests prove structural and semantic omission invariants, immutable import provenance, nullable-category keep linkage, decision-state checks, RLS, grants, and product-channel enforcement.
- Database tests prove atomic finalize/resolve behavior, source-identity deduplication including origin-preserving reimport keeps, and same-action replay.
- Migration-equivalence and database suites pass in isolated Supabase projects after explicit user approval.

#### Manual Verification

- The migration and rollback notes are reviewed before any Supabase-backed command is authorized.

**Implementation Note:** Pause after the static migration review. Do not start Supabase or run database/migration suites without explicit user approval.

---

## Phase 2: Canonical Service and Product API

### Overview

Connect reconciliation, canonical digests, privileged persistence, HTTP routing, status recovery, and deterministic error handling.

### Changes Required

#### 1. Canonical decision contract

**Files:** `src/lib/pdf-processing/{contracts,reconcile,validation}.ts`

**Intent:** Make the source identity and payload used by UI decisions identical to the source used by persistence.

**Contract:** Produce one ordered canonical incomplete candidate per source identity and compute it with the new `canonicalDecisionDigest`: a domain/version-separated owner/import/schema/contract-bound digest of the reconciled candidate without batch identity. Do not change `digestValidatedCandidate` or any of its raw-batch finalization and F-01 callers. Expose validated omission codes, stable `DecisionReference` values ordered by source page/item, and classify reconciliation conflicts as invalid rather than pending.

#### 2. Persistence and service orchestration

**Files:** `src/lib/pdf-processing/{persistence,service}.ts`

**Intent:** Route product imports through decision-aware finalization while leaving evaluation imports on their current path.

**Contract:** Product finalize submits complete recipes plus canonical decision metadata. Resolve reloads the owner/product decision, verifies the canonical keep payload, invokes the atomic RPC, and returns the updated outcome. Status exposes decision references without content.

#### 3. Product API and access guard

**Files:** `src/lib/pdf-import-api.ts`, `src/lib/pdf-import-access.ts`, `src/lib/pdf-validation.ts`, `src/pages/api/imports/[id]/decisions/[decisionId].ts`

**Intent:** Publish one bounded, same-origin, authenticated product mutation.

**Contract:** Add the `resolve` database-only operation, validate both UUID path parameters, enforce the product channel, cap JSON bodies, preserve private/no-store responses and content-free logging, map `decision-conflict` and `decision-payload-mismatch` to HTTP 409, and perform owner-scoped keep read-back.

### Success Criteria

#### Automated Verification

- Unit tests prove canonical ordering, duplicate reconciliation, conflict exclusion, omission-code preservation, an unchanged `digestValidatedCandidate` contract, decision-digest stability across batch membership, and decision-digest tamper rejection.
- API/access tests prove product-only authorization, same-origin and UUID validation, bounded bodies, flag-off availability, and sanitized errors.
- Service tests prove keep, discard, replay, opposite-action conflict, lost-response status recovery, and cross-owner/cross-import rejection.
- `npm run test:pdf`, `npm run lint`, and `npx astro check` pass without starting Supabase or application ports.

#### Manual Verification

- The final API shapes and error codes are reviewed against the approved data contract before UI integration.

**Implementation Note:** Keep candidate content out of logs, status responses, decision rows, and operational errors.

---

## Phase 3: Client State and Keep/Discard UX

### Overview

Replace raw pending cards with canonical decisions and deliver accessible, semantic, recoverable per-card actions.

### Changes Required

#### 1. Decision-aware client controller

**File:** `src/lib/pdf-processing/client-import.ts`

**Intent:** Retain canonical payloads only in the active tab and reconcile action responses with durable status.

**Contract:** Enable decision state only through an explicit product capability that is off for the shared evaluation/F-01 consumer. Join stable server decision references to local canonical candidates by source identity, track independent pending/submitting/kept/discarded/error states, retry status after lost resolve responses, and warn before navigation while local unresolved payloads remain. Block or require explicit confirmation before reset, selecting another file, or starting another run would clear unresolved local payloads. Preserve evaluation raw pending cards, outcome defaults, run records, and completion behavior.

#### 2. Product completion semantics

**Files:** `src/lib/pdf-processing/client-import.ts`, `src/lib/pdf-processing/dashboard-import.ts`

**Intent:** Distinguish extraction failure from intentional discard-all and preserve trusted dashboard confirmation.

**Contract:** Redirect only when pending is zero, read-back is confirmed, and at least one saved/existing recipe exists. A resolved discard-all outcome remains on the import page with a neutral completion message rather than the no-recipes error.

#### 3. Product import presentation

**Files:** `src/components/pdf-processing/RecipeImportPanel.tsx`, `src/pages/dashboard/import.astro`

**Intent:** Show missing fields and independent actions without introducing import-time editing.

**Contract:** Use shared Card, Alert, and Button primitives with semantic tokens. Keep is primary; discard is destructive. Cards expose nullable title/category and empty content honestly, retain resolved feedback instead of disappearing under focus, disable only the active action pair, and announce per-card and overall results accessibly.

#### 4. Preview fixtures and UI guard

**Files:** `tools/ui-preview/**`, `scripts/{ui-preview,check-ui-contract}.mjs`, `context/changes/resolve-incomplete-recipes/visual-verification.md`

**Intent:** Exercise product states without authentication, Supabase, AI calls, or a public fixture route.

**Contract:** As the initial S-03 owner of the shared preview surface, add a presentation-only decision component/fixture safe for the preview import graph. It uses a neutral view model outside `lib/pdf-processing`, which remains forbidden by preview isolation. Cover default, keeping, discarding, kept, discarded, error, missing-title/category/content, discard-all, light/dark, desktop/mobile, hover, focus-visible, and disabled states. Parameterize capture output for this change without overwriting archived S-08 evidence or removing existing fixtures.

### Success Criteria

#### Automated Verification

- Client tests prove canonical card counts, per-card locking, keep/discard updates, resolve replay recovery, discard-all, mixed outcomes, navigation warning, reset/new-file/re-run protection, and unchanged evaluation/F-01 behavior with the product capability disabled.
- `npm run lint`, `npm run check:ui`, and `npx astro check` pass with the import page/component included in the semantic UI guard.
- `npm run check:ui-preview` passes after explicit approval to use port 4322.
- `npm run capture:ui-preview` writes the named S-03 evidence set after explicit approval to use port 4322.

#### Manual Verification

- Desktop and mobile screenshots in both themes show readable missing-field warnings, correct hierarchy, no clipped content, and distinct pending/resolved/error states.
- Keyboard review confirms logical tab order, visible focus, stable focus after resolution, correct accessible names, and usable zoom/reflow.
- The user confirms keep, discard, mixed, and discard-all wording before the phase is closed.

**Implementation Note:** Commands that start the preview on port 4322 remain pending until the user explicitly authorizes them.

---

## Phase 4: Regression, Rollout, and Documentation

### Overview

Close the contract with full regression coverage, migration-first release instructions, and evidence that F-01 and existing import recovery remain intact.

### Changes Required

#### 1. Contract and integration tests

**Files:** `scripts/{pdf-processing,client-import,pdf-import-access,pdf-processing-db}.test.mjs`

**Intent:** Cover the new decision state machine and protect existing complete-import guarantees.

**Contract:** As the initial S-03 owner of the shared database suite, add cases for the exact field/code invariants, semantic omissions with nonempty content, import-provenance immutability, null-category keep linkage, unchanged legacy RPC signatures/results/grants, both digest domains, duplicate source candidates, conflicts, keep/discard/replay, double click, concurrent opposite actions, tampered payloads, another owner/import/channel, existing edited recipes, flag-off resolution, lost responses, discard-all, and outcome/read-back counters. Include the explicit reimport case: D1 keeps and creates incomplete recipe R; a later import creates D2 for the same owner/source identity; keeping D2 returns R as an already-existing deduplicated recipe; R still points to D1 through `kept_from_decision_id` and retains its original `import_id`; D2 may point to R as its result without import-ID equality. Preserve all existing evaluation and benchmark cases.

#### 2. Deployment and contract documentation

**Files:** `docs/reference/contract-surfaces.md`, `context/foundation/roadmap.md`

**Intent:** Record the new API/data guarantees and reversible rollout.

**Contract:** As the initial S-03 owner of both shared documents, record the decision API/data contract, field/code invariants, separate digest domains, the nullable-category exception to exactly-one-category, frozen legacy/evaluation surfaces, migration-before-code ordering, flag-disabled deployment, owner-scoped decisions, current-tab-only payload lifetime, strict provenance, product-only scope, and rollback behavior. S-03 moves through the existing roadmap lifecycle without changing unrelated items.

#### 3. Final verification matrix

**Files:** `context/changes/resolve-incomplete-recipes/visual-verification.md`, implementation review evidence

**Intent:** Separate safe local checks from user-authorized runtime checks.

**Contract:** Record exact commands, results, viewport/state matrix, failures, and any not-run gates. Never mark Supabase, smoke, database, migration-equivalence, or port-bound verification complete without actual authorized evidence.

### Success Criteria

#### Automated Verification

- `npm run test:pdf`, `npm run lint`, `npx astro check`, and `npm run build` pass.
- `npm run test:pdf:db` passes after explicit user approval to start isolated Supabase.
- `npm run test:pdf:migration` passes after explicit user approval to start isolated Supabase projects.
- Existing F-01 evaluation tests and legacy finalization behavior pass unchanged.
- UI contract and approved preview checks pass with evidence stored under the S-03 change folder.

#### Manual Verification

- With explicit user approval, an authenticated product import verifies keep-all, discard-all, mixed decisions, refresh/navigation warning, lost-response recovery, and another-owner isolation.
- With explicit user approval, smoke or equivalent authenticated checks use ports 4321/4322 and stop all started processes afterward.
- Rollout review confirms migration first, code with `PDF_IMPORT_ENABLED=false`, owner/status checks, then production enablement; rollback disables creation before code rollback.
- The final review confirms no pending recipe payload, source text, credentials, or provider response was persisted or logged.

**Implementation Note:** Stop after plan review as requested. Do not begin `/10x-implement`.

---

## Testing Strategy

### Unit Tests

- Canonical reconciliation and stable source ordering.
- Decision digest binding and tamper rejection.
- Outcome classification for pending, keep, discard, mixed, empty, and unconfirmed states.
- Client per-card state, double click, retry, and lost-response recovery.
- Access availability and sanitized error mapping.

### Integration Tests

- Migration/backfill and conditional recipe constraints.
- Product-only decision RPC privileges and RLS.
- Atomic keep/discard with owner/import/channel validation.
- Same-action replay and opposite-action concurrency.
- Deduplication against an existing edited recipe.
- Strict provenance and nullable category behavior.
- Legacy F-01 finalization and evaluation isolation.

### Manual Testing Steps

1. Import a mixed complete/incomplete fixture and verify automatic complete saves before decisions.
2. Keep candidates missing title, category, ingredients, and instructions; verify exact warnings and owner-only read-back.
3. Discard candidates and verify no recipe row or payload storage is created.
4. Exercise mixed and discard-all completion messages.
5. Trigger action retry/lost response and confirm status recovers the stored result without duplicate writes.
6. Review keyboard, focus, zoom, desktop/mobile, and both preview themes.
7. Run Supabase, smoke, or port-bound steps only after explicit approval.

## Performance Considerations

Decision handling performs no additional AI calls and stores no pending payload. Indexed import/source identity and decision UUID lookups keep each action bounded to one decision transaction. Status returns metadata and IDs only.

## Migration Notes

- Add one forward migration; do not edit either deployed PDF migration.
- Backfill existing recipes as complete and existing outcomes with zero kept/discarded counts.
- Keep the legacy finalizer and evaluation channel callable throughout migration-first deployment.
- Conditional constraints permit null/empty content only for rows explicitly marked incomplete at import; verified provenance remains mandatory.
- Nullable category is limited to an incomplete recipe linked to a successful keep decision and is an explicit exception to the exactly-one-category product rule; automatic and evaluation recipes still require one category.
- `kept_from_decision_id` is immutable creation provenance. Later reimport decisions may reference the same deduplicated recipe while its original import and origin-decision links remain unchanged.
- `canonicalDecisionDigest` is separate from, and does not alter, the existing batch-bound `digestValidatedCandidate` contract.
- `finalize_pdf_validation_import`, evaluation behavior, and the signature/result/grants of `get_pdf_import_recipes` remain unchanged throughout rollout and rollback.
- Deploy migration first, deploy code with new import creation disabled, verify legacy/F-01 and owner-scoped reads, then enable production creation.
- On rollback, disable new creation first. Decision metadata and kept rows remain intact; no destructive down migration is required.

## References

- `context/changes/resolve-incomplete-recipes/research.md`
- `context/foundation/prd.md:35-68,121-126,153-170`
- `context/foundation/roadmap.md:140-166`
- `src/lib/pdf-processing/service.ts:163-300`
- `src/lib/pdf-processing/reconcile.ts:23-74`
- `supabase/migrations/20261008120000_pdf_processing.sql:159-243,1131-1286`
- `supabase/migrations/20261009120000_product_pdf_import.sql:1-25,125-189`
- `context/archive/2026-10-12-unify-dashboard-design-system/theme-contract.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data Contract and Forward Migration

#### Automated

- [x] 1.1 The forward migration backfills existing recipes/outcomes and preserves the exact legacy finalizer, evaluation, and benchmark-reader contracts. — 8ab2695
- [x] 1.2 Database tests prove structural and semantic omission invariants, immutable import provenance, nullable-category keep linkage, decision-state checks, RLS, grants, and product-channel enforcement. — 8ab2695
- [x] 1.3 Database tests prove atomic finalize/resolve behavior, source-identity deduplication including origin-preserving reimport keeps, and same-action replay. — 8ab2695
- [x] 1.4 Migration-equivalence and database suites pass in isolated Supabase projects after explicit user approval. — 8ab2695

#### Manual

- [x] 1.5 The migration and rollback notes are reviewed before any Supabase-backed command is authorized. — 8ab2695

### Phase 2: Canonical Service and Product API

#### Automated

- [x] 2.1 Unit tests prove canonical ordering, duplicate reconciliation, conflict exclusion, omission-code preservation, an unchanged `digestValidatedCandidate` contract, decision-digest stability across batch membership, and decision-digest tamper rejection. — 3ee5f65
- [x] 2.2 API/access tests prove product-only authorization, same-origin and UUID validation, bounded bodies, flag-off availability, and sanitized errors. — 3ee5f65
- [x] 2.3 Service tests prove keep, discard, replay, opposite-action conflict, lost-response status recovery, and cross-owner/cross-import rejection. — 3ee5f65
- [x] 2.4 `npm run test:pdf`, `npm run lint`, and `npx astro check` pass without starting Supabase or application ports. — 3ee5f65

#### Manual

- [x] 2.5 The final API shapes and error codes are reviewed against the approved data contract before UI integration. — 3ee5f65

### Phase 3: Client State and Keep/Discard UX

#### Automated

- [x] 3.1 Client tests prove canonical card counts, per-card locking, keep/discard updates, resolve replay recovery, discard-all, mixed outcomes, navigation warning, reset/new-file/re-run protection, and unchanged evaluation/F-01 behavior with the product capability disabled. — 880bff1
- [x] 3.2 `npm run lint`, `npm run check:ui`, and `npx astro check` pass with the import page/component included in the semantic UI guard. — 880bff1
- [x] 3.3 `npm run check:ui-preview` passes after explicit approval to use port 4322. — 880bff1
- [x] 3.4 `npm run capture:ui-preview` writes the named S-03 evidence set after explicit approval to use port 4322. — 880bff1

#### Manual

- [x] 3.5 Desktop and mobile screenshots in both themes show readable missing-field warnings, correct hierarchy, no clipped content, and distinct pending/resolved/error states. — 880bff1
- [x] 3.6 Keyboard review confirms logical tab order, visible focus, stable focus after resolution, correct accessible names, and usable zoom/reflow. — 880bff1
- [x] 3.7 The user confirms keep, discard, mixed, and discard-all wording before the phase is closed. — 880bff1

### Phase 4: Regression, Rollout, and Documentation

#### Automated

- [x] 4.1 `npm run test:pdf`, `npm run lint`, `npx astro check`, and `npm run build` pass. — 46ba6b8
- [x] 4.2 `npm run test:pdf:db` passes after explicit user approval to start isolated Supabase. — 46ba6b8
- [x] 4.3 `npm run test:pdf:migration` passes after explicit user approval to start isolated Supabase projects. — 46ba6b8
- [x] 4.4 Existing F-01 evaluation tests and legacy finalization behavior pass unchanged. — 46ba6b8
- [x] 4.5 UI contract and approved preview checks pass with evidence stored under the S-03 change folder. — 46ba6b8

#### Manual

- [x] 4.6 With explicit user approval, an authenticated product import verifies keep-all, discard-all, mixed decisions, refresh/navigation warning, lost-response recovery, and another-owner isolation. — 46ba6b8
- [x] 4.7 With explicit user approval, smoke or equivalent authenticated checks use ports 4321/4322 and stop all started processes afterward. — 46ba6b8
- [x] 4.8 Rollout review confirms migration first, code with `PDF_IMPORT_ENABLED=false`, owner/status checks, then production enablement; rollback disables creation before code rollback. — 46ba6b8
- [x] 4.9 The final review confirms no pending recipe payload, source text, credentials, or provider response was persisted or logged. — 46ba6b8
