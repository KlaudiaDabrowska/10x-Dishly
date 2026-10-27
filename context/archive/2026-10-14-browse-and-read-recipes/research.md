---
date: 2026-10-14T16:52:24+02:00
researcher: Codex
git_commit: 351625ba7fceee6e307a1a91e9c6a3f14174e4c0
branch: feature/browse-and-read-recipes
repository: 10xdevs-browse-and-read-recipes
topic: "S-04: owner-scoped browsing and reading of saved recipes"
tags: [research, recipes, ownership, dashboard, ui]
status: complete
last_updated: 2026-10-14
last_updated_by: Codex
---

# Research: Owner-scoped browsing and reading of saved recipes

**Date**: 2026-10-14T16:52:24+02:00
**Researcher**: Codex
**Git Commit**: 351625ba7fceee6e307a1a91e9c6a3f14174e4c0
**Branch**: feature/browse-and-read-recipes
**Repository**: 10xdevs-browse-and-read-recipes

## Research Question

How should S-04 add an owner-scoped recipe list and recipe details while following the completed S-08 UI contract and consuming, rather than redefining, the missing-field contract owned by S-03?

## Summary

S-04 should use the request-local, cookie-bound Supabase client for both the collection query and the direct-ID detail query. The current `recipes_owner_read` RLS policy limits authenticated reads to `auth.uid() = owner_id`, while middleware already protects every `/dashboard...` route and applies `private, no-store` (`supabase/migrations/20261008120000_pdf_processing.sql:214-243`; `src/middleware.ts:4-48`). A foreign recipe ID and a nonexistent recipe ID should therefore remain indistinguishable at the application boundary; the current code has no product decision yet for the exact not-found presentation.

The existing database is sufficient for complete saved recipes, but not for recipes kept despite missing content. In the current schema, title, category, source filename/pages, ingredient groups and instructions are required, and the import service saves only candidates classified as complete (`supabase/migrations/20261008120000_pdf_processing.sql:186-205`; `src/lib/pdf-processing/service.ts:254-300`). S-04 must not add nullable columns, sentinel values, warning flags or fallback meanings. Its plan needs an explicit integration gate that consumes the S-03 contract after that contract lands.

The UI should extend the existing server-rendered dashboard and add a nested protected detail route. Product views must reuse the S-08 semantic tokens and shared Button/Card/Alert scale; visual fixtures belong in `tools/ui-preview`, with change-specific evidence under this change folder (`src/components/dashboard/DashboardView.astro:13-53`; `context/archive/2026-10-12-unify-dashboard-design-system/theme-contract.md:3-28`; `AGENTS.md:14-19`).

## Detailed Findings

### Persistence and read model

- The saved-row contract currently includes identity and ownership, source filename/pages, title, one category, nested ingredient groups, instruction strings, optional servings/source category and footnotes, plus timestamps (`supabase/migrations/20261008120000_pdf_processing.sql:186-205`).
- Within the current recipe contract, an ingredient group has an optional label and a list of ingredients; each ingredient carries name, optional quantity/unit and source text. Instructions and footnotes are string arrays (`src/lib/pdf-processing/contracts.ts:74-102`). S-04 should preserve group labels and quantities rather than flattening variants, matching the roadmap boundary (`context/foundation/roadmap.md:163-166`).
- For the inspected schema, the one existing list-oriented index is `(owner_id, created_at desc)` (`supabase/migrations/20261008120000_pdf_processing.sql:208`). This supports a newest-first query efficiently, but it does not decide product ordering or a deterministic equal-timestamp tiebreak.
- The inspected product code has no general recipe repository, collection API or detail API. The existing `get_pdf_import_recipes` RPC is service-role-only, scoped to one evaluation import after the product migration, and omits fields needed for the product collection; it is not the S-04 read surface (`supabase/migrations/20261009120000_product_pdf_import.sql:217-242`).
- The current database validates the top-level JSON containers but not every nested TypeScript property. A read mapper should narrow stored JSON before presentation rather than casting arbitrary JSON directly to the import contract (`supabase/migrations/20261008120000_pdf_processing.sql:198-201`; `src/lib/pdf-processing/contracts.ts:74-102`).

