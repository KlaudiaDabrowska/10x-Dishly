---
change_id: find-meal-from-pdf
title: Find meal from PDF
status: approved
created: 2026-11-23
updated: 2026-11-23
research: context/changes/find-meal-from-pdf/research.md
---

# Plan: Find meal from PDF

## Goal

Let an authenticated user filter their imported recipe collection by category, one ingredient query, or both together, then open the existing recipe detail. Filtering stays server-rendered, owner-scoped through RLS, deterministic, and fast for collections of up to 1,000 recipes.

## Product decisions

- Supported categories are `breakfast`, `lunch`, `dinner`, and `dessert`.
- Category and ingredient filters combine with AND semantics.
- Blank ingredient input means no ingredient filter; the maximum normalized query length is 500 characters.
- `pomidor` is the only first-version morphology family. It includes noun inflections and adjective forms such as `pomidorowy`; `passata` and `ketchup` do not match.
- Other ingredients use exact normalized tokens: `ryż` matches the token in `ryż basmati`, but not `ryżu`.
- A multiword query is satisfied only when all query tokens occur in the same ingredient name, regardless of order. Tokens may not be combined across separate ingredient entries.
- Result cards remain title-only. Applying filters uses an explicit GET submit and resets pagination to page 1.
- Invalid/repeated filter values return a neutral HTTP 400 view. Invalid or out-of-range pages retain the existing 404 behavior.
- Pagination remains 24 rows, ordered by `created_at DESC`, then `id ASC`, and preserves active filters.

## Architecture

Add a generated nested JSONB search representation to `public.recipes`: each ingredient name produces one inner normalized token array. PostgreSQL JSONB containment can then require all query tokens within one ingredient group, while a GIN `jsonb_path_ops` index supports the predicate. A `SECURITY INVOKER` RPC performs owner-scoped filtering and returns only the list read model. The Astro dashboard parses URL filters, calls the RPC through the request-local Supabase client, and renders an SSR GET form plus the existing list/detail flow.

## Phase 1: Ingredient index and RPC

### Overview

Create the deterministic database search representation and secure read function before changing application code.

### Changes required

- Add `supabase/migrations/20261123210000_recipe_filtering.sql`.
- Define an immutable normalizer that NFC/lowercases, tokenizes Polish/ASCII alphanumerics, maps the approved tomato noun/adjective allowlist to `pomidor`, and leaves every other token exact.
- Add generated `ingredient_search_groups jsonb`, preserving one token group per individual ingredient name, plus a GIN `jsonb_path_ops` index.
- Add `public.search_recipes(p_category text default null, p_ingredient text default null)` as `STABLE SECURITY INVOKER`, with an empty search path, explicit owner predicate, RLS compatibility, exact list projection, deterministic ordering compatibility, category/ingredient AND behavior, and same-ingredient multiword containment.
- Revoke execution from `public`/`anon` and grant it to `authenticated`.
- Extend the real-database suite to cover generation, approved tomato forms, negative substitutions, exact non-tomato tokens, same-ingredient multiword matching, null categories, AND semantics, ownership, grants, and automatic refresh after ingredient updates.

### Success criteria

#### Automated

- `npm run test:pdf:migration`
- `npm run test:pdf:db`

#### Manual

- None.

## Phase 2: Read contract and URL parsing

### Overview

Expose validated filter parameters to the owner-scoped recipe reader and preserve existing pagination/error boundaries.

### Changes required

- Extend `src/lib/recipes/read.ts` with typed category/ingredient filters and strict URL parsing: blank ingredient becomes absent; repeated filters, unsupported category, or ingredient over 500 characters return a filter-validation error.
- Keep invalid/out-of-range page handling as 404 and preserve valid filters in first-page links.
- Replace the list adapter query in `src/lib/recipes/supabase-read.ts` with `rpc('search_recipes', ...)`, exact count, deterministic ordering/range, and the existing narrow result mapping.
- Update `src/pages/dashboard.astro` to map invalid filters to a neutral HTTP 400 state without hydration.
- Extend `scripts/recipe-read.test.mjs` for parsing, RPC payloads, exact count/range, AND input forwarding, errors, and filter-preserving pagination.
- Add `test:recipes` to `package.json` and the existing CI validation job.

### Success criteria

#### Automated

- `npm run test:recipes`
- `npx stryker run --mutate "src/lib/recipes/read.ts" --commandRunner.command "npm run test:recipes"`
- CI configuration invokes `npm run test:recipes` in the existing validation job.

