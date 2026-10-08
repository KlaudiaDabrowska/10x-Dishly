<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Validate PDF Processing

- **Plan**: context/changes/validate-pdf-processing/plan.md
- **Scope**: Full plan (Phase 6 in depth; phases 1–5 spot-checked, Phase 5 previously reviewed in impl-review-phase-5.md)
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Success criteria re-run at review time on main (270a729; the deployed code tree is identical to 37f690e):
- `test:pdf` 104/104
- `test:pdf:db` 22/22
- `test:pdf:migration` PASS (18 functions, 11 tables, …)
- lint, astro check 0/0/0 and build pass
- `check:deploy production` passes
- `test:deployment` 12/12 and `test:deploy-config` 8/8 pass
- `pdf:report` ok=true; the evaluate/acceptance self-tests and `pdf:fixtures` pass

Manual 6.3 is marked deferred and 6.4 accepted-risk per the 2026-10-08 amendment, both backed by the recorded evidence.

## Findings

### F1 — Rejection evidence is not bound to target, commit or a trusted budget snapshot

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/pdf-benchmark-report.mjs:390-400, :449-455, :611-626, :654-662
- **Detail**: `record-rejection --budget-before` accepts any JSON file. The `budget` snapshot has no kind, version, target or time. Rejection records store no `target`, and the report never checks their `commit` against the cells. A stale, local or hand-made snapshot could therefore "prove" zero spend. Matrix cells already require `target === "remote"`. The 2026-10-08 rejections were genuine, recorded by the user against production.
- **Fix**: Stamp budget snapshots with `kind`, `version`, `target` and `recordedAt`. In `record-rejection`, validate the snapshot kind, require the same target and set a maximum age. Store `target` in rejection records. In the report, require remote rejections with the same commit as the cells.
  - Strength: Closes the only unauthenticated input in the zero-cost proof, using the same pattern already applied to cells.
  - Tradeoff: The two existing rejection records lack `target`. They would need re-recording (free, about 2 minutes) or a documented grandfathering.
  - Confidence: HIGH — the gap was read directly in the code by both reviewers.
  - Blind spot: None significant.
- **Decision**: SKIPPED

### F2 — Run-record parser passes free-form fields into "non-content" cell files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/pdf-benchmark-report.mjs:98-161
- **Detail**: `client.userAgentData` is copied verbatim. `recordedAt`, `stage`, `error` and `outcome.status` are passed through `String()` without a length or pattern check. `source.byteLength` and `pageCount` are not type-checked. A hand-edited run record could carry arbitrary text into `local/benchmark/cells`.
- **Fix**: Rebuild `userAgentData` from known fields only, with length caps. Check `stage` and `error` against `^[a-z][a-z0-9-]{0,99}$`. Require safe integers for byteLength and pageCount.
- **Decision**: SKIPPED

### F3 — manual-tests.md still describes the eight-cell procedure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/validate-pdf-processing/manual-tests.md:32, :37, :136; evaluation.md:523
- **Detail**: Only line 5 carries the 2026-10-08 amendment. Line 136 says `pdf:report` passes only when "all eight cells exist". Line 37 asks for eight accounts. Line 32 sizes the preflight at 16 reservations (USD 2.359), and the actual remaining capacity of USD 2.336 is already below that. evaluation.md:523 still lists "migrations 2026-09-30…2026-10-07" in the older offline handoff.
- **Fix**: Update those lines to the two required desktop Chrome cells (deferred cells optional but must pass) and four-call headroom, and add a historical note at evaluation.md:523.
- **Decision**: SKIPPED

### F4 — 6.2 evidence cites the pre-consolidation SHA and omits preview/auth-smoke checks

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 6.2 (— 2bd26b9); evaluation.md:578
- **Detail**: 6.2 requires the checks for the evaluated commit (37f690e). The recorded SHA is 2bd26b9, from before migration consolidation. The consolidation section records PDF, DB, lint, Astro, build, check:deploy production and deploy-config, but not `test:deployment`, `check:deploy preview` or the auth smoke for that tree. This review re-ran `test:deployment` (12/12) and check:deploy production on an identical code tree. GitHub CI on the 37f690e merge passed the `validate` and `smoke` jobs.
- **Fix**: Add a short evidence note to evaluation.md citing the CI run on 37f690e (validate and smoke) and this review's gate re-run. Run `check:deploy -- preview` and record it.
- **Decision**: SKIPPED

