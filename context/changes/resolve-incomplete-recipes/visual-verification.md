# S-03 visual verification

## Scope

The isolated UI preview renders the incomplete-recipe decision cards without authentication, Supabase, source PDF
text, or model calls. Its neutral view model lives in `tools/ui-preview`; the reachable preview graph does not import
`src/lib/pdf-processing`.

Evidence is written to `context/changes/resolve-incomplete-recipes/screenshots/`. The capture command passes an
explicit change slug and decision fixture set, so the archived S-08 evidence remains untouched.

## State and viewport matrix

| State                        | Fixture                    | Desktop                    | Mobile                        | Light | Dark | Review status |
| ---------------------------- | -------------------------- | -------------------------- | ----------------------------- | ----- | ---- | ------------- |
| Default pending              | `decision=default`         | 1440 × 900                 | 390 × 844                     | yes   | yes  | Passed        |
| Hover                        | `decision=hover`           | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Focus-visible                | `decision=focus`           | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Disabled/loading keep        | `decision=keeping`         | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Disabled/loading discard     | `decision=discarding`      | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Kept                         | `decision=kept`            | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Discarded                    | `decision=discarded`       | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Error/retry                  | `decision=error`           | 1440 × 900                 | covered by responsive default | yes   | yes  | Passed        |
| Empty title/category/content | `decision=missing-content` | covered by desktop states  | 390 × 844                     | yes   | yes  | Passed        |
| Mixed outcome summary        | `decision=mixed`           | covered by semantic review | 390 × 844                     | yes   | yes  | Passed        |
| Discard-all summary          | `decision=discard-all`     | covered by semantic review | 390 × 844                     | yes   | yes  | Passed        |

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

## Final verification record

- `npm run test:pdf` — passed on 2026-10-15: 128 tests passed, including F-01/evaluation and legacy finalization
  regressions.
- `npm run lint` — passed on 2026-10-15; the semantic UI contract covered seven scoped product files.
- `npx astro check` — passed on 2026-10-15 with zero errors and zero warnings. It reported 35 hints after the approved
  preview capture left generated files under the ignored `tools/ui-preview/dist` directory.
- `npm run build` — passed on 2026-10-15, including the Cloudflare server build and PDF reader inspection build. The
  sandbox could not write Wrangler's optional user-level debug log, but the build exited successfully.
- Static rollout and privacy review — passed on 2026-10-15. The migration-first, flag-disabled rollout and
  disable-creation-first rollback are documented. Decision persistence/status contains identity, omission codes,
  counters and digests only; pending candidate/source/provider content and credentials are absent from storage,
  status and operational logging.
- `npm run test:pdf:db` — passed on 2026-10-15 after explicit approval: 27 tests passed and the isolated project was
  removed. The first run exposed a test-fixture-only permission error when simulating an owner edit through the
  deliberately restricted service-role client; the fixture was corrected to use the suite's controlled SQL helper,
  and the complete rerun passed, including D1/R/D2 reimport and concurrent opposite decisions.
- `npm run test:pdf:migration` — passed on 2026-10-15 after explicit approval. Both isolated projects were removed;
  old-plus-forward and consolidated paths produced identical dumps, catalogs, and rows: 33 functions, 12 tables, one
  policy, 111 constraints, 20 indexes, six triggers, and 122 columns.
- `BASE_URL=http://127.0.0.1:4321 npm run smoke` — passed all 27 authenticated application/authentication steps on
  2026-10-15 after explicit approval. A separate temporary S-03 harness then passed authenticated keep-all,
  discard-all, mixed keep/discard, lost-response status recovery, repeated refresh/read-back, and non-disclosing
  another-owner GET/POST checks against the product API. It seeded only local content-free decision metadata and did
  not call the AI provider; the harness and its test users were removed afterward. The navigation-warning state is
  covered by the passing client controller suite and the reviewed unresolved-card preview, while the authenticated
  HTTP run proves the durable state recovered after navigation/response loss.
- Runtime cleanup — passed. The application listener on port 4321 and the local Supabase stack were stopped after
  verification; port 4322 was not needed for this final run, and subsequent `lsof` checks found no listener on either
  4321 or 4322.
