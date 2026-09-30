# Validate PDF Processing Implementation Plan

## Approved provider amendment — 2026-09-30

The user approved OpenAI API with gpt-5.4-mini. [provider-decision.md](provider-decision.md) is the current account, request, accounting and retention contract; it supersedes earlier Gemini-specific foundation/research clauses. This is an explicit user-approved plan amendment, not implementation drift.

## Overview

F-01 will establish whether Dishly can read the accepted ebooks locally, recognize recipes through the authenticated backend and OpenAI, validate them, and persist complete recipes correctly within five minutes. It delivers a restricted feasibility screen, reusable processing modules and an evidence report; S-02 still owns the normal product import experience.

Planning decisions and the six-phase structure were approved in this conversation on 2026-09-30. Implementation, measurements, account access and model availability have not been demonstrated by writing this plan.

## Current State Analysis

The application has Astro/React on Cloudflare Workers and cookie-based Supabase authentication. The dashboard is an empty collection shell. The PDF-named R2/Queue path transports a diagnostic marker; it does not parse documents, call AI or save recipes. There are no application migrations, recipe persistence or shared budget reservations in the inspected working tree.

Research and the user-approved provider amendment settled PDF.js, local original PDFs, OpenAI API Paid with `gpt-5.4-mini`, USD 5 total for F-01, then USD 10/month application-wide and USD 0.50/import. Accepted provider retention is separate from application cleanup. Do not repeat provider selection or require another 50-recipe ebook.

The three accepted inputs are summer and pasta for full import, plus the 113-page low-glycemic-index ebook for limit rejection and local layout analysis. Existing recipe counts and Poppler timings are preliminary observations, not checked expected results or browser/end-to-end measurements.

## Desired End State

An allowlisted signed-in evaluator can select a local PDF on the feasibility screen, observe reading/recognition/saving, and obtain confirmed saved, already-existing and incomplete counts. Summer yields four cards with three labelled ingredient groups each and shared preparation; pasta matches its independently checked reference set, including quantities, units, serving information and footnotes. Complete failure writes no recipes.

Repeated requests and later selection of the identical file by the same account do not duplicate saved recipes or overwrite corrections. Another account cannot see the import, text or recipes. A report compares real persisted content with user-approved references and records cost, stage timings, actual-host CPU and desktop/mobile results.

F-01 passes only when the final benchmark matrix passes and total F-01 AI usage, including uncertain charges, fits USD 5. Missing access, failed quality checks or missing manual evidence leave feasibility unproven; writing a failure report does not complete the successful F-01 gate or unlock S-02.

### Key Discoveries:

- `src/middleware.ts:4`, `:27`: session lookup exists, but new APIs must explicitly reject an absent user.
- `src/lib/supabase.ts:6`: preview deliberately disables Supabase. Preserve this isolation; PR previews cannot supply real-save evidence.
- `scripts/check-deploy-config.mjs:6`, `:11`: deployment checks enforce exact secrets/bindings and no CPU override. Extend the contract deliberately.
- `.github/workflows/ci.yml:59`: CI already runs local Supabase; use it for real database concurrency and ownership tests.
- `package.json:7` and `scripts/deployment-probe.test.mjs:1`: Node tests, Miniflare and build/config checks are reusable. A queue mock cannot prove PostgreSQL atomicity.
- `supabase/config.toml:53`: migrations are enabled but absent; the configured seed file is also absent. Remote schema state was not inspected.
- Authenticated OpenAI model metadata lookup returned HTTP 200 for gpt-5.4-mini; generation and billing operation remain untested until ledger-backed smoke.

## What We're NOT Doing

- S-02's finished dashboard import flow; S-03's keep/discard UI; S-04–S-07 browsing, filtering, editing and deletion.
- Original-PDF upload, ebook storage, OCR, background continuation after closing the tab, or rebuilding the diagnostic queue.
- Raising 20 MB / 100 pages, importing the complete 113-page ebook, or adding a separate 50-recipe fixture.
- Changing the provider/model, accepting a higher budget, upgrading hosting, or claiming zero provider retention.
- Automatic content merging across different PDFs, deduplication by mutable title, category editing, calorie calculations or portion conversion.
- Committing the user's PDFs or full copyrighted reference recipes into the repository. Keep source-derived content in ignored local evaluation files; commit schemas, synthetic examples and aggregate evidence.
- Claiming the UI can detect every omission. Correctness is established by source comparison in evaluation.

## Implementation Approach

