# Edit Saved Recipe Implementation Plan

## Overview

Add owner-only post-save correction of recipe title, ingredients, and preparation instructions while preserving the existing private read contract, immutable import provenance, and reimport no-overwrite behavior.

## Current State Analysis

`/dashboard/recipes/:id` reads through the signed-in Supabase client and RLS; `RecipeDetail.astro` is display-only. Authenticated browser roles have `SELECT` but no recipe update grant or policy. Existing constraints support atomic changes to mutable content and `current_missing_reason_codes`, and reimport keeps existing owner edits.

## Desired End State

The owner edits on `/dashboard/recipes/:id/edit`, saves through a same-origin PATCH API backed by a service-role-only owner-scoped RPC, and returns to an RLS-backed detail read. Foreign, missing, malformed, stale, and tampered writes cause no mutation or disclosure.

### Key Discoveries

- Current recipe writes are backend-controlled; browser roles remain read-only (`supabase/migrations/20261008120000_pdf_processing.sql:226-243`).
- Current content and structural omissions must change atomically (`supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:72-139`).
- Stable source identity and import provenance are already protected by triggers.
- Stored ingredients have both `sourceText` for display and normalized `name` for future filtering.

## Public Contracts

### HTTP

`PATCH /api/recipes/:id` accepts a JSON snapshot containing `updatedAt`, `title`, `ingredientGroups`, and `instructions`. Groups and ingredients carry nullable origin indexes; ingredients contain only editable `name` and `sourceText`. The payload never accepts owner, category, source/import identity, quantity/unit, or omission codes. The body limit is 256 KiB.

Success is `200 { recipeId, updatedAt }`. Public failures are fixed content-free bodies: `401 authentication_required`, `403 cross_origin_forbidden`, `404 recipe-not-found`, `409 recipe-conflict`, `413 request-too-large`, `415 unsupported-media-type`, `400 invalid-json`, `422 invalid-recipe-edit` with allowlisted path/code issues, `503 infrastructure_unavailable`, and sanitized `500 internal-error`.

### RPC

Add service-role-only `update_owned_recipe(owner_id, recipe_id, expected_updated_at, title, ingredient_groups, instructions, current_missing_reason_codes)`, returning `recipe_id` and the new `updated_at`. It locks the owner row, makes foreign and absent IDs indistinguishable, rejects a stale timestamp, and updates only the whitelisted mutable columns. Revoke execute from `public`, `anon`, and `authenticated`.

### Read model

Add `updatedAt` to the recipe detail projection/model for optimistic concurrency. Other list/detail behavior remains compatible.

## Validation and Canonicalization

- Reuse candidate bounds: title/label/sourceText ≤ 2,000 characters, name ≤ 500, instruction ≤ 8,000, at most 20 groups, 200 ingredients per group, and 100 instructions.
- Trim text; every present ingredient has nonblank `name` and `sourceText`; multiple groups have distinct nonblank labels, while one group may have a null label.
- Existing origin indexes must be unique, in range, and order-preserving. New entries use null origins. MVP supports append/remove but no reorder or cross-group moves.
- Preserve old quantity/unit only when an origin is valid and `sourceText` is unchanged; otherwise store both as null.
- A structural gap may remain only when its code was current before editing. A save cannot introduce or restore a gap.
- Repairing title, ingredients, or instructions removes its structural code. Ingredient changes remove `missing-ingredient-content` and `missing-variant-content`. Any editable-content change removes `missing-continuation`. Preserve category and unrelated/optional codes in canonical order.

## What We're NOT Doing

- Category, source, servings, footnotes, import-time, or deletion editing.
- Direct browser `UPDATE`/RPC access, AI parsing, reorder/drag-and-drop, pessimistic locks, realtime merge, S-05 implementation, or Playwright.

## Implementation Approach

Deploy the additive migration first. The server reads the current owner row through the admin client, validates origins and constructs the canonical snapshot, then calls the RPC with the expected timestamp. The RPC rechecks ownership/version under row lock and updates atomically. On success the client redirects to `/dashboard/recipes/:id?edited=1`; one-time feedback removes the marker from the visible URL and the normal detail read proves persistence.

## Critical Implementation Details

Client origins are references to the current locked record, never trusted content. A conflict must not auto-retry: keep entered values and offer an explicit reload. A dirty form warns before cancel/navigation.

## Phase 1: Data mutation contract

### Overview

Add the forward migration and real-database contract for atomic owner-only editing.

### Changes Required

#### 1. Recipe update migration

