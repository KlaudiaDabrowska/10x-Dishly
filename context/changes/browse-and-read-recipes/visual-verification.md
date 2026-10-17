# S-04 visual verification

## Scope and evidence boundary

The isolated `recipes` profile in `tools/ui-preview` renders deterministic list, pagination, detail, 404, read-error,
and kept-incomplete fixtures without authentication, Supabase, PDF content, or application service calls. These
fixtures verify presentation states only. They do not prove that a real request is owner-scoped; RLS/database and
authenticated smoke coverage provide that separate evidence.

The S-04 capture profile accepts only `--change=browse-and-read-recipes` and writes PNG files only to
`context/changes/browse-and-read-recipes/evidence/`. Generating screenshots is not visual acceptance. A person must
review the named files and record acceptance separately before the visual gate can close.

## State and viewport matrix

| State                  | Fixture query                    | Desktop    | Mobile    | Evidence status | Manual acceptance |
| ---------------------- | -------------------------------- | ---------- | --------- | --------------- | ----------------- |
| Empty collection       | `view=recipes&recipe=empty`      | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Populated collection   | `view=recipes&recipe=populated`  | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Card hover             | `view=recipes&recipe=hover`      | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Card focus-visible     | `view=recipes&recipe=focus`      | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Pagination             | `view=recipes&recipe=pagination` | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Complete detail        | `view=recipes&recipe=detail`     | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Common 404             | `view=recipes&recipe=not-found`  | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Read error             | `view=recipes&recipe=error`      | 1440 × 900 | 390 × 844 | captured       | accepted          |
| Kept-incomplete detail | `view=recipes&recipe=incomplete` | 1440 × 900 | 390 × 844 | captured       | accepted          |

List and detail are server-rendered, so loading and disabled states are N/A. They do not expose a client-side pending
interaction or a control that can become disabled. The forced hover and focus-visible fixtures exist only to make the
shared semantic state treatment reviewable in static evidence.

## Keyboard and responsive checks

The manual review must confirm:

- logical focus order through sign-out, recipe links, pager links, back navigation, retry actions, and import CTA when
  it is enabled in the product shell;
- visible focus treatment and descriptive accessible names for every link and button;
- no horizontal overflow, clipped long title, clipped email, or mixed ingredient quantities at 390 × 844;
- distinct neutral missing-field notices versus the destructive read-error state;
- no regression in import feedback, sign-out, shell spacing, or responsive heading hierarchy.

The approved port-4322 check and capture completed on 2026-10-15, and the process was stopped. Automated inspection
confirmed the expected responsive layouts, distinct neutral/destructive states, and visible forced hover/focus
treatments in the captured fixtures. The user accepted the visual matrix and the shell, sign-out, responsive, and
focus-regression review on 2026-10-15.

## Commands run

- Isolated check: `npm run check:ui-preview`.
- S-04 capture: `node scripts/ui-preview.mjs isolation && npx --no-install astro build --root tools/ui-preview && node scripts/ui-preview.mjs capture --change=browse-and-read-recipes --set=recipes`.

Both commands were run after explicit approval because the check/capture runner uses port 4322. No Supabase,
application smoke, database test, or port-4321 process was part of this visual fixture profile.