### Ownership and direct access

- Browser roles receive `SELECT` on `public.recipes` after broader privileges are revoked; the owner-read RLS policy uses the authenticated user ID (`supabase/migrations/20261008120000_pdf_processing.sql:226-243`). The existing read-back path proves the intended request-local pattern by querying recipe IDs through `createClient(...)` and RLS (`src/lib/pdf-validation.ts:198-215`).
- Middleware derives identity with `supabase.auth.getUser()`, protects the `/dashboard` prefix and applies private no-store caching to responses through this path (`src/middleware.ts:17-48`). Therefore a nested route such as a recipe detail below `/dashboard` inherits the established authentication boundary.
- The contract registry forbids query parameters such as `user_id` from selecting ownership and requires future collection reads to preserve RLS (`docs/reference/contract-surfaces.md:5-11`). S-04 must not accept an owner ID from the URL, form or client payload.
- Current database tests cover owner-only direct selection in the existing recipes table, but the inspected tests do not cover S-04 list ordering, a direct recipe-ID page, foreign-ID/not-found equivalence or malformed nested JSON handling (`scripts/pdf-processing-db.test.mjs:525-623`).

### S-03 integration boundary

- The roadmap requires S-04 to display recipes that S-03 allows the user to keep and to mark their missing elements (`context/foundation/roadmap.md:154-166`).
- In the current S-04 worktree, no S-03 research, plan, migration or shared read type exists. The current import contract defines omission reasons only on candidates, while finalization excludes incomplete candidates and the saved table does not persist `missingFieldReasons` (`src/lib/pdf-processing/contracts.ts:3-22,90-102`; `src/lib/pdf-processing/service.ts:254-300`).
- Consequently, S-04 can own query boundaries, list/detail composition and presentation seams, but it cannot name S-03's eventual nullable fields, sentinels or omission markers. The implementation plan should make compatibility with the landed S-03 contract a prerequisite for the missing-field presentation and integration verification, not create an S-04 migration that guesses the contract.

### UI and route composition

- The current `/dashboard` page supplies authenticated identity, import availability and optional import feedback to `DashboardView`; the collection section is still a neutral placeholder (`src/pages/dashboard.astro:8-17`; `src/components/dashboard/DashboardView.astro:30-53`). S-04 replaces that section with real empty/populated states without changing import feedback or sign-out behavior.
- S-08's applied runtime source is `src/styles/global.css`. Product views use semantic roles and the shared controls/surfaces; literal colours, palette utilities, inline styles and arbitrary Tailwind values are outside the contract (`AGENTS.md:8-19`; `context/archive/2026-10-12-unify-dashboard-design-system/theme-contract.md:3-28`).
- The existing dashboard scale is `max-w-4xl`, responsive page padding, stacked-to-row header, `rounded-xl`/`shadow-surface` surfaces and `min-h-11`/`rounded-lg` controls (`src/components/dashboard/DashboardView.astro:13-53`; `src/components/ui/button.tsx:7-31`; `src/components/ui/card.tsx:5-55`). The recipe views should reuse this hierarchy and the existing Card, Alert and Button primitives.
- The isolated preview already renders production dashboard components with deterministic synthetic data and no authenticated product route. S-04 fixtures should extend this pattern rather than add a public fixture route (`tools/ui-preview/src/pages/index.astro:1-49`).
- In the current UI guard, the exact scanned set is four files, so new S-04 product components would be unchecked until added deliberately (`scripts/check-ui-contract.mjs:3-8`). The existing capture script also contains S-08-specific paths; S-04 evidence needs its own target instead of recreating an archived change directory.

### Framework checks