**File**: `supabase/migrations/20261123150000_edit_saved_recipes.sql`

**Intent**: Add the narrow RPC without widening browser privileges.

**Contract**: Owner-scoped lock, optimistic timestamp, neutral absence, atomic content/omission update, minimal result, and service-role-only execution.

#### 2. Database integration coverage

**File**: `scripts/pdf-processing-db.test.mjs`

**Intent**: Prove behavior against real constraints, triggers, grants, and concurrency.

**Contract**: Owner success; foreign/nonexistent no-mutation; direct-browser/RPC denial; immutable fields; structural/semantic code rules; stale token; malformed JSON; and reimport preservation.

### Success Criteria

#### Automated Verification

- Migration and owner update scenarios pass in isolated Supabase: `npm run test:pdf:db`
- DB suite rejects foreign/nonexistent/direct-browser/tampered/stale updates without mutation and preserves reimported edits

#### Manual Verification

- Forward-only migration and application-first rollback sequence are reviewed without destructive down migration

**Implementation Note**: Pause after automated gates for manual confirmation.

---

## Phase 2: Authenticated recipe API

### Overview

Add trusted validation/canonicalization and an authenticated public HTTP boundary independent of UI.

### Changes Required

#### 1. Write domain and adapter

**Files**: `src/lib/recipes/write.ts`, `src/lib/recipes/supabase-write.ts`

**Intent**: Validate the exact snapshot, derive final metadata/omissions, and call the owner-scoped RPC.

**Contract**: Session-derived owner only; exact keys/bounds/origins; deterministic final ingredient JSON; stable domain errors.

#### 2. Recipe mutation API

**File**: `src/pages/api/recipes/[id].ts`

**Intent**: Expose the same-origin bounded PATCH with private caching and sanitized failures.

**Contract**: Guard order and exact status/body allowlist from Public Contracts; no recipe values or database messages in errors/logs.

#### 3. Contract tests and CI

**Files**: `scripts/recipe-edit.test.mjs`, `scripts/recipe-api.test.mjs`, `package.json`, `.github/workflows/ci.yml`

**Intent**: Add first-class `test:recipes` covering read/write/API contracts and run it in validate CI.

**Contract**: Exact payload, canonicalization, guard order, error bodies, conflicts, and planted private sentinels.

### Success Criteria

#### Automated Verification

- Recipe contract suite passes: `npm run test:recipes`
- Security allowlist suite passes with recipe mutation sentinels: `npm run test:security`
- CI validate job invokes `test:recipes`

#### Manual Verification

- Exact PATCH success/error bodies are reviewed without recipe content or database messages

**Implementation Note**: Pause after automated gates for manual confirmation.

---

## Phase 3: Dedicated edit experience

### Overview

Add the accessible edit page, form lifecycle, and change-specific visual evidence.

### Changes Required

#### 1. Shared primitives and form

**Files**: `src/components/ui/*`, `src/components/recipes/RecipeEditForm.tsx`

**Intent**: Generate missing Input/Textarea/Label primitives through shadcn and build the dynamic form using Dishly tokens.

**Contract**: Title, group label, ingredient display/search fields, instruction steps, append/remove, inline validation, pending/retry/conflict states, and no reorder.

#### 2. Routes and feedback

**Files**: `src/pages/dashboard/recipes/[id]/edit.astro`, `src/pages/dashboard/recipes/[id].astro`, `src/components/recipes/RecipeDetail.astro`

**Intent**: Add the edit entry point, protected page, cancel/dirty behavior, and persisted read-back feedback.

**Contract**: Existing neutral 404/500 behavior; successful redirect; conflict preserves entries; category/source/provenance remain read-only.

#### 3. Preview and UI contract

**Files**: `tools/ui-preview`, `scripts/ui-preview.mjs`, `scripts/check-ui-contract.mjs`, `package.json`

**Intent**: Exercise edit states without a public fixture route and capture change-specific evidence.

**Contract**: `edit-saved-recipe` profile, `capture:ui-preview:recipe-edit`, and evidence under `context/changes/edit-saved-recipe/evidence/`.

### Success Criteria

#### Automated Verification

- Recipe UI and type contracts pass: `npm run test:recipes && npm run lint && npx --no-install astro check`
- Isolated edit preview passes: `npm run check:ui-preview`
- Edit evidence matrix is captured: `npm run capture:ui-preview:recipe-edit`

#### Manual Verification

- Desktop/mobile matrix passes for complete, incomplete, validation, saving, failure, conflict, cancel, and success states
- Keyboard, focus, dirty-navigation warning, and persisted read-back are verified