Reuse the existing Worker and Supabase project. Add browser-only PDF.js reading, a restricted experiment route, bounded backend requests, a transactional budget ledger, validated extraction results and a minimal private recipe table. Use sequential batches controlled by the open browser tab; the existing queue is not part of this flow.

The database retains import metadata, immutable batch input/result digests, accounting and saved recipes. Raw source text and unsaved candidate content remain in request/browser memory. After validating a model result, the backend records its canonical payload digest before returning the candidate payload. Finalization recomputes each digest and compares it with the server-owned batch record, then saves only validated complete candidates. This prevents client modifications without persisting temporary recipe text on the server.

Five approved decisions:

- Include minimal real persistence and the complete five-minute measurement in F-01.
- Source category wins; second breakfast maps to breakfast; AI chooses one permitted category only when the source has no explicit category.
- Codex prepares the golden results from source pages; the user checks them before live ebook extraction.
- Desktop and emulation checks are agent-run; the user runs Chrome and Firefox on a real phone during F-01.
- A later import of the identical PDF skips already saved source recipes and preserves their edits.

Use a small versioned contract in `src/lib/pdf-processing/contracts.ts`:

- Source: client-computed SHA-256 of PDF bytes, original filename, page count and stable page/text-item identifiers. These are untrusted metadata, not proof that the backend received a PDF.
- Page text: 1-based page position, dimensions, text items and layout coordinates; preserve column separation and item order.
- Candidate: source start item and page references, title, labelled ingredient groups, ordered instructions, optional serving/footnote text, category and missing-field reasons.
- Stable recipe identity: account + file fingerprint + canonical source-start item. The identity never depends on editable recipe text.
- Status: created → processing → ready → committed, with failed/cancelled terminal alternatives; accounting uncertainty is tracked separately.
- Counts: newly saved, already saved and pending are distinct; only a committed database result may increase the saved count.

Initial bounded execution settings belong in one server-owned limits module: decimal 20,000,000 PDF bytes in the browser, 100 pages, 512 KiB per text-batch HTTP body, 2 MiB cumulative canonical input and 2 MiB finalization body, 32,768 counted input tokens per model call, one candidate, 8,192 total maximum output tokens (including any non-visible tokens), with reasoning.effort=none. Reserve the output limit once; reasoning usage is a subset, not an additional budget. Never silently truncate text to fit a bound; split at source-item boundaries or reject explicitly. Backend payload limits are independent resource limits, not a claim that browser-supplied file size is trusted.

Batch construction uses up to eight core pages and the immediately preceding/following page as context, split further for byte/token limits; at most 32 batches per import. Ownership of a candidate follows its source-start item in a core range. Context-only candidates are not saved twice. Identical source anchors with conflicting content are an explicit validation failure, not an arbitrary winner. A continuation outside supplied context must be flagged incomplete rather than invented.

## Critical Implementation Details

### Reservation and dispatch ordering

A durable atomic reservation and dispatch claim must succeed before each paid call. A crash after claiming dispatch may have incurred a provider charge; do not release its reservation on elapsed time or retry it under the same attempt ID. Confirmed usage may reduce the reservation; unknown outcomes remain conservatively charged/held pending trusted reconciliation.

### Finalization and cancellation

No recipe writes occur until all required batches have validated results and the finalization transaction succeeds. Finalize and cancel lock the same import row: cancellation before commit prevents all writes; cancellation after commit returns the already committed outcome. A lost finalization response is resolved by status lookup, not another model call.

### Environment isolation

Live experiments require verified authentication, an evaluator allowlist and a server-side enable switch defaulting off. Preview remains incapable of real database/model access. Local measurements do not establish Cloudflare CPU suitability; actual-host evidence is required in Phase 6.

## Phase 1: Reference Results and Experiment Prerequisites

### Overview

Define the checkable expected results and execution prerequisites before relying on model output.

### Changes Required:

#### 1. Evaluation manifest and source review

**Files**: `context/changes/validate-pdf-processing/fixtures.md`, `evaluation/validate-pdf-processing/manifest.json`, `evaluation/validate-pdf-processing/reference.schema.json`, `.gitignore`, `scripts/pdf-fixtures.mjs`.

**Intent**: Prepare an independent golden set, with a review surface the user can inspect without reading raw JSON.

**Contract**: Record filename, byte hash, page count, source-page/item anchors, expected recipe/category/group structure and field-level comparison rules. Put full local PDFs, expected content and review renderings under ignored `evaluation/validate-pdf-processing/local/`; synthetic fixtures may be committed. Summer uses pages 7, 9, 11, 13 with three labelled variants per dish; verify the observed five pasta recipes on pages 4, 6, 8, 9, 11. Differences from those observations must be resolved against source pages before approval. The 113-page file is rejected by the product reader; local layout inspection does not make it an accepted import.

