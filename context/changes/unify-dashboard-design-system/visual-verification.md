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
