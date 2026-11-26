# Edit saved recipe — Plan Brief

> Full plan: `context/changes/edit-saved-recipe/plan.md`
> Research: `context/changes/edit-saved-recipe/research.md`

## What & Why

An owner can correct the title, ingredients, and instructions of an already saved recipe, including a recipe kept despite incompleteness. The save must preserve owner isolation, category, source identity, and immutable import provenance.

## Starting Point

Dishly already has protected, RLS-backed recipe list and detail reads. Browser roles have `SELECT` only; there is no recipe mutation route, while database constraints already bind current content to `current_missing_reason_codes`.

## Desired End State

The owner edits at `/dashboard/recipes/:id/edit`, saves through `PATCH /api/recipes/:id`, and reads the persisted correction on the existing detail page. Foreign, missing, malformed, and stale writes fail without mutation or disclosure.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Write boundary | Same-origin API plus service-role-only RPC | Keeps browser recipe access read-only | Research |
| UX | Dedicated edit page | Gives the dynamic form and failures a clear lifecycle | Plan |
| Ingredient model | Display line plus search name | Keeps editing simple while preserving S-05 input | Plan |
| Quantity/unit | Clear when display line changes | Avoids hidden contradictory metadata without a parser | Plan |
| Incomplete content | Allow partial repair; forbid new gaps | Supports incremental correction safely | Plan |
| Semantic omissions | Clear when the related editable area changes | Selected low-friction product rule | Plan |
| Concurrency | Optimistic `updated_at` conflict | Prevents silent multi-tab overwrite | Plan |
| S-05 | Defer filter-freshness gate until S-05 exists | Filtering is absent at this revision | Research |

## Scope

**In scope:** additive RPC migration, recipe write domain/API, dedicated edit form, partial repairs, conflict handling, DB/API/security/smoke tests, isolated UI evidence, and contract documentation.

**Out of scope:** category/source/servings/footnotes editing, import-time editing, deletion, AI parsing, direct browser updates, pessimistic locking, drag-and-drop ordering, S-05 implementation, and Playwright.

## Architecture / Approach

`RecipeEditForm` → `PATCH /api/recipes/:id` → trusted validation/canonicalization → owner-scoped RPC → existing RLS-backed read model. The client never supplies owner, category, provenance, quantity/unit, or omission codes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data mutation contract | Forward migration, RPC, and real-DB proof | IDOR and inconsistent persistence |
| 2. Authenticated recipe API | Validator, adapter, PATCH route, and contract tests | Overbroad input and information leaks |
| 3. Dedicated edit experience | Accessible form, states, and visual evidence | Data loss and mobile usability |
| 4. Integrated verification and rollout | Worker smoke, build, contracts, and rollout record | Cross-layer regression |

**Prerequisites:** installed dependencies; local Docker/Supabase for DB gates; completed S-04.
**Estimated effort:** 5–7 focused sessions across four phases, excluding later S-05 integration.

## Open Risks & Assumptions

- Automatic semantic-warning clearing can hide a partial source-level correction; this is an accepted product choice.
- Editing a display line clears its imported quantity/unit metadata; this is an accepted product choice.
- Filter freshness remains a mandatory S-05 integration gate, not a claim of this change.

## Success Criteria (Summary)

- An owner corrects any allowed area and reads the persisted result, including partial repair of a kept-incomplete recipe.
- Foreign, malformed, nonexistent, stale, and tampered requests disclose nothing and do not mutate data.
- Category, source/import identity, and import-time provenance remain unchanged; all required automated and visual gates pass.