#### 2. Execution contract and prerequisite record

**Files**: `context/changes/validate-pdf-processing/evaluation.md`, `src/lib/pdf-processing/contracts.ts`, `src/lib/pdf-processing/limits.ts`, `package.json`.

**Intent**: Make model access, verified pricing, test environments and measurement definitions explicit.

**Contract**: Add `pdf:fixtures` to validate the local manifest/references and `test:pdf` for offline contract tests. Record account/model availability, Paid billing, model-specific Responses API support, token bounds and current rates without exposing secrets. Discovery/listing may precede Phase 3; any billable smoke request waits for the tested ledger. If the accepted model is unavailable, stop the live branch and obtain a new provider/model decision; never silently substitute. Credential entry uses ignored files/provider secret management, not chat.

### Success Criteria:

#### Automated Verification:

- `npm run pdf:fixtures` verifies the three local file hashes/page counts, reference schemas and source anchors; missing local files produce an explicit prerequisite failure.
- `npm run test:pdf` passes synthetic contract cases for categories, labelled variants, page numbering and decimal file-size boundaries.

#### Manual Verification:

- The user checks and approves the summer and pasta golden results, including every ingredient quantity/unit, variant, instruction and source page; approval and reference hashes are recorded.
- The prerequisite record identifies the accepted model's actual account availability, Paid billing status and planned desktop/phone environments; unavailable prerequisites are recorded as blocking live execution.

**Implementation Note**: User approval of golden results is a gate for live ebook extraction. Offline implementation can proceed while that review is pending.

## Phase 2: Local PDF Reading and Layout Preservation

### Overview

Read selectable-text PDFs in the browser without uploading originals or flattening recipe columns.

### Changes Required:

#### 1. Reader and deterministic page representation

**Files**: `src/lib/pdf-processing/browser-reader.ts`, `src/lib/pdf-processing/batching.ts`, `package.json`, `package-lock.json`.

**Intent**: Add a pinned PDF.js distribution and matching worker asset with bounded memory use and reliable provenance.

**Contract**: Browser-only imports; same-origin worker from the same installed package; hash bytes before transferable buffers are detached. Check byte size before loading and page count before sending text. Read pages sequentially, preserve text positions, orientation, widths and line boundaries, and assign stable item IDs. Keep photo/empty pages valid when other pages contain readable text; reject unreadable/scanned-only input without OCR. Loading errors and unsupported encrypted input produce explicit errors. Release page resources, worker, buffers and object URLs on completion/error/cancel.

#### 2. Offline reader evidence

**Files**: `scripts/pdf-reader.test.mjs`, `evaluation/validate-pdf-processing/synthetic/`, `context/changes/validate-pdf-processing/evaluation.md`.

**Intent**: Test hard boundaries and layout preservation independently of AI.

**Contract**: Cover two/three columns, rotated text, empty/photo pages, source-page positions, spanning recipes and deterministic batch overlap. Record real ebook reader output locally; do not commit full text. Local analysis of selected pages from the 113-page book uses a separate developer inspection mode, never the product acceptance path.

### Success Criteria:

#### Automated Verification:

- `npm run test:pdf` covers size/page limits, empty versus unreadable documents, deterministic provenance, bounded batches and cancellation cleanup.
- `npx --no-install astro sync && npx --no-install astro check` and `npm run build` pass with PDF.js confined to the browser and its matching worker emitted.

#### Manual Verification:

- Visual comparison against summer and pasta source pages confirms intact columns, variant labels, serving notes and 1-based pages; selecting the 113-page file fails before any provider call.

## Phase 3: Durable Spending Controls

### Overview

Protect the accepted monetary limits across concurrent Worker requests and failures.

### Changes Required:

#### 1. Transactional import and budget metadata

**Files**: `supabase/migrations/<timestamp>_pdf_processing_ledger.sql`, `src/lib/pdf-processing/budget.ts`, `src/lib/pdf-processing/import-state.ts`.

**Intent**: Introduce shared import/batch identity and maximum-cost reservations using the existing PostgreSQL database.