### F5 — Migration history in other environments after consolidation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261008120000_pdf_processing.sql
- **Detail**: Production and the local evaluation DB both show only 20261008120000; production was confirmed via `migration list --linked`. Any other copy still holding the nine old version rows would block `db push`, for example a DB restored from the pre-repair backup in local/db-backup/ or another machine. It fails safely, but the repair procedure is not documented for reuse, and future migrations must be dated after 20261008120000.
- **Fix**: Document the `migration repair --status reverted <nine versions>` and `--status applied 20261008120000` steps, and the dating rule, in evaluation.md's consolidation section.
- **Decision**: SKIPPED

### F6 — Equivalence script lacks interrupt cleanup and commit-argument validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/pdf-migration-equivalence.mjs:54-73, :169-196, :218-255
- **Detail**: Unlike `pdf-processing-db-runner.mjs:86-93`, the script has no SIGINT/SIGTERM handler. Ctrl-C during `supabase start` leaves `pdf-mig-eq-*` containers and workdirs behind. A `prepareProject` failure after `mkdirSync` leaves a directory behind. `--old-commit` is passed to git unvalidated, so a value beginning with `-` would be read as an option. The primary project is never at risk.
- **Fix**: Copy the runner's interrupt/child-tracking pattern, clean up a partial workdir, and require `^[0-9a-f]{7,40}$` for `--old-commit`.
- **Decision**: SKIPPED

### F7 — Carried-over USD 0.147456 hold can never be released

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261008120000_pdf_processing.sql:725-800; evaluation.md:530, final handoff
- **Detail**: The carried hold (the 4.18 provider timeout) has no reservation row, so no RPC can reconcile or release it. It permanently reduces F-01 headroom unless hand-written SQL is run on production. The earlier open item is not repeated in the final handoff.
- **Fix A ⭐ Recommended**: Accept it and record it in the final handoff as a permanent, fail-closed hold. Reconcile it only from OpenAI billing evidence in a later change.
  - Strength: No new privileged code path; consistent with "unknown outcomes stay held".
  - Tradeoff: USD 0.147 of F-01 capacity stays locked.
  - Confidence: HIGH — the amount is small and the F-01 measurements are finished.
  - Blind spot: S-02 will introduce its own budget scopes; F-01 headroom may not matter after that.
- **Fix B**: Add a service-role-only, digest-bound "resolve carried hold" RPC (move the hold to spent or release it, with an audit row).
  - Strength: Fully auditable resolution inside the ledger.
  - Tradeoff: A new accounting RPC, a migration and DB tests for a USD 0.15 item.
  - Confidence: MEDIUM.
  - Blind spot: Needs trusted billing evidence either way.
- **Decision**: FIXED (Fix A) — accepted as a permanent fail-closed hold; documented in evaluation.md final handoff

### F8 — Tooling does not prove the measured Worker/project identity

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/pdf-benchmark-report.mjs:61-73, :535-546
- **Detail**: The `commit` is supplied by the operator and the config digest is computed from the local checkout. "Remote" means any HTTPS `PDF_TARGET_SUPABASE_URL`. The carry-over check makes a wrong target unlikely but does not prove the deployed Worker's project. Account and import IDs and the network conditions are kept only in the ignored local files. Acceptable for an operator-run benchmark.
- **Fix**: Record the limitation in evaluation.md, plus the Worker version (a1167ab6) and project ref already known. Optionally list the import IDs (non-content) in the committed record.
- **Decision**: SKIPPED

### F9 — Carry-over RPC minor gaps

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261008120000_pdf_processing.sql:725-800; scripts/pdf-carry-over-f01.mjs:116-138
- **Detail**: The RPC does not require `p_source_limit_nano_usd` to equal the scope limit; the CLI checks this. The evidence file is written only after a successful apply, but the record can be recovered through `get_pdf_budget_carryover`. Locking, one-time application and the grants are correct. The carry-over has already been applied once in production.
- **Fix**: No action; document. Any change would need a new migration for an RPC that has already run its single use.
- **Decision**: SKIPPED

### F10 — Object URL revoked immediately after the download click

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/pdf-processing/PdfValidationPanel.tsx:280-294
- **Detail**: `URL.revokeObjectURL` runs at `setTimeout(0)`, which can cancel downloads on some WebKit/iOS versions. Desktop Chrome worked. Relevant when the deferred phone cells are run.
- **Fix**: Delay the revoke by about 10 s (common practice), or defer it until the phone verification.
- **Decision**: SKIPPED
