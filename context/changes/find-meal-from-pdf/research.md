---
date: 2026-11-23T21:36:56+01:00
researcher: Codex
git_commit: e322766ba1b51a85a2e4b1e9392c8ee9daffd391
branch: feature/find-meal-from-pdf
repository: 10x-Dishly
topic: "Find a meal from an imported PDF by category and ingredient"
tags: [research, codebase, recipes, filtering, supabase]
status: complete
last_updated: 2026-11-23
last_updated_by: Codex
---

# Research: Find a meal from an imported PDF by category and ingredient

**Date**: 2026-11-23T21:36:56+01:00
**Researcher**: Codex
**Git Commit**: e322766ba1b51a85a2e4b1e9392c8ee9daffd391
**Branch**: feature/find-meal-from-pdf
**Repository**: 10x-Dishly

## Research Question

How does PDF handling work now, and what must change so that a user can find and select a meal from an imported PDF?

## Summary

The inspected product path already covers local PDF reading, backend AI recognition, validated persistence, an owner-scoped recipe collection, and opening one recipe. A successful product import redirects to the collection, list cards open the existing detail route, and that detail renders ingredient variants, preparation instructions, the source filename, and the 1-based source page (`src/components/pdf-processing/RecipeImportPanel.tsx:46-63`; `src/components/recipes/RecipeList.astro:39-58`; `src/components/recipes/RecipeDetail.astro:30-101`). The change therefore does not need a second PDF-processing path.

The missing capability in the inspected collection path is server-side filtering. `/dashboard` currently passes only `page`, the list query projects `id`, `title`, current omission codes, and creation time, and the Supabase adapter applies sorting and a range without a category or ingredient predicate (`src/pages/dashboard.astro:14-21`; `src/lib/recipes/read.ts:11-23,230-267`; `src/lib/recipes/supabase-read.ts:5-20`). S-05 should extend that owner-scoped read path with an optional category, one optional ingredient, AND semantics when both are present, filter-preserving pagination, and a distinct no-results state.

The highest-risk decision is ingredient matching. The accepted oracle requires `pomidor` to match `pomidory`, `pomidora`, and `pomidorów`, independent of capitalization, while excluding `passata` and `ketchup` (`context/foundation/prd.md:73-84,151-159`). Stored `ingredient.name` deliberately preserves source wording without grammatical correction, so direct equality, `ilike`, or JSONB containment cannot by itself prove that oracle (`src/lib/pdf-processing/prompt.ts:113-115`). Planning should introduce a deterministic search representation or database function whose vocabulary is derived from ingredient identity, not semantic similarity, and protect it with positive and negative language examples before choosing an index.

## Detailed Findings

### Accepted product contract

- S-05 is the proposed roadmap item after completed S-03 and S-04. Its outcome is finding by category, one ingredient, or both together and then opening the matching recipe (`context/foundation/roadmap.md:158-184`).
- For this change, the accepted category set is exactly `breakfast`, `lunch`, `dinner`, and `dessert`; a kept incomplete recipe may exceptionally have a null category (`src/lib/pdf-processing/prompt.ts:51-54`; `context/foundation/roadmap.md:152-156`). A category filter therefore excludes null-category rows unless a later product decision says otherwise.
- When both accepted filters are present, results must satisfy both. Polish case, number, and capitalization variants are in scope; related ingredients and substitutions are not (`context/foundation/prd.md:73-84,151-159`).
- Under the accepted performance condition of one active user with a collection of up to 1,000 recipes, filtered results should appear within one second (`context/foundation/prd.md:142-146`). No inspected fixture or benchmark currently demonstrates this condition (`context/foundation/test-plan.md:132-134`).

### Existing import and persistence path

