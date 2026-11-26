---
date: 2026-11-23T21:37:32+01:00
researcher: Codex
git_commit: e322766ba1b51a85a2e4b1e9392c8ee9daffd391
branch: feature/edit-saved-recipe
repository: 10x-Dishly
topic: "S-06: correct an already saved recipe"
tags: [research, recipes, editing, ownership, supabase]
status: complete
last_updated: 2026-11-23
last_updated_by: Codex
---

# Research: S-06 saved-recipe editing

**Date**: 2026-11-23T21:37:32+01:00
**Researcher**: Codex
**Git Commit**: e322766ba1b51a85a2e4b1e9392c8ee9daffd391
**Branch**: feature/edit-saved-recipe
**Repository**: 10x-Dishly

## Research Question

What current product, UI, data, security, and prior-change contracts must `edit-saved-recipe` preserve, and which decisions remain unresolved before planning owner-only corrections of saved recipe content?

## Summary

S-06 is a post-save, owner-only correction flow for title, ingredients, and preparation instructions. It includes recipes kept despite incompleteness, must persist corrections into the existing detail read, and must not expose category editing or import-time editing ([prd.md:87-97](../../foundation/prd.md#L87), [roadmap.md:186-198](../../foundation/roadmap.md#L186)). Ingredient corrections must be visible to S-05 filtering after integration, but S-05 is not implemented in the inspected `src/**` and recipe migrations at this revision; the roadmap already treats that freshness check as an integration risk ([roadmap.md:188-198](../../foundation/roadmap.md#L188)).

The current application has the read side but no recipe-edit mutation. The server-rendered detail route uses a cookie-bound Supabase client and RLS, while the inspected migrations grant authenticated browser roles `SELECT` and define an owner-read policy without an `UPDATE` grant or update policy ([supabase-read.ts:5-20](../../../src/lib/recipes/supabase-read.ts#L5), [20261008120000_pdf_processing.sql:226-243](../../../supabase/migrations/20261008120000_pdf_processing.sql#L226)). Planning therefore needs a new, narrowly scoped owner-bound database/API write contract, not only an edit form.

The database already separates mutable content and current completeness from immutable source/import provenance. A trusted save can atomically change content and `current_missing_reason_codes`; it must not accept category, ownership, source identity, import identity, or import-time omission fields from the client ([20261008120000_pdf_processing.sql:828-846](../../../supabase/migrations/20261008120000_pdf_processing.sql#L828), [20261014120000_incomplete_recipe_decisions.sql:72-139](../../../supabase/migrations/20261014120000_incomplete_recipe_decisions.sql#L72), [20261014120000_incomplete_recipe_decisions.sql:218-241](../../../supabase/migrations/20261014120000_incomplete_recipe_decisions.sql#L218)).

Two product-oracle gaps are material before implementation planning: the editable representation of labelled ingredient groups/variants, and the confirmation rule for clearing semantic omissions such as `missing-continuation` or `missing-variant-content`. The stored shape cannot resolve either decision by itself.

## Detailed Findings

### 1. Settled product scope

- The observable outcome is: a logged-in owner edits the title, ingredients, or preparation instructions of a saved recipe, saves, and reads the corrected stored content ([prd.md:87-97](../../foundation/prd.md#L87)).
- The same flow covers a recipe kept after an incomplete-import decision. Editing is available after saving, not during import ([prd.md:59-68](../../foundation/prd.md#L59), [prd.md:93-97](../../foundation/prd.md#L93)).
- The editable field set is exactly title, ingredients, and preparation instructions for this change. Manual category changes remain excluded ([prd.md:135-140](../../foundation/prd.md#L135)). The accepted S-03 contract consequently leaves a kept recipe with a missing category outside category-filtered results; S-06 does not correct that category ([resolve-incomplete-recipes plan:81-83](../../archive/2026-10-14-resolve-incomplete-recipes/plan.md#L81)).
- Users may mutate their own saved recipes and not another account's rows ([prd.md:179-187](../../foundation/prd.md#L179)). No owner identifier should be accepted from a URL or client payload; existing detail reads derive identity from the session and RLS ([contract-surfaces.md:3-5](../../../docs/reference/contract-surfaces.md#L3)).
- In the accepted architecture, browsing, filtering, editing, and deletion use ordinary application logic rather than AI ([prd.md:161-171](../../foundation/prd.md#L161)).

### 2. Current read and UI surfaces

- `/dashboard/recipes/<uuid>` is the established recipe detail surface. Within the current route, malformed, nonexistent, and RLS-hidden foreign IDs converge on the neutral not-found result; database/read-contract failures remain a separate error state ([contract-surfaces.md:3-5](../../../docs/reference/contract-surfaces.md#L3), [recipe route:12-67](../../../src/pages/dashboard/recipes/%5Bid%5D.astro#L12)). A mutation surface should preserve the same non-disclosing ownership posture.
- The read layer is split between runtime mapping/domain logic and a thin Supabase adapter. The detail projection already includes editable content, immutable provenance, and both import-time and current omission codes ([read.ts:14-28](../../../src/lib/recipes/read.ts#L14), [read.ts:168-227](../../../src/lib/recipes/read.ts#L168), [supabase-read.ts:5-20](../../../src/lib/recipes/supabase-read.ts#L5)).
- `RecipeDetail.astro` is display-only. In the inspected component it renders current warnings, labelled ingredient-group cards, ordered instructions, and source metadata; it has no edit control or form ([RecipeDetail.astro:18-101](../../../src/components/recipes/RecipeDetail.astro#L18)).
- The existing detail mapper already accepts a corrected kept-incomplete recipe when mutable content and current omission codes agree, while retaining import provenance ([read.ts:186-227](../../../src/lib/recipes/read.ts#L186), [recipe-read.test.mjs:290-303](../../../scripts/recipe-read.test.mjs#L290)).
- The established product mutation guard authenticates the session, requires same-origin requests, bounds JSON input, and binds privileged work to the session-derived owner ID ([pdf-import-access.ts:21-59](../../../src/lib/pdf-import-access.ts#L21), [pdf-validation.ts:108-146](../../../src/lib/pdf-validation.ts#L108)). This is the strongest inspected security/error-handling precedent for a recipe mutation.
- UI work must reuse the repository's semantic tokens and shared primitives, keep controls on the shared button scale, and exercise states in `tools/ui-preview` with change-scoped evidence, as required by the repository-wide Dishly UI contract.

### 3. Data invariants and write boundary

- In the inspected migration set, authenticated browser roles can select owner-matching recipe rows but cannot update them: privileges are revoked, `SELECT` is granted, and the recipe policy shown is `FOR SELECT` with `auth.uid() = owner_id` ([20261008120000_pdf_processing.sql:226-243](../../../supabase/migrations/20261008120000_pdf_processing.sql#L226)). A forward migration is required for any persisted edit contract.
- On update, the existing identity trigger prevents changes to `id`, `owner_id`, file fingerprint, source start anchor, `import_id`, and `created_at`, and refreshes `updated_at` ([20261008120000_pdf_processing.sql:828-846](../../../supabase/migrations/20261008120000_pdf_processing.sql#L828)). A second trigger preserves `incomplete_at_import`, `import_missing_reason_codes`, and `kept_from_decision_id` ([20261014120000_incomplete_recipe_decisions.sql:218-241](../../../supabase/migrations/20261014120000_incomplete_recipe_decisions.sql#L218)).
- Structural current omissions are constrained against content: null title corresponds to `missing-title`, empty instructions correspond to `missing-instructions`, and an empty ingredient structure corresponds to `missing-ingredients`. Such structural absence is permitted only for a row whose immutable import provenance contains that omission ([20261014120000_incomplete_recipe_decisions.sql:72-139](../../../supabase/migrations/20261014120000_incomplete_recipe_decisions.sql#L72)). Consequently, content and structural current codes must change atomically.
- Existing database coverage demonstrates this atomic shape for a trusted update: removing a structural code without repairing its field is rejected, while filling the missing fields and replacing the structural codes in one update succeeds ([pdf-processing-db.test.mjs:1011-1065](../../../scripts/pdf-processing-db.test.mjs#L1011)). This test proves the persistence invariant, not the still-unsettled product interaction for semantic codes.
- Semantic omissions including `missing-ingredient-content`, `missing-variant-content`, and `missing-continuation` may coexist with nonempty structures and cannot be cleared from JSON shape alone ([resolve-incomplete-recipes plan:68-83](../../archive/2026-10-14-resolve-incomplete-recipes/plan.md#L68)). A trusted edit contract needs an explicit user/product rule for changing those current codes.
- Category is technically mutable under the present value constraint, but it is not in the S-06 editable projection. The write contract must whitelist its accepted fields instead of applying an arbitrary recipe-row patch.
- Both complete-import finalization and incomplete keep use source-identity conflict handling that retains the existing recipe row rather than overwriting its mutable content. Owner corrections therefore survive the inspected reimport/deduplication paths ([20261008120000_pdf_processing.sql:1249-1273](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1249), [20261014120000_incomplete_recipe_decisions.sql:653-672](../../../supabase/migrations/20261014120000_incomplete_recipe_decisions.sql#L653)).

### 4. Ingredients and filtering integration

- Stored ingredients are structured as labelled groups containing ingredient objects with `name`, optional quantity/unit, and `sourceText`; the current detail UI displays group labels and `sourceText` ([read.ts:120-143](../../../src/lib/recipes/read.ts#L120), [RecipeDetail.astro:40-56](../../../src/components/recipes/RecipeDetail.astro#L40)). The PRD says “ingredients” but does not decide whether editing operates on structured parts, source lines, or another representation.
- At this revision, the inspected recipe schema stores ingredient groups inline as JSON and has an owner/created-time index; no S-05 filtering implementation or derived ingredient-search structure was found in the inspected `src/**` and recipe migrations ([20261008120000_pdf_processing.sql:186-208](../../../supabase/migrations/20261008120000_pdf_processing.sql#L186)). Direct future filtering over the stored JSON would see corrected values, while a future derived S-05 structure would require explicit synchronization. The S-05 plan, once available, must settle that integration mechanism.
- The roadmap permits S-06 planning after S-04 and calls for shared verification after integration with S-05; for a solo contributor it prioritizes completing S-05 first ([roadmap.md:214-230](../../foundation/roadmap.md#L214)).

### 5. Validation and testing implications

- The project test strategy places future recipe edit/delete coverage in rollout Phase 3 and names owner-isolation and filtering semantics as the relevant risks ([test-plan.md:43-52](../../foundation/test-plan.md#L43)). This research supplies the feature oracle and affected boundaries; it does not start that test rollout or write tests.
- Planning should preserve distinct evidence layers: real database coverage for constraints/RLS or owner-bound RPC behavior, hermetic port/API coverage for validation and failure translation, and change-scoped UI-preview states for complete, kept-incomplete, validation-error, save-error, and saved-readback presentations.
- The repository's existing risk contract requires foreign and nonexistent identifiers to produce a non-disclosing denial with no mutation; hiding an edit button in the UI is not sufficient evidence ([test-plan.md:34-41](../../foundation/test-plan.md#L34)).

## Code References

- `src/pages/dashboard/recipes/[id].astro:12-67` — protected recipe detail route and neutral absence/error presentation.
- `src/components/recipes/RecipeDetail.astro:18-101` — current read-only detail, omission warnings, structured ingredients, instructions, and source display.
- `src/lib/recipes/read.ts:14-28,168-227,270-276` — detail projection, runtime invariant checks, and not-found/error mapping.
- `src/lib/recipes/supabase-read.ts:5-20` — cookie-bound, RLS-backed list and detail queries.
- `src/lib/pdf-import-access.ts:21-59` — same-origin and bounded-JSON mutation helpers.
- `supabase/migrations/20261008120000_pdf_processing.sql:186-243,828-846,1249-1273` — recipe schema, read-only browser privileges/RLS, immutable identity, and no-overwrite reimport behavior.
- `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:72-139,218-241,653-672` — current omission constraints, immutable import provenance, and incomplete keep deduplication.
- `scripts/pdf-processing-db.test.mjs:1011-1065` — current content/omission atomic-update invariant.
- `scripts/recipe-read.test.mjs:290-303` — corrected content read-back while retaining import provenance.

## Architecture Insights

The established boundary is server-rendered owner-scoped reads plus privileged, session-bound mutations. The safest planning direction consistent with the inspected code is a narrow recipe update operation that accepts a recipe ID and an explicit editable-content payload, derives owner identity from the authenticated session, selects/locks the owner row, validates the full replacement or agreed patch, and atomically updates the whitelisted mutable columns plus approved `current_missing_reason_codes`. This is a research inference, not an approved implementation plan.

The edit response should not redefine the read model. A successful mutation can return or redirect to the existing detail surface so the normal RLS-backed mapper proves persisted read-back, including the updated page title. Cross-owner and absent recipe IDs should remain externally indistinguishable, and client payloads should have no way to nominate an owner, category, source identity, or import provenance.

## Historical Context (from prior changes)

- **Supported:** S-03 established the split between immutable import provenance and mutable current completeness, and its accepted plan states that S-06 does not correct category ([resolve-incomplete-recipes plan:68-83](../../archive/2026-10-14-resolve-incomplete-recipes/plan.md#L68)).
- **Supported:** S-04 established cookie-bound RLS reads and the common malformed/foreign/nonexistent recipe not-found presentation ([browse-and-read-recipes plan:28-45](../../archive/2026-10-14-browse-and-read-recipes/plan.md#L28)).
- **Supported:** S-08's UI contract remains the visual/component baseline for new dashboard states ([theme-contract.md:3-28](../../archive/2026-10-12-unify-dashboard-design-system/theme-contract.md#L3)).
- **Partially stale:** the roadmap's backlog handoff still describes S-03/S-04 as awaiting later lifecycle steps in one section, while archived artifacts and the later roadmap done section show both completed. The S-06 prerequisite conclusion remains supported: S-04 is complete; S-05 integration remains separate ([roadmap.md:214-230](../../foundation/roadmap.md#L214), [roadmap.md:263-270](../../foundation/roadmap.md#L263)).

## Related Research

- [S-03 incomplete-recipe research](../../archive/2026-10-14-resolve-incomplete-recipes/research.md) — provenance, current omission semantics, and owner-bound keep decisions.
- [S-04 browse/read research](../../archive/2026-10-14-browse-and-read-recipes/research.md) — RLS-backed collection/detail reads and recipe JSON shape.
- [Owner-isolation test research](../testing-owner-isolation-privacy/research.md) — current security oracle and the handoff of edit/delete mutation coverage to test rollout Phase 3.

## Open Questions

1. What editable ingredient model should the product expose for labelled groups and variants: structured fields, source-text lines, or another representation? The answer must preserve labels and enough normalized data for S-05 matching.
2. What explicit user action or validation rule clears semantic current omissions such as `missing-continuation`, `missing-ingredient-content`, or `missing-variant-content`? Nonempty shape is not evidence that those source-level problems were corrected.
3. Is saving a full editable snapshot or a partial field patch the intended interaction, and may a recipe that was complete at import be made structurally incomplete? The current constraints reject structural absence for a complete-import row, while a kept-incomplete row may remain empty only for omissions present at import.
4. Which interaction should planning adopt—inline editing or a dedicated route—and what are the required cancel, validation-error, save-error, concurrent-edit, and post-save navigation states? Existing requirements settle the saved outcome but not these mechanics.
5. After S-05 lands, does it query `ingredient_groups` directly or maintain derived search data? S-06 must add the corresponding synchronization and integration verification without broadening Polish ingredient matching semantics.
