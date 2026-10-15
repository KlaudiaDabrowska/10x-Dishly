# S-03 visual verification

## Scope

The isolated UI preview renders the incomplete-recipe decision cards without authentication, Supabase, source PDF
text, or model calls. Its neutral view model lives in `tools/ui-preview`; the reachable preview graph does not import
`src/lib/pdf-processing`.

Evidence is written to `context/changes/resolve-incomplete-recipes/screenshots/`. The capture command passes an
explicit change slug and decision fixture set, so the archived S-08 evidence remains untouched.

## State and viewport matrix

| State                        | Fixture                    | Desktop                    | Mobile                        | Light | Dark | Review status     |
| ---------------------------- | -------------------------- | -------------------------- | ----------------------------- | ----- | ---- | ----------------- |
| Default pending              | `decision=default`         | 1440 × 900                 | 390 × 844                     | yes   | yes  | Passed            |
| Hover                        | `decision=hover`           | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Focus-visible                | `decision=focus`           | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Disabled/loading keep        | `decision=keeping`         | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Disabled/loading discard     | `decision=discarding`      | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Kept                         | `decision=kept`            | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Discarded                    | `decision=discarded`       | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Error/retry                  | `decision=error`           | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed            |
| Empty title/category/content | `decision=missing-content` | covered by desktop states  | 390 × 844                     | yes   | yes  | Passed            |
| Mixed outcome summary        | `decision=mixed`           | covered by semantic review | 390 × 844                     | yes   | yes  | Passed            |
| Discard-all summary          | `decision=discard-all`     | covered by semantic review | 390 × 844                     | yes   | yes  | Passed            |

## Commands and evidence

- `npm run check:ui-preview` — passed on 2026-10-15 after explicit approval for port 4322. Source isolation covered 14
  reachable files; Astro reported zero errors, warnings, or hints. The initial sandbox attempt could not bind the
  approved port (`EPERM`); the authorized retry passed.
- `npm run capture:ui-preview` — passed on 2026-10-15 after explicit approval for port 4322 and wrote 26 named PNGs
  to the S-03 evidence directory. The script stopped its preview process; a subsequent `lsof` check found no listener
  on port 4322.
- Screenshot review — passed for hierarchy, missing-field wording, clipping, both themes, 390 px mobile reflow, and
  distinct pending/loading/resolved/error states. The empty-content, mixed-outcome, and discard-all states remain
  readable without horizontal overflow.
- Focus and keyboard evidence — the named focus capture shows a visible semantic ring, the stable action DOM preserves
  the focused control when a card resolves, and the keep/discard controls retain their logical DOM order and accessible
  names. The user accepted the keyboard/focus/reflow and wording gate on 2026-10-15.

No Supabase, smoke, database, migration-equivalence, or application-port process is part of this preview contract.
