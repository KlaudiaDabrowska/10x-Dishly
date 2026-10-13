# Visual verification

## Phase 1 component preview

The isolated preview imports only the shared UI primitives and local styles. It does not load the production adapter,
middleware, environment schema, Supabase clients, or PDF import code.

### Commands

- `npm run dev:ui` starts the editable preview at `http://127.0.0.1:4322`.
- `npm run check:ui-preview` checks and builds the isolated Astro root, starts `astro preview`, waits for an HTTP
  response, verifies isolation and local font delivery, then stops the server in `finally`.
- `npm run capture:ui-preview` builds the preview and uses `CHROME_BIN` or `/usr/bin/google-chrome` to capture the
  evidence matrix below. The command fails when Chrome, the server, or an expected image is unavailable.

Both preview lifecycle commands own port `4322`; stop `dev:ui` before running them.

### Evidence matrix

Screenshots are written to `context/changes/unify-dashboard-design-system/evidence/phase-1/`.

| File                        | Query          | Viewport   | Required evidence                                      |
| --------------------------- | -------------- | ---------- | ------------------------------------------------------ |
| `preview-light-desktop.png` | `?theme=light` | 1440 × 900 | Card, status/error Alert, Button variants, Polish text |
| `preview-light-mobile.png`  | `?theme=light` | 390 × 844  | Responsive flow and readable component states          |
| `preview-dark-desktop.png`  | `?theme=dark`  | 1440 × 900 | Dark semantic tokens on all three primitives           |
| `preview-dark-mobile.png`   | `?theme=dark`  | 390 × 844  | Dark responsive flow and disabled/loading controls     |

The displayed phrase “Zażółć gęślą jaźń” covers Polish diacritics. Inspect the browser Network panel with the Font
filter and confirm that font resources come from `127.0.0.1`; the build check also rejects references to
`fonts.googleapis.com` and `fonts.gstatic.com`.

### Font provenance

The preview uses two local Montserrat v31 variable WOFF2 subsets from the official Google Fonts CSS response fetched
for modern Chrome on 2026-10-12. Their URLs, unicode ranges, and SHA-256 checksums are recorded in
`src/styles/fonts.css`. `src/assets/fonts/OFL.txt` comes from the upstream Montserrat repository at commit
`cc8daf2e7085006b9c112542fc82b58afc13521d`.

### Manual acceptance

Accepted by the user on 2026-10-12 after reviewing all four Phase 1 screenshots. Card, Alert, and Button render
clearly at both viewports, Polish diacritics use Montserrat, and the mobile layout does not overflow. The automated
preview isolation check found no external Google Fonts URLs. Keyboard and focus-state evaluation remains part of the
later token and seven-state phases; Phase 1 does not change the existing Button interaction contract.

## Phase 2 token preview

The cagops values are applied through semantic roles in `src/styles/global.css`. The raw `theme-source.json` snapshot
remains unchanged. Automated contrast checks cover the text/background, hover, and focus-ring pairs documented in
`theme-contract.md`.

### Evidence matrix

Screenshots are stored separately from the Phase 1 baseline in
`context/changes/unify-dashboard-design-system/evidence/phase-2/`.

| File                        | Query          | Viewport   | Required evidence                                                |
| --------------------------- | -------------- | ---------- | ---------------------------------------------------------------- |
| `preview-light-desktop.png` | `?theme=light` | 1440 × 900 | Cagops palette, semantic-role matrix, surface shadow, focus ring |
| `preview-light-mobile.png`  | `?theme=light` | 390 × 844  | Responsive flow without horizontal overflow                      |
| `preview-dark-desktop.png`  | `?theme=dark`  | 1440 × 900 | Dark role pairs, corrected ring, readable destructive Alert      |
| `preview-dark-mobile.png`   | `?theme=dark`  | 390 × 844  | Dark responsive flow and readable feedback                       |

Visual inspection found the generated destructive Alert too weak on the dark card surface. Its variant now uses the
tested `destructive` / `destructive-foreground` pair; the screenshots above contain the corrected result.

### Manual acceptance

Accepted by the user on 2026-10-12 after reviewing all four Phase 2 screenshots and the requested regression
surfaces. The cagops palette, Montserrat, surface shadow, focus treatment, and responsive flow are readable in both
variants. The home, sign-in, sign-up, email-confirmation, global Banner, product-import, and diagnostic-import
surfaces show no accepted readability or shared-Button regression; they remain outside redesign scope.

## Phase 3 dashboard preview

The production route and the isolated preview render the same `DashboardView`. The preview supplies a long synthetic
email and deterministic import feedback; it does not fetch production data. Query parameters choose the previewed
state without changing the component contract:

- `?view=dashboard&import=available` shows the import link and a confirmed outcome.
- `?view=dashboard&import=unavailable` hides both the import link and feedback.

### Evidence matrix

Screenshots are stored in `context/changes/unify-dashboard-design-system/evidence/phase-3/`.

| File                                        | Query                                | Viewport   | Required evidence                                   |
| ------------------------------------------- | ------------------------------------ | ---------- | --------------------------------------------------- |
| `dashboard-preview-available-desktop.png`   | `?view=dashboard&import=available`   | 1440 × 900 | Polish copy, long email, confirmed feedback and CTA |
| `dashboard-preview-available-mobile.png`    | `?view=dashboard&import=available`   | 390 × 844  | Wrapped identity and responsive controls            |
| `dashboard-preview-unavailable-desktop.png` | `?view=dashboard&import=unavailable` | 1440 × 900 | Neutral placeholder without import controls         |
| `dashboard-preview-unavailable-mobile.png`  | `?view=dashboard&import=unavailable` | 390 × 844  | Mobile placeholder without horizontal overflow      |