#### Manual

- None.

## Phase 3: Filter form and result states

### Overview

Add the accessible SSR GET controls and distinguish collection, filtered, empty, and invalid states using the shared UI contract.

### Changes required

- Add missing shadcn `Input` and `NativeSelect` primitives through the existing `components.json` setup and review the generated diff.
- Add `src/components/recipes/RecipeFilters.astro` with labelled category and ingredient controls, Polish category labels, `Filtruj`, conditional clear link, and active values.
- Extend `RecipeList.astro` and `DashboardView.astro` with filter-preserving pagination and a distinct no-results state while retaining title-only cards.
- Add filter states to `tools/ui-preview` without replacing S-04 fixtures, and update the UI contract checks where required.
- Add a dedicated `filters` visual capture set tied to `find-meal-from-pdf`.

### Success criteria

#### Automated

- `npm run lint && npm run astro -- check && npm run build`
- `npm run check:ui-preview`

#### Manual

- Verify keyboard operation and layout at a 390px viewport.
- Verify default, category-only, ingredient-only, combined, no-results, invalid, hover, focus, and long-value states follow the Dishly UI contract.

## Phase 4: Integration, performance, and evidence

### Overview

Exercise the complete owner-scoped flow, document the shipped contract, and preserve reproducible verification evidence.

### Changes required

- Extend `scripts/smoke.mjs` with a small filter-to-detail fixture and an owner-isolation canary.
- Add an ad-hoc authenticated performance probe for 1,000 owner recipes: warm once, execute five filtered requests, and require each response below 1,000 ms.
- Update `context/foundation/prd.md`, `context/foundation/test-plan.md` section 6.3, and `docs/reference/contract-surfaces.md` with the tomato-only morphology decision, exact-token behavior for other ingredients, and the RPC/read boundary.
- Capture the approved visual matrix under `context/changes/find-meal-from-pdf/evidence/` without changing public product routes.

### Success criteria

#### Automated

- `npm run test:recipes && npm run test:pdf && npm run test:pdf:db && npm run smoke`
- The warmed 1,000-recipe performance probe completes five authenticated filtered requests, each under 1,000 ms.
- `npm run capture:ui-preview -- --change=find-meal-from-pdf --set=filters`

#### Manual

- Accept the captured visual matrix.
- On a representative imported collection, verify filter-to-detail navigation and confirm that no foreign owner's recipe appears.

## Risks and mitigations

- Morphology can broaden identity incorrectly: use a reviewed explicit tomato allowlist and negative substitution tests.
- Flat token storage can combine separate ingredient entries: store nested groups and test the cross-ingredient negative case.
- RPCs can bypass expected ownership boundaries: use `SECURITY INVOKER`, explicit `auth.uid()` ownership, RLS, narrow grants, and a foreign-owner integration test.
- Generated data can drift after editing: derive it as a generated column and test an ingredient update.
- Filtered pagination can lose state: construct links from validated filters and cover them hermetically.

## References

- `context/changes/find-meal-from-pdf/research.md`
- PostgreSQL JSON types: https://www.postgresql.org/docs/current/datatype-json.html
- PostgreSQL GIN indexes: https://www.postgresql.org/docs/current/gin.html
- Supabase database functions: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/functions.mdx
- Stryker configuration: https://stryker-mutator.io/docs/stryker-js/configuration/

## Progress

### Phase 1: Ingredient index and RPC

#### Automated

- [x] 1.1 Migration equivalence suite passes
- [x] 1.2 Real database filtering contract passes

#### Manual

### Phase 2: Read contract and URL parsing

#### Automated

- [ ] 2.1 Recipe reader suite passes
- [ ] 2.2 Selective Stryker run reviewed
- [ ] 2.3 Existing CI validation invokes recipe tests

#### Manual

### Phase 3: Filter form and result states

#### Automated

- [ ] 3.1 Lint, Astro check, and product build pass
- [ ] 3.2 UI preview contract passes

#### Manual

- [ ] 3.3 Keyboard and 390px responsive flow accepted
- [ ] 3.4 Filter states and UI contract accepted

### Phase 4: Integration, performance, and evidence

#### Automated

- [ ] 4.1 Recipe, PDF, database, and smoke suites pass
- [ ] 4.2 Five warmed 1,000-recipe requests stay below 1,000 ms
- [ ] 4.3 Filter visual evidence captured

#### Manual

- [ ] 4.4 Visual matrix accepted
- [ ] 4.5 Representative filter-to-detail and owner isolation accepted
