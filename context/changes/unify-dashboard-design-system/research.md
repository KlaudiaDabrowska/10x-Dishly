---
date: 2026-10-12T18:05:12+02:00
researcher: Codex
git_commit: 6fb07a50e385f948dbbed9eec98e462e4bea3bfb
branch: unify-dashboard-design-system
repository: 10xdevs
topic: "S-08: existing dashboard design-system audit"
tags: [research, codebase, ui, dashboard, design-system]
status: complete
last_updated: 2026-10-12
last_updated_by: Codex
last_updated_note: Recorded the user-selected tweakcn motif and its source snapshot
---

# Research: Dashboard design-system contract

## Research Question

What existing tokens and components should S-08 reuse, where does `/dashboard` bypass them, and what presentation and verification gaps must the later plan address? Scope comes from `change.md` and S-08 in `context/foundation/roadmap.md:118`. This is a codebase investigation, not an implementation plan or a completed visual audit.

## Summary

Extend the existing design system. `components.json:8` already points to global CSS, and its UI alias at `:16` points to local primitives. `src/styles/global.css:6`, `:41` and `:75` define light/dark values and variable-backed semantic mappings. The dashboard and import-outcome banner bypass those colour roles and shared controls; the system is not unused application-wide (`src/components/ui/button.tsx:12`, `src/components/auth/SubmitButton.tsx:3`).

The target files contain 23 palette-pattern occurrences on 13 matching lines: 17/9 in `src/pages/dashboard.astro:14`–`:55` and 6/4 in `src/components/pdf-processing/ImportOutcomeBanner.tsx:31`–`:40`. These are static scan counts, not 23 independently confirmed defects. Focus styles exist but use local palette colours. Existing spacing utilities are standard scale values, not arbitrary numeric CSS.

The presentation also needs an explicit scope boundary: the dashboard unconditionally asserts an empty collection, while its banner can confirm saved recipes (`dashboard.astro:48`, `ImportOutcomeBanner.tsx:37`). A truthful placeholder is possible without adding the S-04 recipe query. Conversely, unavailable import confirmation is not proof of import failure: the existing helper deliberately suppresses several outcomes (`src/lib/pdf-processing/dashboard-import.ts:43`–`:55`).

## Detailed Findings

### Token source, typography and layout

- **Observed:** global CSS is loaded by `src/layouts/Layout.astro:2`; role colours are applied to the body at `src/styles/global.css:121`. Values live in `:root` and `.dark`; `@theme inline` references them rather than duplicating raw values (`:75`). Preserve this separation.
- **Observed:** `bg-cosmic` contains a literal gradient at `global.css:113`. Dashboard backgrounds, text and focus styles instead use white/blue/purple classes (`dashboard.astro:14`, `:18`, `:28`, `:41`, `:50`). The emerald success palette in `ImportOutcomeBanner.tsx:31` has no corresponding success role in the inspected global token blocks.
- **Observed:** the dashboard defines its hierarchy locally: shell spacing at `dashboard.astro:14`, container width at `:15`, title scale at `:18` and body text at `:21`. The inspected global CSS contains no project font, type scale, spacing or container contract. Standard scale utilities need documented choices, not automatic replacement with custom tokens.
- **Observed:** project radius mappings cover `sm`, `md`, `lg`, `xl` (`global.css:76`–`:79`), whereas the two target surfaces use `rounded-2xl` (`dashboard.astro:50`, `ImportOutcomeBanner.tsx:31`). A coherent radius policy must account for this difference.
- **Bounded absence:** `.dark` values exist, but no activation or toggle was found in the inspected `src` theme/layout/page paths. Do not equate token support with a delivered dark-mode feature. Theme verification can exercise the token variants without introducing a toggle.

### Source → view and view → source inventory

The `/10x-ui` scan was repeated on the two target files, excluding global CSS. Both files have zero direct hex/colour-function/arbitrary-numeric-value matches, zero semantic colour-class occurrences and zero imports from `components/ui`; their matches are palette classes. The dashboard imports one feature component at `dashboard.astro:3`, not a UI primitive. `bg-cosmic` hides additional raw values in its source, outside these counts (`global.css:114`).