**Contract**: Store owner, file fingerprint, immutable manifest/input digests, batch bounds/status, output digest, expiry, attempt ID, reserved/actual integer cost units, usage counts and pricing snapshot. No raw source text, unsaved recipe content or credentials. Budgets use integer nano-USD with conservative upward rounding: USD 5 global F-01 scope; USD 0.50 per import; a tested USD 10 calendar-month UTC scope for the later application mode. F-01 remains cumulative across deployments and months. Late usage is reconciled to the originally reserved period.

RPCs lock applicable scope rows in stable order, check spent + held + new maximum, reserve and uniquely claim an attempt in one transaction. Concurrent duplicates cannot dispatch twice. Release only reservations proven not dispatched; reconcile each usage report once. Dispatched unknown outcomes never expire into free capacity. No network call occurs while database locks are held. Import work leases/expiry may close abandoned work without erasing reservations.

#### 2. Trusted backend access

**Files**: `src/lib/supabase-admin.ts`, `astro.config.mjs`, `.env.example`, `scripts/pdf-processing-db.test.mjs`, `package.json`, `.github/workflows/ci.yml`.

**Intent**: Separate accounting authority from the cookie-bound user client and verify it with a real local database.

**Contract**: A server-only privileged Supabase credential invokes narrowly granted RPCs; never inherit user cookies into that client. Revoke table mutations and accounting RPC execution from PUBLIC, anon and authenticated; explicitly grant only the backend role. Prefer invoker functions; any definer function has fixed search_path and schema-qualified names. Session identity is checked before privileged work. Add `test:pdf:db` and local-only CI credentials; no live OpenAI key or billable tests in CI. Fix the absent seed reference narrowly if it blocks local setup.

### Success Criteria:

#### Automated Verification:

- `npm run test:pdf:db` applies migrations locally and proves atomic near-limit admission across independent concurrent requests, all budget scopes, rounding, UTC rollover, duplicate reservations and exactly-once reconciliation.
- `npm run test:pdf:db` proves anon/authenticated clients cannot reserve or reconcile spending, a second owner cannot access import metadata, and timeout/crash/cancel never release possibly charged usage.
- `npm run test:pdf` passes fail-closed database/provider-dispatch tests, including a crash between dispatch claim and network response.

## Phase 4: OpenAI Recognition and Result Validation

### Overview

Add bounded model calls and distinguish structural validity, detected incompleteness and source accuracy.

### Changes Required:

#### 1. Fixed model adapter

**Files**: `src/lib/pdf-processing/openai.ts`, `src/lib/pdf-processing/prompt.ts`, `src/lib/pdf-processing/validation.ts`, `scripts/pdf-processing.test.mjs`.

**Intent**: Use a small fetch-based REST adapter on Workers, keeping model syntax and billing separate from product logic.

**Contract**: Pin POST /v1/responses with model gpt-5.4-mini, store=false, background=false, reasoning.effort=none and strict text.format JSON Schema. Follow [provider-decision.md](provider-decision.md) for counting, request fields, response validation and pricing. Verify compatibility in a bounded ledger-backed synthetic smoke. Count the full input/instructions/schema before reservation; stop if counting is unavailable. Enforce 32,768 input and 8,192 total output tokens. Reconcile input_tokens/output_tokens; reasoning_tokens is already included in output_tokens. Pricing/accounting incompatibility fails closed. Reserve the full conservative maximum even when a timeout prevents usage reporting.

Use a 60-second provider deadline and 270-second total processing deadline, leaving time for commit/status verification within 300 seconds. No automatic paid retry. A transport/429/5xx/truncation/blocked response ends the attempt explicitly; a deliberate retry requires a new reservation within the same import cap and remaining time, or reselecting the PDF after failure. Never repair truncated JSON into a successful result. Test `MAX_TOKENS`, missing candidates/usage, malformed fields and oversized responses. Provider errors are sanitized.

#### 2. Deterministic validation and evaluation

**Files**: `src/lib/pdf-processing/categories.ts`, `src/lib/pdf-processing/reconcile.ts`, `scripts/pdf-evaluate.mjs`, `package.json`.

**Intent**: Preserve the source and make omissions, inventions and duplicates visible in the evaluation report.

**Contract**: Validate field types/lengths, supplied page/item references, exactly one allowed category and labelled ingredient groups. Source categories map deterministically: breakfast/second breakfast → breakfast, lunch → lunch, dinner → dinner, dessert → dessert, including sweet/savory variants. An explicitly labelled sweet dinner stays dinner; AI inference applies only with no source category. Conflicting source classification is flagged for evaluation rather than silently overwritten.