- The product exposes create, batch, finalize, status/cancel, and keep/discard endpoints through the shared import adapter (`src/pages/api/imports/index.ts:1-3`; `src/pages/api/imports/[id]/batch.ts:1-3`; `src/pages/api/imports/[id]/finalize.ts:1-3`; `src/pages/api/imports/[id]/decisions/[decisionId].ts:1-3`). This inspected endpoint set is sufficient context for S-05; filtering does not require a second import endpoint.
- On the inspected finalize path, backend code reconciles validated candidates, persists complete recipes, and returns pending decisions for detected incomplete candidates (`src/lib/pdf-processing/service.ts:234-335`). Kept incomplete recipes use the landed omission/provenance contract (`supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:72-139,633-688`).
- The recipe row stores one nullable category and nested JSONB ingredient groups. The current list-oriented index covers `(owner_id, created_at desc)`; the inspected migrations do not define a category/ingredient search column or corresponding search index (`supabase/migrations/20261008120000_pdf_processing.sql:186-208`; `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:72-139`).
- In the ingredient contract, each entry has `name`, optional quantity/unit, and `sourceText` (`src/lib/pdf-processing/contracts.ts:75-84`). The extraction prompt requires `name` to preserve the ingredient wording from the source without grammatical correction (`src/lib/pdf-processing/prompt.ts:113-115`). Consequently, the stored name is evidence to derive a search key from, but it is not already a Polish lemma contract.

### Existing collection and detail path

- The collection reader has a page size of 24 and applies deterministic `created_at DESC`, then `id ASC`, ordering on the inspected path (`src/lib/recipes/read.ts:11-23,230-267`). Filtering must happen before pagination; filtering the current 24-row page in the browser would produce incorrect counts and incomplete result pages.
- The current dashboard sends only the `page` query parameter to the reader (`src/pages/dashboard.astro:14-21`). `RecipeList` receives recipes, page, and total pages, and its empty state always describes an empty collection (`src/components/recipes/RecipeList.astro:6-12,29-37`). It has no filter controls or separate no-match copy in the inspected component.
- The list projection omits category and ingredient groups, while the detail projection includes both (`src/lib/recipes/read.ts:14-16,43-64`). The list query should remain narrow unless the accepted result-card design needs category or match context.
- The existing detail route reads through the cookie-bound Supabase client and maps malformed, nonexistent, and non-visible recipe IDs to the established not-found boundary (`src/pages/dashboard/recipes/[id].astro:12-21,38-68`; `src/lib/recipes/read.ts:270-276`). S-05 can reuse this route unchanged for the “select a meal” outcome.

### Ownership and query boundary

- On the inspected database schema, authenticated recipe reads use RLS with `auth.uid() = owner_id`, and browser roles receive read access through that policy (`supabase/migrations/20261008120000_pdf_processing.sql:214-243`). The current adapter uses the request-local client rather than a service-role read (`src/lib/recipes/supabase-read.ts:5-20`).
- The contract registry forbids URL-supplied owner selection and requires future filtering to preserve the cookie-bound client plus RLS (`docs/reference/contract-surfaces.md:5-7,17-20`). Category and ingredient are filters over the current owner's visible rows; neither parameter may select an owner.
- Current Supabase documentation shows `.contains()` as JSONB structural containment and supports PostgreSQL functions through `rpc()`. JSONB containment can express exact stored structure, but it does not supply the required Polish morphological equivalence. A database function or a dedicated search column remains the appropriate boundary when the predicate requires custom normalization ([Supabase JSON documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/json.mdx); [Supabase database functions documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/functions.mdx)).

### Required change surfaces

1. Extend the dashboard query contract with validated optional `category` and `ingredient` values plus the existing positive `page`. Preserve active filters in pagination links and reset to page 1 when filters change.
2. Extend `RecipeListQuery` and the Supabase read port so predicates are applied in the database before exact count, ordering, and range. Chained category and ingredient predicates must have AND semantics.
3. Add an accessible server-rendered filter form using the four accepted categories, one ingredient input, apply, and clear actions. Keep the current title-only result card unless a separate UI decision adds category or match context.
4. Distinguish an empty collection from zero matches under active filters. Keep query failures separate from both states.
5. Add a deterministic ingredient-search representation and its update path. Because saved-recipe editing is a later parallel roadmap item, the representation must be recomputed when ingredient content changes (`context/foundation/roadmap.md:186-196`).
6. Add the narrowest useful database index after selecting the predicate and verify the accepted up-to-1,000-row condition instead of assuming the existing owner/date index covers ingredient search.

### Test implications

