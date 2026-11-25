# S-05 visual verification

## Scope and evidence boundary

The isolated `filters` profile in `tools/ui-preview` renders deterministic filter and result fixtures without
authentication, Supabase, PDF content, or product service calls. The screenshots verify presentation only. The real
database suite and authenticated built-Worker smoke provide separate evidence for RPC behavior, owner isolation, and
filter-to-detail navigation.

The capture profile accepts only `--change=find-meal-from-pdf --set=filters` and writes PNG files to
`context/changes/find-meal-from-pdf/evidence/`. Capturing files does not itself close the manual visual gate.

## State and viewport matrix

| State               | Fixture query                           | Desktop     | Mobile    | Evidence | Manual acceptance |
| ------------------- | --------------------------------------- | ----------- | --------- | -------- | ----------------- |
| Default filters     | `view=recipes&recipe=filter-default`    | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Category only       | `view=recipes&recipe=filter-category`   | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Ingredient only     | `view=recipes&recipe=filter-ingredient` | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Combined filters    | `view=recipes&recipe=filter-combined`   | 1440 × 1000 | 390 × 844 | captured | accepted          |
| No filtered results | `view=recipes&recipe=filter-no-results` | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Invalid filters     | `view=recipes&recipe=filter-invalid`    | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Submit hover        | `view=recipes&recipe=filter-hover`      | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Ingredient focus    | `view=recipes&recipe=filter-focus`      | 1440 × 1000 | 390 × 844 | captured | accepted          |
| Long ingredient     | `view=recipes&recipe=filter-long`       | 1440 × 1000 | 390 × 844 | captured | accepted          |

## Automated inspection

The capture completed on 2026-11-24. Representative desktop and mobile screenshots were inspected for hierarchy,
active values, conditional clear action, distinct no-results and invalid states, semantic hover/focus treatment, long
value clipping, and horizontal overflow. No exception was found. The 390 px layout stacks both controls and actions,
keeps the 44 px control scale, and preserves readable collection cards below the form.

The user accepted the visual matrix on 2026-11-24. The representative product-import flow is exercised by
`npm run smoke:pdf-product`: its deterministic local PDF fixture is finalized through the product API, appears in a
category-and-ingredient filtered dashboard, and opens through the rendered result link with its source PDF and
ingredient intact. The separate authenticated Worker smoke confirms that the same dashboard search cannot reveal a
foreign owner's ingredient canary.

## Commands and runtime evidence

- `npm run check:ui-preview` — passed with source isolation, Astro check/build, and the port-bound preview check.
- `npm run capture:ui-preview -- --change=find-meal-from-pdf --set=filters` — passed and wrote 18 named PNGs.
- `npm run test:pdf:db` — passed 36 tests in an isolated Supabase project. Five measured authenticated searches over
  1000 owner recipes took 5.0, 4.6, 5.2, 5.3, and 5.0 ms after one warm-up request.
- `npm run smoke` — passed all authenticated built-Worker steps, including filter → detail and a private ingredient
  canary owned by the second account.
- `npm run smoke:pdf-product` — passed the provider-free product import, status recovery, filtered dashboard → imported
  recipe detail, and owner-scoped read-back checks.

The preview and Worker processes were stopped. The local Supabase stack was stopped with backup enabled, preserving
its data and the applied filtering migration. No external deployment or AI-provider request was performed.