Missing title, ingredients, instructions, category or required source metadata means incomplete; never invent it to pass schema checks. Invalid provenance or schema is an invalid result, not a candidate eligible for automatic saving. Filename and owner come from validated import/session context, never the model. Reconcile overlapping source anchors and flag content conflicts. Persist a digest of the exact canonical validated payload with its owner/import/batch/schema version before returning it to the browser.

Add `pdf:evaluate`: compare against the approved local golden set, allowing whitespace/line-wrap normalization only; report missing/invented/duplicate recipes, wrong quantities/units, lost variants/steps/notes and wrong categories/pages separately. Semantic equivalence outside normalization requires explicit source review, not an AI judge alone.

### Success Criteria:

#### Automated Verification:

- `npm run test:pdf` passes adapter contract, usage accounting, malformed/truncated/blocked responses, source validation, category precedence, overlap reconciliation and prompt-injection-as-source-data cases.
- `npm run pdf:evaluate -- --self-test` detects planted omissions, quantity/unit changes, merged variants, invented dishes, duplicate anchors and incorrect source pages.
- A ledger-backed synthetic provider smoke records the exact accepted model/API, schema support, bounded usage and reconciled cost without raw prompt/response logs.

#### Manual Verification:

- With golden results approved, summer and pasta extraction are compared with source pages; every discrepancy is documented and resolved before claiming a passing extraction configuration.

## Phase 5: Real Persistence and the Feasibility Screen

### Overview

Complete the restricted browser → backend → AI → validation → confirmed-save experiment.

### Changes Required:

#### 1. Private recipe persistence and atomic finalization

**Files**: `supabase/migrations/<timestamp>_pdf_processing_recipes.sql`, `src/lib/pdf-processing/persistence.ts`, `scripts/pdf-processing-db.test.mjs`.

**Intent**: Persist real recipes and make retries safe while preserving saved corrections.

**Contract**: Minimal reusable `recipes` table: immutable owner/source identity, source filename/pages, title, labelled ingredient groups, instructions, category, serving/footnote content and timestamps. Owner-only reads use RLS. F-01 inserts are backend-controlled; no direct browser mutation grant or production edit/delete endpoints are introduced.

Finalize checks the authenticated owner, import state/expiry, every expected batch and each canonical payload digest against server-owned records. Reject altered, missing or replayed cross-import payloads. Save complete candidates and record the terminal outcome in one transaction; incomplete candidates remain outside the collection. A complete extraction failure writes none. Do not upsert mutable recipe content: a unique owner + file fingerprint + source-start key skips existing rows and preserves edits. The identical file under a renamed filename still deduplicates; another owner receives an independent collection.

The transaction returns saved/existing/pending counts and committed IDs; verify owner-scoped read-back. A status endpoint recovers this outcome after lost responses. Conflicting simultaneous finalize/cancel operations serialize on the import record. Existing rows retained from an earlier successful import are never deleted by a later failed attempt.

#### 2. Restricted screen and authenticated APIs

**Files**: `src/pages/dashboard/pdf-validation.astro`, `src/components/pdf-processing/PdfValidationPanel.tsx`, `src/pages/api/pdf-validation/imports/index.ts`, `src/pages/api/pdf-validation/imports/[id]/batch.ts`, `src/pages/api/pdf-validation/imports/[id]/finalize.ts`, `src/pages/api/pdf-validation/imports/[id]/index.ts`.

**Intent**: Expose a small evaluator flow using existing authentication and reusable processing code.

**Contract**: Create, batch, finalize, status and cancel actions validate session/ownership, evaluator allowlist, same-origin mutation requests, schema and streamed body-size bounds. Recompute input digests server-side; manifest core ranges must partition all supplied source pages/items exactly once. Browser metadata does not authorize spending. Limit each evaluator to one active import; allow different evaluators to test global budget concurrency. All private responses are no-store.

Show reading, recognition and saving, then confirmed saved/existing/pending counts. Show incomplete content and missing-field warnings for evaluation, without providing the S-03 keep/discard workflow or claiming all recipes were found. Complete recipes require no user approval. Include the accepted OpenAI text-transfer and provider-retention explanation from provider-decision.md. Start timing before hashing/reading; stop only after commit read-back. All controls remain usable on mobile.

Use memory only for original bytes/text/unsaved candidates; no localStorage, IndexedDB, raw-content logs or server cache. Release PDF/text after recognition and candidate data after terminal display is dismissed, failed or cancelled. Pending evaluation content remains only while its result view is open. Close-tab cleanup is best effort; submitted provider calls can still incur cost. Backend expiry prevents abandoned imports being finalized and retains only non-content accounting metadata.