| Existing value or local styling   | Existing contract / gap                                                                                           | Evidence                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Cosmic background and white text  | `background`, `foreground` roles                                                                                  | `dashboard.astro:14`; `global.css:8`                |
| Blue muted text                   | `muted-foreground`                                                                                                | `dashboard.astro:21`; `global.css:19`               |
| Purple action and outline         | `primary`, `primary-foreground`, `ring`; Button variants                                                          | `dashboard.astro:41`; `button.tsx:8`, `:12`         |
| Translucent empty/status surfaces | Existing `card`, `border` roles; shared surface primitive missing                                                 | `dashboard.astro:50`; `global.css:10`, `:23`        |
| Emerald success feedback          | No success role in inspected token source; select neutral role use or a minimal semantic addition during planning | `ImportOutcomeBanner.tsx:31`; `global.css:6`–`:110` |

`src/components/ui` currently contains `button.tsx` and `LibBadge.astro`; it has no Card or Alert. `button.tsx:50` exports both Button and its variants, providing a reuse point for the Astro page without inventing another button style. The rendering choice belongs to planning; preserve native form submission and link semantics.

### Shared-change regression surface

The three inspected Button import sites are `src/components/auth/SubmitButton.tsx:3`, `src/components/pdf-processing/RecipeImportPanel.tsx:4` and `src/components/pdf-processing/PdfValidationPanel.tsx:4`. Auth overrides palette values (`SubmitButton.tsx:18`) but inherits focus and disabled rules. The import panels use destructive and secondary variants (`RecipeImportPanel.tsx:65`, `:70`; `PdfValidationPanel.tsx:294`, `:299`). Changing these variants can affect completed S-02 and parallel S-03 work.

The seven `bg-cosmic` consumers under `src` are `Welcome.astro:5`, `dashboard.astro:14`, `dashboard/import.astro:10`, `dashboard/pdf-validation.astro:11`, `auth/signin.astro:9`, `auth/signup.astro:9` and `auth/confirm-email.astro:22` (component/page paths respectively). Moving the dashboard to semantic backgrounds need not change that utility for the other screens. Global body changes still need regression inspection. Layout's conditional configuration banner (`Layout.astro:22`) is another shared presentation surface, not a reason to redesign another view.

The primitive itself includes `ring-[3px]` and destructive `text-white` (`button.tsx:8`, `:14`). A guard intended for cleaned views should not blindly treat primitive internals or token declarations as equivalent violations.

### Entry paths and data boundaries

- In a configured environment, anonymous dashboard requests redirect to sign-in (`src/middleware.ts:42`–`:44`); private responses receive `private, no-store` (`:6`). This guard exists and must be preserved.
- Without a Supabase client, protected routes return 503 JSON (`middleware.ts:19`–`:30`). `scripts/check-preview.mjs:24`–`:40` explicitly asserts this shape and cache policy. This is a poor browser fallback but also an existing fail-closed contract, not an accidental missing stylesheet.
- With no import parameter, the dashboard does not mount the banner (`dashboard.astro:9`, `:35`). With a malformed parameter, the mounted banner removes it from the URL and skips fetching (`ImportOutcomeBanner.tsx:14`–`:16`).
- For a valid ID, the helper requests the status endpoint and accepts a committed, read-back-confirmed outcome with valid nonnegative counters, no pending recipes and a positive saved/already-saved total (`dashboard-import.ts:39`–`:53`). Tests cover trusted status results and suppression at `scripts/dashboard-import.test.mjs:21`, `:38`. Preserve those predicates and do not substitute URL-supplied counts.
- The banner removes the query via `replaceState`; after a reload without that query it is absent (`ImportOutcomeBanner.tsx:14`, `dashboard.astro:35`). It is transient confirmation, not a persistent collection-state source.
- An unavailable import capability omits the CTA (`dashboard.astro:37`); this is not a disabled-control state. Keep the capability gate.

## Charges

These five code-backed findings are the planning input. Browser impact described as risk remains unmeasured where noted. Each must be addressed or explicitly deferred in the plan.

### C1 — Missing tokens: the dashboard bypasses the theme contract

**Evidence:** `src/pages/dashboard.astro:14`, `:18`, `:28`, `:41`, `:50`; `src/components/pdf-processing/ImportOutcomeBanner.tsx:31`; `src/styles/global.css:113`.

**User impact:** theme and focus changes can leave the dashboard's actions, text and feedback visually inconsistent.

**Disposition:** in scope. Map colours to the existing roles, resolve the success-role gap, and document type/spacing/layout/radius choices. Preserve the existing token architecture. The user subsequently selected the cagops motif; see the theme follow-up below.

### C2 — Missing shared components: controls duplicate existing primitive styling

**Evidence:** `src/pages/dashboard.astro:26`, `:39`, `:48`; `src/components/ui/button.tsx:8`, `:50`; `src/components/pdf-processing/ImportOutcomeBanner.tsx:30`.

**User impact:** control and surface states drift between dashboard, authentication and import flows.