### Manual acceptance

Accepted by the user on 2026-10-12 after reviewing both import-availability variants at both required viewports and
the shared focus behavior. The screenshots show Polish copy, a neutral placeholder, a wrapped long email, and no
horizontal overflow. A static scan of `dashboard.astro`, `DashboardView.astro`, `ImportOutcomeFeedback.tsx`, and
`ImportOutcomeBanner.tsx` found no local palette colours, CSS colour functions, or arbitrary dimensions. The
authenticated smoke suite passed all 27 steps against the local Astro and Supabase services, including Polish
dashboard copy, native POST sign-out, account isolation, and the existing English home navigation contract.

## Phase 4 final state matrix

The final isolated evidence is written to `context/changes/unify-dashboard-design-system/screenshots/`. It uses only
synthetic content. The four `preview-*` filenames remain stable from Phase 1; `states-*` isolates controls and the
three feedback outcomes, while `matrix-*` keeps all seven state labels visible in the 390 × 844 mobile viewport.

### Evidence matrix

| Files                                       | Query                             | Viewports             | Required evidence                                                                     |
| ------------------------------------------- | --------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `preview-{light,dark}-{desktop,mobile}.png` | `?theme=<variant>`                | 1440 × 900, 390 × 844 | Shared surfaces, semantic roles and representative controls                           |
| `states-{light,dark}-{desktop,mobile}.png`  | `?theme=<variant>&capture=states` | 1440 × 900, 390 × 844 | Default, hover reference, focus, disabled, loading, confirmed and neutral unavailable |
| `matrix-{light,dark}-{desktop,mobile}.png`  | `?theme=<variant>&capture=matrix` | 1440 × 900, 390 × 844 | Seven-state inventory and the rationale text on desktop                               |
| `dashboard-light-{desktop,mobile}.png`      | authenticated `/dashboard`        | 1440 × 900, 390 × 844 | Real light dashboard with a synthetic local account                                   |

The two dashboard files were captured from the real authenticated route with a synthetic local account after the
local Supabase stack completed its one-time image download. The capture removed only Astro's developer toolbar before
writing each image; no fixture route or auth bypass was added.

### State decisions

| State         | Evidence and disposition                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| default       | Shared `DashboardView` appears in the Phase 3 dashboard evidence with CTA on/off and a long synthetic email.                                 |
| hover         | Pointer movement reached both production controls and activated `:hover`; semantic hover contrast is measured by `ui-theme.test.mjs`.        |
| focus-visible | The fixture shows the full opaque ring; browser Tab traversal focused `Wyloguj się` with the shared ring rendered through box shadow.        |
| disabled      | A native disabled Button is present. Product navigation is N/A because the capability-gated link is omitted instead of disabled.             |
| error         | A destructive Alert demonstrates the shared component contract. Import confirmation has no product error state; `unavailable` stays neutral. |
| empty         | The placeholder is a neutral S-04 preview. Real collection emptiness is N/A until S-04 adds a collection query.                              |
| loading       | Pending feedback reserves the same `min-h-24` as settled feedback; its spinner stops under reduced motion.                                   |
| confirmed     | Trusted counts use the existing owner-scoped helper and the calm status Alert.                                                               |
| unavailable   | Exact neutral copy is “Nie udało się potwierdzić wyniku importu.” and does not claim that import failed.                                     |

The light and dark role pairs, hover roles and focus ring are measured by `scripts/ui-theme.test.mjs`. Visual review of
the generated images is still required; screenshot generation alone does not complete the manual acceptance gate.

### Interaction and regression checklist

- A valid UUID enters pending and settles to confirmed or unavailable. The component clears its previous outcome,
  associates rendered state with the current ID, and aborts the previous request during cleanup.
- A missing or invalid ID renders no feedback. The existing helper validation remains unchanged and prevents fetch
  for invalid IDs; URL cleanup remains in the effect.
- A controlled authenticated browser run covered delayed success, null, invalid and missing IDs, plus replacement of
  an in-flight request. The stale response never became visible, the settled unavailable state stayed neutral and the
  helper's number validation was unchanged.
- Home, email confirmation, global Banner, account forms, product import and diagnostic import retain the Phase 2
  regression assessment. Final user acceptance and `/10x-impl-review unify-dashboard-design-system` are complete.
- The scoped guard checks only the cleaned dashboard, shared dashboard view and import feedback files. Token sources,
  base UI primitives and legacy views are intentionally excluded.

### Final manual acceptance

Accepted by the user on 2026-10-12 after reviewing the real authenticated dashboard, light and dark state fixtures,
and the complete mobile state matrices. The browser interaction run and the accepted evidence cover the shared focus
ring, responsive layout and neutral meaning of unavailable feedback. After implementation review, the Card and Alert
surface contract and the shared Button ring offset were corrected; the preview screenshots were regenerated and
accepted by the user on 2026-10-12. The review also verified the strengthened preview-isolation and arbitrary-property
guards with controlled failures. No Phase 4 visual or review item remains open.