#### 3. Environment and deployment contract

**Files**: `astro.config.mjs`, `wrangler.jsonc`, `.env.example`, `scripts/check-deploy-config.mjs`, `scripts/deploy-config.test.mjs`, `scripts/check-preview.mjs`.

**Intent**: Configure the experiment explicitly without weakening existing diagnostic/preview guarantees.

**Contract**: Add server-only OpenAI and privileged database credentials, evaluator IDs and enable switch; missing configuration disables the experiment. Keep production secrets/config guards and generated checks synchronized. Preview remains without model/database credentials and returns experiment-unavailable. Preserve queue/R2 diagnostic behavior and the no-CPU-override guard. Prepare publication through the existing reviewed manual deployment workflow; no hosting upgrade or deployment follows merely from this plan.

### Success Criteria:

#### Automated Verification:

- `npm run test:pdf:db` proves all-or-nothing finalization, two-account isolation, altered-payload rejection, request replay safety, concurrent finalize/cancel ordering and recovery after a lost commit response.
- `npm run test:pdf:db` proves importing identical bytes again, including a renamed file, skips existing recipes and preserves test-edited content; another account remains independent.
- `npm run lint`, `npx --no-install astro check`, `npm run test:pdf`, `npm run test:deployment` and `npm run test:deploy-config` pass.
- Production and preview builds pass their existing `check:deploy` checks; preview remains isolated and the local Worker/Supabase auth smoke passes.

#### Manual Verification:

- On the feasibility screen, complete results save automatically and read back correctly; incomplete results remain unsaved with warnings, complete failure saves nothing, and cancellation/retry reports confirmed outcomes honestly.

## Phase 6: Measurements and F-01 Verdict

### Overview

Produce reproducible quality, cost and full-path performance evidence on the actual hosting and agreed devices.

### Changes Required:

#### 1. Benchmark reporting and operating procedure

**Files**: `scripts/pdf-benchmark-report.mjs`, `context/changes/validate-pdf-processing/evaluation.md`, `context/changes/validate-pdf-processing/manual-tests.md`, `package.json`.

**Intent**: Record a bounded final evaluation matrix and separate measurements from assumptions.

**Contract**: Add `pdf:report` to aggregate non-content records and reject missing acceptance cells. Final matrix: summer and pasta × current Chrome/Firefox × desktop/real phone, one clean final run per cell (eight imports). Each run starts without those saved source keys for its test account so deduplication cannot masquerade as import speed. Use dedicated disposable evaluation accounts or narrowly scoped test-data cleanup; never delete ordinary recipes. Record account/run IDs, approved fixture/config hashes, browser/device/OS, build/model/API, network conditions, stage times, committed counts, field-level comparison totals, tokens/cost and remaining budget.

Measure maximum elapsed time, not only the mean: every accepted run must be <=300 seconds, with all expected complete recipes correct and persisted. Rejected 113-page and oversized synthetic files must spend zero AI tokens. Desktop/mobile emulation aids development but cannot fill real-phone cells. The user performs the phone Chrome/Firefox steps and checks source content; the agent provides instructions and incorporates actual results.

Capture backend CPU and invocation outcomes for the new path on the actual Cloudflare deployment, not only wall time or the existing diagnostic. Record browser responsiveness and available memory measurements; mark unsupported numeric memory instrumentation unavailable, not zero. No crashes or persistent unresponsiveness are acceptable. Failure on Workers Free leaves the gate failed and requires a separate hosting decision; do not raise CPU limits silently.

Run live work only with tested reservations, approved golden fixtures and sufficient remaining F-01 budget. Include synthetic/live smoke and tuning costs in the same USD 5 total. The report distinguishes confirmed spend from held unknown charges; exhaustion stops new calls.

#### 2. Handoff

**Files**: `context/changes/validate-pdf-processing/evaluation.md`, `context/changes/validate-pdf-processing/manual-tests.md`.

**Intent**: Give S-02 evidence and reusable contracts without claiming the full product is implemented.

**Contract**: Record pass/fail/not-run per acceptance item, all failures and the exact passing configuration; list reuse points and remaining S-02/S-03 product integration. Disable evaluator access after experiments as appropriate while retaining saved recipes/accounting. A no-go report preserves findings and pending checks; it does not mark F-01 done. Lifecycle completion follows verified implementation/review/archive, not a documentation-only status flip.

### Success Criteria:

#### Automated Verification:

- `npm run pdf:report` validates all eight final matrix cells, fixture/config identity, persisted-content comparison totals, <=300-second per-run elapsed time and F-01 usage including uncertain reservations within USD 5.
- All offline PDF, local database, existing auth/deployment and build/config checks pass for the evaluated commit; negative limit tests produce zero provider dispatches.

#### Manual Verification:

- The user completes Chrome and Firefox tests on a real phone for both accepted ebooks, checks variants/content and confirms responsive operation; device/browser details and results are recorded.
- Actual Cloudflare CPU/outcomes and desktop browser evidence support the selected hosting configuration; logs and network inspection confirm no original PDF upload, raw-content logging or credential exposure.
- The final evaluation records a supported F-01 verdict and an S-02 handoff; every required manual result is actual evidence rather than an assumed pass.

## Testing Strategy

### Unit Tests:

Use Node 24's existing test pattern with injected provider/database boundaries. Synthetic fixtures cover layout, exact size/page boundaries, variants, category precedence, deterministic identity, incomplete versus invalid output, truncation, token accounting and evaluation mutations. Provider calls are mocked in ordinary tests.

### Integration Tests:

Use the existing local Supabase + built Worker CI approach. Exercise actual database transactions with independent connections/requests; direct anon/authenticated RPC attempts; two owners; near-budget concurrency; stale attempts; input/result tampering; cancellation/finalization races; read-back after commit and repeated identical PDFs preserving edits. Test explicit failures at reservation, dispatch, usage reconciliation and commit boundaries.

### Manual Testing Steps:

1. Review the independent local golden set against visible PDF pages and record approved hashes.
2. Verify reader output and column/variant preservation before live ebook calls.
3. Run ledger-backed model smoke, then tune extraction against the approved golden set within the same budget.
4. Run the final eight-cell matrix on a fixed configuration with clean test collections; compare persisted fields against the sources.
5. Exercise incomplete and failed results, cancellation, lost responses, repeat import, a second account and 113-page rejection.
6. Inspect actual-host CPU, browser/network behavior and the evidence report; user-run phone results are mandatory.

Offline phases without manual gates can proceed after their automated checks. Pause dependent live evaluation for golden approval, missing credentials/model access or missing user phone evidence. Do not mark manual Progress rows from emulation or synthetic results.

## Performance Considerations

The five-minute window includes local fingerprinting/reading, all provider and database/network time, validation, finalization and owner read-back. File selection and human keep/discard decisions are excluded; F-01 does not implement those decisions. A timeout is a failed run, not evidence of meeting the bound.

Stream and cap HTTP bodies, bound response parsing, read pages sequentially and keep provider calls outside database transactions. Use per-stage timings and actual CPU to identify the next bottleneck before changing batching or hosting. The initial batch/token settings are measured configuration, not a promise that every possible 100-page document succeeds. Any changed setting must retain caps and rerun affected quality and final benchmark cells.

## Migration Notes

Introduce additive ledger/import metadata and minimal recipes migrations. Inspect the actual target schema before applying remote migrations; absent repository migrations do not prove an empty remote database. Test local initialization without destructive remote resets. Privileged secrets remain server-only and preview stays isolated.

Rollback disables the experiment and stops new reservations; retain saved recipes, incurred usage and uncertain charges. Do not drop ledger tables, reset the F-01 counter, or delete saved recipes to roll back code. Model unavailable, pricing/accounting incompatible, insufficient budget or hosting failure stops dependent live work and yields an explicit no-go/prerequisite result; none authorizes an automatic provider or plan upgrade.

## References

- Baseline: [research.md](research.md).
- Product: [PRD](../../foundation/prd.md), [roadmap](../../foundation/roadmap.md), [accepted PDF requirements](../../deployment/pdf-processing-requirements.md).
- Source layouts: [PDF import review](../../foundation/pdf-import-review.md); historical proposals there are superseded by the PRD and five planning decisions.
- Runtime: `src/middleware.ts:4`, `src/lib/supabase.ts:6`, `astro.config.mjs:19`, `scripts/check-deploy-config.mjs:6`.
- Verification: `package.json:7`, `scripts/deployment-probe.test.mjs:1`, `.github/workflows/ci.yml:59`, `supabase/config.toml:53`.
- [PDF.js display API](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js), [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): scoped Context7 documentation consulted during planning.
- [OpenAI provider amendment and official sources](provider-decision.md): account evidence, API contract, current pricing, token accounting and retention.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Reference Results and Experiment Prerequisites

#### Automated