**Disposition:** in scope. Reuse Button/variants and assess the smallest shared surface/feedback component needed by this view. Keep signout as a POST form and import as navigation. Do not create a component catalogue.

### C3 — Accidental architecture: the collection placeholder asserts unsupported emptiness

**Evidence:** `src/pages/dashboard.astro:48`–`:55` has no collection-state condition, while `src/components/pdf-processing/ImportOutcomeBanner.tsx:37` can announce saved recipes. `scripts/smoke.mjs:80`–`:81` hardcodes the current empty-state wording.

**User impact:** after a confirmed import, “No recipes yet” can suggest that saved recipes were lost.

**Disposition:** truthful placeholder copy is a scope-safe option to decide during planning; update copy assertions deliberately if chosen. Actual collection queries, recipe listing and real empty/nonempty detection are **deferred to S-04**. Do not infer an empty collection from absent transient confirmation.

### C4 — Accidental architecture: feedback states and operational fallback lack a view contract

**Evidence:** `ImportOutcomeBanner.tsx:11`, `:27` renders nothing during fetching or a null result; `dashboard-import.ts:43`–`:55` conflates multiple reasons for no result. `middleware.ts:30` emits JSON for the unavailable dashboard; `scripts/check-preview.mjs:34` asserts it.

**User impact:** a user cannot see confirmation loading; successful feedback insertion can shift layout (inferred, not measured). An unavailable environment exposes JSON instead of a view.

**Disposition:** a component-local loading/settled presentation can be considered without changing import validation. A settled-null message must say confirmation is unavailable, not that import failed; retaining intentional silence is also a choice to document. **Defer distinguishing network errors from rejected/unconfirmed results and defer the operational HTML fallback** unless the later scope explicitly includes their contract changes. Preserve API JSON, privacy, outcome filtering and the preview guard.

### C5 — Accidental architecture: project-specific UI rules and a visual gate are absent

**Evidence:** `AGENTS.md:9` routes to the skill but contains no project token/component map; `eslint.config.js:24`, `:74`, `:102` supplies general checks, not a scoped token guard. `package.json:5`–`:31`, `:56`–`:75` and `.github/workflows/ci.yml:29`–`:46` provide lint/build/contract checks, not a configured screenshot runner in the inspected paths.

**User impact:** future views can repeat local styles, and functional checks will not catch visual state regressions.

**Disposition:** in scope. Record project UI rules outside the managed AGENTS block, add a guard through existing checking infrastructure, and establish desktop/mobile screenshot evidence for this view. A kitchen sink can satisfy the gate without adding a screenshot dependency.

## State and Verification Matrix

This is an inventory of code and required evidence, not a passed visual test matrix.

| State         | Current inspected behaviour                                                                                 | Evidence needed later                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| default       | Shell, identity, signout, gated CTA and placeholder; optional confirmed banner (`dashboard.astro:14`–`:55`) | Token/component usage and intended hierarchy on desktop/mobile                                                        |
| hover         | Local palette hover styles on both controls (`dashboard.astro:28`, `:41`)                                   | Visible role-based hover states                                                                                       |
| focus-visible | Explicit purple outlines exist (`dashboard.astro:28`, `:41`)                                                | Keyboard traversal, accessible names and focus-token contrast; do not report current focus as absent                  |
| disabled      | No disabled dashboard control; CTA omitted when unavailable (`dashboard.astro:37`)                          | Shared Button disabled fixture; production N/A with reason where no pending interaction exists; no fake disabled link |
| error         | Null confirmation is suppressed; unconfigured route is JSON (`dashboard-import.ts:43`, `middleware.ts:30`)  | Explicit decision under C4; error primitive fixture or justified N/A, without inventing import failure                |
| empty         | Unconditional placeholder, not measured collection state (`dashboard.astro:48`)                             | Truthful placeholder; real recipe emptiness deferred to S-04                                                          |
| loading       | Initial null renders no banner (`ImportOutcomeBanner.tsx:11`, `:27`)                                        | Local pending presentation or documented disposition, no unexamined layout jump                                       |

Preserve the status announcement and decorative-icon hiding (`ImportOutcomeBanner.tsx:32`–`:35`), section labelling (`dashboard.astro:49`), POST signout and current-user identity. Include a long email, CTA available/unavailable and valid/invalid/absent import query in later visual verification. The document declares English (`Layout.astro:14`) while import feedback is Polish; planning should make any copy/language decision explicit rather than silently localising other screens.

