---
change_id: unify-dashboard-design-system
title: Design system and dashboard UI consistency
status: impl_reviewed
created: 2026-10-12
updated: 2026-10-12
archived_at: null
---

## Notes

Roadmap: S-08, working title “UI-01 — Design system i ujednolicenie UI”. See `context/foundation/roadmap.md`. S-02 is complete; finish this contract before implementing S-04. S-03 can proceed independently if shared-component edits do not conflict.

One target view: `/dashboard` (`src/pages/dashboard.astro`), including `src/components/pdf-processing/ImportOutcomeBanner.tsx`. Token source: `src/styles/global.css`, configured by `components.json`; shared primitives: `src/components/ui`.

Contract variant: existing design system, bypassed by the target view. Extend the existing `:root` / `.dark` values and `@theme inline` mappings; reuse existing primitives. Do not initialise another theme or component system. Connect the dashboard to the existing contract and map the selected motif onto its semantic roles. Establish coherent colours, typography, spacing and layout, with only the base components needed by this view.

Out of scope: new functionality, recipe listing/filtering/details, PDF-import business logic, a redesign of all screens, and reopening parked real-phone/Firefox import verification. Shared changes need regression checks on existing consumers, not a redesign of those consumers.

### Pre-audit and research handoff

Static pre-audit on 2026-10-12; no running-app or screenshot verification has been performed yet. `context/foundation/lessons.md` contains no recorded lessons.

| Target file                                             | Hardcoded-value matching lines | Matching occurrences | Semantic colour-class occurrences | Imports from `components/ui` |
| ------------------------------------------------------- | ------------------------------ | -------------------- | --------------------------------- | ---------------------------- |
| `src/pages/dashboard.astro`                             | 9                              | 17                   | 0                                 | 0                            |
| `src/components/pdf-processing/ImportOutcomeBanner.tsx` | 4                              | 6                    | 0                                 | 0                            |

Counts use the `/10x-ui` hardcoded-value pattern on the view files, excluding the token source. They are candidates, not confirmed defects. The dashboard imports one feature component, `ImportOutcomeBanner`; the banner imports no shared UI components. `Layout.astro` imports global CSS, so the token source is loaded, but the view does not use its semantic colour classes.

Research brief for `/10x-research unify-dashboard-design-system`: perform the source → view and view → source audit, then record 3–5 evidence-backed findings in `research.md` under `## Charges`, each with category, file/line, user impact and the existing token/component that should cover it. Investigate these candidates:

- Missing tokens: `src/pages/dashboard.astro:14`, `:18`, `:28`, `:41` and `src/components/pdf-processing/ImportOutcomeBanner.tsx:31` bypass semantic colours, including focus styles. Trace `bg-cosmic` to its literal gradient in global CSS. Changing the theme currently leaves these surfaces and states behind.
- Missing shared components: `src/pages/dashboard.astro:26` and `:39` duplicate control styling despite `src/components/ui/button.tsx`; the empty-state container at `:48` needs an assessment of the smallest reusable primitive. Avoid creating a component catalogue.
- Accidental architecture / scope boundary: `src/pages/dashboard.astro:48` unconditionally displays “No recipes yet”, including alongside a successful-import banner. Assess truthful presentation within S-08; do not implement S-04 listing or new collection queries implicitly. Defer anything requiring new functionality with a reason.
- Entry and feedback states: `src/middleware.ts:42` redirects logged-out users, but `:19`–`:30` returns JSON when infrastructure is unconfigured. `ImportOutcomeBanner.tsx:27` renders nothing while no outcome exists; `src/lib/pdf-processing/dashboard-import.ts` also returns null for unavailable/invalid outcomes. Distinguish loading, error and intentional absence, preserve owner-scoped reads and import logic, and assess which states are applicable or deferred.
- Rules and regression surface: inspect `AGENTS.md`, `src/components/auth/SubmitButton.tsx`, and other token/component consumers. The current agent rules route work through `/10x-ui` but do not yet specify project token locations, reuse rules or visual verification. Existing ESLint/Husky tooling can support a guard scoped to the cleaned view.

The later plan must order phases as environment/library → token values → one view → states. Preserve each charge or explicitly defer it with a reason. Store chosen raw token values and their provenance in this change folder when selected; no palette has been selected during pre-audit.

Completion evidence: default, hover, focus-visible, disabled, error, empty and loading states, each shown or marked N/A with a reason; visible keyboard focus, accessible names and contrast; desktop and one mobile-width screenshots through a kitchen sink or an existing screenshot tool. Check both themes where supported without adding a theme toggle as new functionality. Repeat the literal scan after visual phases. Leave project UI rules in `AGENTS.md` outside the CLI-managed block and use the existing checking mechanism to prevent drift. Finish through `/10x-impl-review`.

### Selected theme — 2026-10-12

The user selected [cagops on tweakcn](https://tweakcn.com/themes/cmnjexv1n000304jse9nq2jra). Contract variant: named motif mapped onto the existing design system. The exact light/dark style dictionaries retrieved from the theme page are stored in `theme-source.json`, with source URL and retrieval date. This is a source snapshot, not applied application configuration.

Use this motif for the palette, font families, radius, spacing base, tracking and shadow values. Preserve existing semantic names and shared components; do not initialise another theme system. Font loading, derived shadow utilities, layout hierarchy and contrast verification remain planning work. Both theme variants are recorded; selecting this motif does not add a theme toggle or expand the one-view scope. Any accessibility-driven deviation should be explicit and leave the raw source snapshot intact.