- [x] 1.1 `npm run pdf:fixtures` verifies the three local file hashes/page counts, reference schemas and source anchors; missing local files produce an explicit prerequisite failure.
- [x] 1.2 `npm run test:pdf` passes synthetic contract cases for categories, labelled variants, page numbering and decimal file-size boundaries.

#### Manual

- [x] 1.3 The user checks and approves the summer and pasta golden results, including every ingredient quantity/unit, variant, instruction and source page; approval and reference hashes are recorded.
- [x] 1.4 The prerequisite record identifies the accepted model's actual account availability, Paid billing status and planned desktop/phone environments; unavailable prerequisites are recorded as blocking live execution.

### Phase 2: Local PDF Reading and Layout Preservation

#### Automated

- [x] 2.1 `npm run test:pdf` covers size/page limits, empty versus unreadable documents, deterministic provenance, bounded batches and cancellation cleanup.
- [x] 2.2 `npx --no-install astro sync && npx --no-install astro check` and `npm run build` pass with PDF.js confined to the browser and its matching worker emitted.

#### Manual

- [x] 2.3 Visual comparison against summer and pasta source pages confirms intact columns, variant labels, serving notes and 1-based pages; selecting the 113-page file fails before any provider call.

### Phase 3: Durable Spending Controls

#### Automated

- [ ] 3.1 `npm run test:pdf:db` applies migrations locally and proves atomic near-limit admission across independent concurrent requests, all budget scopes, rounding, UTC rollover, duplicate reservations and exactly-once reconciliation.
- [ ] 3.2 `npm run test:pdf:db` proves anon/authenticated clients cannot reserve or reconcile spending, a second owner cannot access import metadata, and timeout/crash/cancel never release possibly charged usage.
- [ ] 3.3 `npm run test:pdf` passes fail-closed database/provider-dispatch tests, including a crash between dispatch claim and network response.

### Phase 4: OpenAI Recognition and Result Validation

#### Automated

- [ ] 4.1 `npm run test:pdf` passes adapter contract, usage accounting, malformed/truncated/blocked responses, source validation, category precedence, overlap reconciliation and prompt-injection-as-source-data cases.
- [ ] 4.2 `npm run pdf:evaluate -- --self-test` detects planted omissions, quantity/unit changes, merged variants, invented dishes, duplicate anchors and incorrect source pages.
- [ ] 4.3 A ledger-backed synthetic provider smoke records the exact accepted model/API, schema support, bounded usage and reconciled cost without raw prompt/response logs.

#### Manual

- [ ] 4.4 With golden results approved, summer and pasta extraction are compared with source pages; every discrepancy is documented and resolved before claiming a passing extraction configuration.

### Phase 5: Real Persistence and the Feasibility Screen

#### Automated

- [ ] 5.1 `npm run test:pdf:db` proves all-or-nothing finalization, two-account isolation, altered-payload rejection, request replay safety, concurrent finalize/cancel ordering and recovery after a lost commit response.
- [ ] 5.2 `npm run test:pdf:db` proves importing identical bytes again, including a renamed file, skips existing recipes and preserves test-edited content; another account remains independent.
- [ ] 5.3 `npm run lint`, `npx --no-install astro check`, `npm run test:pdf`, `npm run test:deployment` and `npm run test:deploy-config` pass.
- [ ] 5.4 Production and preview builds pass their existing `check:deploy` checks; preview remains isolated and the local Worker/Supabase auth smoke passes.

#### Manual

- [ ] 5.5 On the feasibility screen, complete results save automatically and read back correctly; incomplete results remain unsaved with warnings, complete failure saves nothing, and cancellation/retry reports confirmed outcomes honestly.

### Phase 6: Measurements and F-01 Verdict

#### Automated

- [ ] 6.1 `npm run pdf:report` validates all eight final matrix cells, fixture/config identity, persisted-content comparison totals, <=300-second per-run elapsed time and F-01 usage including uncertain reservations within USD 5.
- [ ] 6.2 All offline PDF, local database, existing auth/deployment and build/config checks pass for the evaluated commit; negative limit tests produce zero provider dispatches.

#### Manual

- [ ] 6.3 The user completes Chrome and Firefox tests on a real phone for both accepted ebooks, checks variants/content and confirms responsive operation; device/browser details and results are recorded.
- [ ] 6.4 Actual Cloudflare CPU/outcomes and desktop browser evidence support the selected hosting configuration; logs and network inspection confirm no original PDF upload, raw-content logging or credential exposure.
- [ ] 6.5 The final evaluation records a supported F-01 verdict and an S-02 handoff; every required manual result is actual evidence rather than an assumed pass.