**Implementation Note**: Pause for approval of the visual matrix.

---

## Phase 4: Integrated verification and rollout

### Overview

Connect DB, API, and UI through built-Worker verification and record the stable contract and rollout.

### Changes Required

#### 1. Product smoke and regression

**Files**: `scripts/smoke.mjs`, recipe/security suites, CI

**Intent**: Prove own edit/read-back and foreign no-mutation through real sessions, Worker, and RPC.

**Contract**: Two independent accounts; own correction persists; foreign and nonexistent share exact response and cause no write.

#### 2. Contract registry and rollout

**Files**: `docs/reference/contract-surfaces.md`, `context/foundation/roadmap.md`

**Intent**: Record the route, immutable boundaries, conflict, migration-first rollout, application-first rollback, and deferred S-05 integration gate.

**Contract**: S-06 proves JSON persistence/read-back but does not claim filter freshness before S-05.

### Success Criteria

#### Automated Verification

- Full recipe/security/DB regression passes: `npm run test:recipes && npm run test:security && npm run test:pdf:db`
- Production checks pass: `npm run lint && npx --no-install astro check && npm run build`
- Built Worker smoke proves owner edit/read-back and foreign no-mutation: `npm run smoke`

#### Manual Verification

- Contract registry and rollout evidence match the implemented route, errors, and migration order
- S-05 handoff records the deferred filter-freshness gate without claiming it passed

## Testing Strategy

Unit/contract tests cover exact payloads, bounds, origins, metadata clearing, omission derivation, conflict, guard ordering, and sanitized errors. Real DB tests cover privileges, constraints, triggers, row locking, concurrency, and reimport. Built-Worker smoke covers sessions and owner isolation. Isolated UI preview covers complete/incomplete, validation, saving, failure, conflict, cancel, and success states on desktop/mobile with keyboard/focus review.

## Performance Considerations

The request is capped at 256 KiB and the RPC locks one owner-scoped row only for the update. Existing list/detail queries gain only `updated_at`; no derived search index is added before S-05.

## Migration Notes

Apply the additive migration before application code. Roll back UI/API first; the unused service-role-only RPC can remain. Any later removal is a separate forward migration. Do not use a destructive down migration.

## References

- `context/changes/edit-saved-recipe/research.md`
- `src/lib/recipes/read.ts`
- `src/lib/pdf-validation.ts`
- `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql`
- `docs/reference/contract-surfaces.md`
- `context/foundation/test-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data mutation contract

#### Automated

- [x] 1.1 Migration and owner update scenarios pass in isolated Supabase: `npm run test:pdf:db`
- [x] 1.2 DB suite rejects foreign/nonexistent/direct-browser/tampered/stale updates without mutation and preserves reimported edits

#### Manual

- [x] 1.3 Forward-only migration and application-first rollback sequence are reviewed without destructive down migration

### Phase 2: Authenticated recipe API

#### Automated

- [ ] 2.1 Recipe contract suite passes: `npm run test:recipes`
- [ ] 2.2 Security allowlist suite passes with recipe mutation sentinels: `npm run test:security`
- [ ] 2.3 CI validate job invokes `test:recipes`

#### Manual

- [ ] 2.4 Exact PATCH success/error bodies are reviewed without recipe content or database messages

### Phase 3: Dedicated edit experience

#### Automated

- [ ] 3.1 Recipe UI and type contracts pass: `npm run test:recipes && npm run lint && npx --no-install astro check`
- [ ] 3.2 Isolated edit preview passes: `npm run check:ui-preview`
- [ ] 3.3 Edit evidence matrix is captured: `npm run capture:ui-preview:recipe-edit`

#### Manual

- [ ] 3.4 Desktop/mobile matrix passes for complete, incomplete, validation, saving, failure, conflict, cancel, and success states
- [ ] 3.5 Keyboard, focus, dirty-navigation warning, and persisted read-back are verified

### Phase 4: Integrated verification and rollout

#### Automated

- [ ] 4.1 Full recipe/security/DB regression passes: `npm run test:recipes && npm run test:security && npm run test:pdf:db`
- [ ] 4.2 Production checks pass: `npm run lint && npx --no-install astro check && npm run build`
- [ ] 4.3 Built Worker smoke proves owner edit/read-back and foreign no-mutation: `npm run smoke`

#### Manual

- [ ] 4.4 Contract registry and rollout evidence match the implemented route, errors, and migration order
- [ ] 4.5 S-05 handoff records the deferred filter-freshness gate without claiming it passed