- Current Astro documentation supports on-demand dynamic routes through files such as `src/pages/product/[id].astro`, reads the identifier from `Astro.params`, and permits a standard `Response` for a 404. The repository is already configured with `output: "server"`, so route-level `prerender = false` is unnecessary (`astro.config.mjs:10-17`; [Astro routing documentation](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/on-demand-rendering.mdx)).
- Current Supabase documentation confirms that queries made with the caller's authenticated client respect RLS; `.eq(...).maybeSingle()` is an available shape for a detail read that returns no visible row without treating absence as a query error ([Supabase RLS documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/functions/auth-legacy-jwt.mdx); [Supabase JavaScript example](https://github.com/supabase/supabase/blob/master/apps/www/lib/marketplaceDb.ts)).

## Code References

- `supabase/migrations/20261008120000_pdf_processing.sql:186-243` — saved recipe schema, owner index, privileges and RLS.
- `supabase/migrations/20261009120000_product_pdf_import.sql:217-242` — evaluation-only import recipe RPC that S-04 should not reuse.
- `src/lib/pdf-processing/contracts.ts:3-22,74-102` — candidate omission reasons and nested recipe shapes.
- `src/lib/pdf-processing/service.ts:254-300` — current complete-only finalization boundary.
- `src/lib/pdf-validation.ts:198-215` — existing cookie-bound RLS read-back pattern.
- `src/middleware.ts:4-48` — protected route, authenticated identity and cache policy.
- `src/pages/dashboard.astro:8-17` — current page composition.
- `src/components/dashboard/DashboardView.astro:13-53` — S-08-compliant dashboard shell and placeholder.
- `src/styles/global.css:13-156` — applied semantic theme roles.
- `tools/ui-preview/src/pages/index.astro:1-49` — isolated deterministic preview entry.
- `docs/reference/contract-surfaces.md:5-11` — existing route, identity, cache and ownership contracts.

## Architecture Insights

Keep reads server-side and request-local: page → cookie-bound Supabase client → RLS-protected `recipes` query → runtime narrowing/read mapper → presentation component. The list and detail should share one projection/read model so their ownership and nested-data rules cannot drift. The detail lookup should expose no owner selector and should map both a foreign ID hidden by RLS and a nonexistent ID to the same external absence behavior.

Keep the S-03 dependency narrow: S-03 owns how incomplete saved content and its missing-element metadata are represented. S-04 owns how the list/detail consume that exported contract and how an explicitly reported missing element is shown using the S-08 visual language. A compatibility/integration phase can depend on the landed S-03 contract without blocking design and implementation of the complete-recipe path.

## Historical Context (from prior changes)

- The completed S-02 change established backend-controlled recipe persistence, RLS-backed read-back and trusted import outcomes; the current source still expresses those contracts (`context/archive/2026-10-09-import-complete-recipes/plan-brief.md`; `src/lib/pdf-validation.ts:198-215`).
- The completed S-08 change explicitly deferred real collection emptiness, recipe listing and detail to S-04, while making the semantic token/component contract available for reuse (`context/archive/2026-10-12-unify-dashboard-design-system/plan-brief.md:31-47`; `context/archive/2026-10-12-unify-dashboard-design-system/visual-verification.md:123-135`).

## Related Research

- `context/archive/2026-10-12-unify-dashboard-design-system/research.md`
- `context/archive/2026-10-09-import-complete-recipes/plan-brief.md`

## Open Questions

- What is the visible default ordering, and what deterministic tiebreak applies when creation timestamps are equal?
- Does the list load the entire expected collection or use pagination/incremental loading, and where is that boundary visible to the user?
- Which metadata belongs on a list card versus only on the detail page?
- Does the detail show the source start page, the full stored page set, or a compact range/list derived from that set?
- What exact route and not-found presentation should the detail use while keeping foreign and nonexistent IDs indistinguishable?
- Which S-03 artifact will become the imported source of truth for missing fields, and what integration gate is required before S-04 can claim support for kept incomplete recipes?
