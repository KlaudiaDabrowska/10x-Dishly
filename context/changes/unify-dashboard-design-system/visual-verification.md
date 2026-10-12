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