`scripts/dashboard-import.test.mjs` checks helper contracts, not rendering or keyboard behaviour. `scripts/smoke.mjs:77`–`:86` checks text and form structure; it does not prove screenshot quality. The existing hook runs lint-staged (`.husky/pre-commit:1`), with Markdown formatting configured in `package.json:81`. Use existing infrastructure for the scoped view guard, excluding token declarations and leaving legacy screens outside its first scope.

## Architecture Insights and Planning Handoff

The settled boundary is one existing dashboard plus its shared token/component contract. S-04 integrates recipe browsing later; S-03 remains independent only with coordinated shared-component edits (`context/foundation/roadmap.md:130`). Presentation reuse must retain authentication, cache policy, import capability checks and trusted outcome predicates.

The later plan should map C1–C5 to environment/library → token values → one view → states, retaining deferred findings. Choose concrete values and store their provenance in this change folder at that stage. The user-selected cagops motif is recorded below. No additional library, public fixture route or rendering approach has been selected here. Library-specific implementation choices should be checked against current documentation during planning; this investigation relied on repository source rather than external API claims.

## Historical Context and Related Research

- **Supported, with a new limitation:** S-01 explicitly built an empty-only collection without recipe queries (`context/archive/2026-09-26-private-recipe-collection/plan.md:201`). Current dashboard source preserves that scope, but S-02's success feedback now makes unconditional empty wording misleading. This does not invalidate the original auth/isolation requirements.
- **Supported:** S-02 specified gated import navigation, trusted outcome counts and URL cleanup (`context/archive/2026-10-09-import-complete-recipes/plan.md:140`). The current dashboard/helper still expresses these contracts.
- The pre-audit in `change.md` is the related input; its static scan counts were confirmed. `context/foundation/lessons.md` has no recorded project lessons. No archived UI research was needed to establish the current contract.

## Open Questions and Evidence Limits

- Palette and font-family direction is settled by the user-selected cagops motif. Type hierarchy, layout conventions, font loading and contrast verification still need concrete treatment during planning.
- Should a valid but unconfirmed import link show a neutral unavailable-confirmation message or retain silence? Decide without interpreting null as a failed import or exposing another user's data.
- What exact neutral placeholder wording and language should replace the unsupported empty assertion? Recipe loading remains outside this slice.
- Where will the state fixture and screenshots live, and how will they render with an authenticated local session or deterministic isolated presentation? Do not bypass production auth or trigger paid imports for screenshots.
- Static research is complete for the inspected scope. No live browser, computed-style, contrast, responsive, keyboard or screenshot verification was performed. Visual defects beyond the code-backed findings remain unverified; the later visual gate is still required. No build or application test was run because this investigation changed no application behaviour.

## Research Method and Code References

Read-only parallel investigations covered (1) tokens/primitives/consumers and (2) states/entry paths/contracts. The primary pass checked guard configuration, CI, historical contracts and decisive source paths. Both investigations completed before synthesis. References use repository-relative `file:line` anchors at the recorded local commit; no remote permalink is asserted.

Decisive sources: `components.json:8`; `src/styles/global.css:6`; `src/components/ui/button.tsx:7`; `src/pages/dashboard.astro:14`; `src/components/pdf-processing/ImportOutcomeBanner.tsx:10`; `src/lib/pdf-processing/dashboard-import.ts:31`; `src/middleware.ts:19`; `scripts/check-preview.mjs:24`; `scripts/dashboard-import.test.mjs:21`; `scripts/smoke.mjs:77`; `AGENTS.md:9`; `eslint.config.js:102`.

## Follow-up: selected tweakcn motif — 2026-10-12

The user supplied https://tweakcn.com/themes/cmnjexv1n000304jse9nq2jra as the desired theme. The page embeds a theme record with that exact ID and the name `cagops`. Its light and dark style dictionaries were extracted as data, without executing page scripts, into `theme-source.json`. The snapshot contains the source URL, retrieval date, theme ID, name and unmodified style values; unrelated page/account metadata was excluded.

This supersedes the earlier open palette preference. In `theme-source.json`, light background is `#FDFBF9`, primary is `#B94E3A`, and the sans-serif stack starts with Montserrat. Both variants specify radius `0.5rem` and spacing `0.25rem`; shadow and tracking values differ by variant. These are source values, not evidence of loaded fonts or verified contrast in Dishly.

Planning should map the motif onto existing roles and resolve font loading, derived shadows, and any needed success-feedback role. Preserve the source snapshot if accessibility adjustments are necessary and record the adjustment rationale separately. Existing C1–C5 findings and scope limits remain applicable. No application CSS, dependencies, plan or roadmap status changed in this follow-up.