- The current reader tests cover page parsing, 24-row ranges, ordering, empty/error states, detail IDs, nested ingredient mapping, and incomplete-recipe mapping on the inspected test path; they contain no category/ingredient query contract (`scripts/recipe-read.test.mjs:71-338`).
- Test-plan risk #6 names the three regressions to protect: missing valid Polish forms, admitting substitutions, and combining filters with OR instead of AND. Its selected cheapest layer is unit plus integration (`context/foundation/test-plan.md:23-41`).
- The next test rollout phase is “Filtrowanie i mutacje kolekcji” and is not started; its cookbook entry is still TBD (`context/foundation/test-plan.md:43-52,132-134`). Research for that rollout should use the accepted PRD examples as the oracle rather than mirroring the chosen normalization algorithm.
- Required S-05 cases are: category alone; ingredient alone; both as AND; capitalization; the accepted `pomidor` forms; negative `passata` and `ketchup`; null-category kept recipes; no matches; filter-preserving pagination; owner isolation; and the accepted performance condition. The existing detail tests and owner-isolation smoke remain reusable for opening a selected result (`scripts/recipe-read.test.mjs:194-224`; `scripts/smoke.mjs:289-316`).

## Code References

- `src/pages/dashboard.astro:14-35` — current collection request and rendering boundary.
- `src/lib/recipes/read.ts:11-23,230-276` — paginated list and detail contracts.
- `src/lib/recipes/supabase-read.ts:5-20` — current owner-scoped Supabase adapter without filters.
- `src/components/recipes/RecipeList.astro:15-82` — title-only list, empty state, and pagination.
- `src/components/recipes/RecipeDetail.astro:30-101` — existing meal-reading and source-metadata view.
- `src/lib/pdf-processing/prompt.ts:113-115` — source-faithful ingredient naming constraint.
- `supabase/migrations/20261008120000_pdf_processing.sql:186-243` — recipe storage, current list index, grants, and owner-read RLS.
- `scripts/recipe-read.test.mjs:71-338` — current read-model coverage without filtering.

## Architecture Insights

The established read architecture is server-rendered Astro → request-local Supabase client → RLS-protected `recipes` rows. S-05 should extend this path rather than introduce a browser-side full-collection fetch or a privileged filtering API. Filter parsing and result mapping belong in the testable reader contract; transport-specific query construction belongs in the Supabase adapter.

Ingredient search should remain deterministic application/database logic, not another AI call. The accepted import architecture assigns AI to recipe recognition and ordinary application logic to browsing and filtering (`context/foundation/prd.md:180-193`). A derived search representation avoids weakening the source-faithful import contract while giving filtering a stable predicate and index target.

## Historical Context (from prior changes)

- Supported: S-03 landed the durable contract for explicitly kept incomplete recipes, including nullable category and current omission state (`context/foundation/roadmap.md:140-156`; `context/archive/2026-10-14-resolve-incomplete-recipes/change.md:1-7`).
- Supported: S-04 landed the owner-scoped paginated list and detail view; its archived progress records completion of reader, UI, RLS/smoke, and visual checks (`context/archive/2026-10-14-browse-and-read-recipes/plan.md:274-324`).
- Supported and intentionally limited: the S-04 plan excluded category and ingredient filtering, leaving it to S-05 (`context/archive/2026-10-14-browse-and-read-recipes/plan.md:35-40`).
- Partially current: roadmap text requests the full US-02 flow in Chrome and Firefox on mobile and desktop (`context/foundation/roadmap.md:184`), while the later PRD amendment makes desktop web and F-01 desktop Chrome the first-iteration target, defers Firefox and real-phone import checks, and still requires a good mobile layout (`context/foundation/prd.md:145-149`). Planning should apply the later PRD amendment to browser/import verification without dropping responsive S-05 UI checks.

## Related Research

- `context/archive/2026-10-14-browse-and-read-recipes/research.md` — owner-scoped collection and detail architecture.
- `context/archive/2026-10-14-resolve-incomplete-recipes/research.md` — persisted incomplete-recipe and omission contracts.
- `context/changes/testing-critical-import-correctness-recovery/research.md` — current import correctness and recovery risks.
- `context/changes/testing-owner-isolation-privacy/research.md` — current ownership and privacy boundaries.

## Open Questions

1. What deterministic Polish normalization contract should apply beyond the accepted `pomidor` examples? This is a genuine product/domain choice: stemming must not broaden ingredient identity to substitutions.
2. Should result cards remain title-only, or show category and a matching ingredient? This does not block the query contract but changes the list projection and visual scope.
3. Should a blank/whitespace ingredient be treated as “no ingredient filter” or a validation error? The PRD does not settle this interaction detail.
4. Which derived representation and index meet the accepted up-to-1,000-row, under-one-second condition on the target Supabase/Postgres environment? Measure after the predicate is chosen.
