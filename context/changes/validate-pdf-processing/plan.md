# Validate PDF Processing Implementation Plan

## Approved provider amendment — 2026-09-30

The user approved OpenAI API with gpt-5.4-mini. [provider-decision.md](provider-decision.md) is the current account, request, accounting and retention contract; it supersedes earlier Gemini-specific foundation/research clauses. This is an explicit user-approved plan amendment, not implementation drift.

## Approved input-limit amendment — 2026-10-03

The user explicitly requested increasing the input cap to unblock summer. The new cap is 98,304 counted input tokens per call; the 8,192 output cap, USD 0.50/import and USD 5 F-01 budgets remain unchanged. Standard summer batches measured 60,886 and 80,950 tokens. The maximum reservation is now 110,592,000 nano-USD (USD 0.110592) per call. One bounded summer verification under this amended configuration is authorized; golden acceptance remains mandatory.

## Approved diagnostic-fixture amendment — 2026-10-04

The user authorized a bounded diagnostic attempt using a representative excerpt of `25.1. Dietetyka w pigułce - dieta 1500 kcal dietetyka_w_pigulce.pdf` in place of further paid attempts on low-gi and pasta. The 54-page, 4,902,790-byte source remains within the current browser file/page limits, but a complete import needs at least seven standard core-page batches and cannot fit the unchanged USD 0.50/import reservation. The two-page excerpt preserving source pages 29–30 has a separately prepared local golden, approved by the user on 2026-10-04, before any paid call. Its result is diagnostic evidence only: it cannot replace the required summer/pasta acceptance in 4.4/4.9, weaken golden equality, change the provider, or authorize a budget increase.

## Approved acceptance-fixture amendment — 2026-10-05

The user replaced pasta and low-gi with `lunchboxy`: pages 1–12 of `8. Klaudia MIx Fit - Lunchboxy.pdf` (pdfseparate/pdfunite, text identical to the source pages; 12 pages, 7,038,572 bytes, SHA-256 46d58ed5…7591; five recipes on pages 4, 6, 8, 10 and 12). Phase 4.4/4.9 acceptance is now **summer + lunchboxy**; wherever this plan says "pasta" as an acceptance fixture, read lunchboxy. Golden equality, provider, budgets and the no-retry rule are unchanged. The user approved the lunchboxy golden on 2026-10-05.

Lunchboxy states no meal type. Its golden records `category: null` with `sourceCategory: null`; the evaluator then requires one allowed AI-inferred category instead of an exact value (the category inference already permitted by the plan). Every other field, including sourceCategory, is compared exactly. The dietetyka excerpt was found to be cropped (CropBox hides the upper recipes from PDF.js) and is retired as diagnostic evidence.

## Approved deterministic-normalization amendment — 2026-10-05

The user approved deterministic, source-derived post-processing of validated model candidates, applied once inside runtime validation (shared by evaluation and the future backend) before the canonical digest. It never reads golden data, fixture IDs or titles, never invents content and records every applied change as a validation warning:

- A single ingredient group whose label is only an ingredient-section heading ("Składniki", "Składniki do przygotowania N porcji", "Ingredients", optional colon) gets label null. Multi-group variant labels are untouched.
- An instruction entry whose source start is an unnumbered, unbulleted line that directly continues the previous entry's last source line (same page, the line above with overlapping columns, ordinary line spacing) is merged into that entry with one space. Numbered/bulleted steps and entries that cannot be located in the source are left unchanged.
- When sourceText starts with the extracted metric quantity+unit and the model's name is a prefix of the remainder, name becomes that remainder verbatim, minus only a trailing household-measure parenthetical (containing a digit or a measure word). Descriptive parentheses are kept.

Offline gates come first: unit tests, and applying the normalization to the approved goldens must change nothing. Re-validating saved raw responses without provider calls shows the effect. Then one bounded summer + lunchboxy attempt, with no automatic retry.

## Approved acceptance-contract amendment — 2026-10-05

Based on [frame.md](frame.md) (second frame, HIGH confidence after repeat-run verification), the user approved replacing exact golden equality as the Phase 4 acceptance gate. This supersedes "zero golden discrepancies" (Phase 4 overview), "zero field differences" (§6) and "Do not weaken … multi-group label validation" (§5) wherever they conflict. Goldens stay unchanged and approved.

- **Blocking tier:** all golden recipes are present, retained and complete. No invented or duplicate recipe. Each recipe's ingredient entries match the golden one-to-one: no added, missing or altered entry. Exact metric quantity/unit wherever the golden has one.
- **Reported tier (non-blocking):** every other field difference (labels, names, sourceText form, instruction boundaries, notes, servings, category, sourceCategory, pages). It is still computed by `pdf:evaluate` and recorded.
- **Summer variants:** one complete variant is sufficient. A recipe passes when its ingredients match any single golden variant, or each returned group matches a distinct golden variant. This also changes PRD US-01 (line 67), roadmap S-02 and `fixtures.md`, updated in §7.
- **Repeatability:** 4.9 requires the blocking tier to pass in **3 of 3** ledger-backed runs per ebook (summer, lunchboxy) on one frozen configuration.
- **Model escalation:** `gpt-5.4-mini` with `reasoning.effort=low` and `max_output_tokens` 16,384 (reservation USD 0.147456/call, USD 0.294912 for a two-batch summer import, within USD 0.50/import). A failure stops for a separate user decision on `gpt-5.4`, which is not part of this amendment.

## Approved pacing, 429 accounting and line-join amendment — 2026-10-05

Measurement 4.13 failed on infrastructure (two summer calls were rejected with HTTP 429 rate limits) and on one recurring line-join defect. The user approved:

- **Pacing and one bounded retry on 429 only.** This supersedes "no automatic paid retry" solely for an HTTP 429 response. That response is a pre-processing rejection, which OpenAI documents as unbilled. Wait for `retry-after`/`retry-after-ms`, or 20 s when absent, capped at 30 s and the remaining import deadline, then make one more attempt under a **new reservation**. A second 429 ends the import. Timeouts, transport errors, 5xx and malformed responses still never retry. The evaluation runner pauses 30 s between fixtures and between repeated runs.
- **Zero-cost reconciliation of 429.** A dispatched call that received an HTTP 429 response is reconciled with zero tokens and USD 0, under a dedicated usage-report kind, instead of remaining held. This also applies, by a one-time trusted reconciliation, to the two held reservations of runs 77ca3fb1/e7c581a0 (batch 1 of summer), with evidence recorded. Timeout and unknown outcomes stay held.
- **Continuation-line merge.** A deterministic, geometry-derived normalization joins an ingredient entry with no amount or bullet that is the next visual line, in the same column, directly below the preceding ingredient. Examples are "(dowolny smak)" and "wędzononego". The goldens must stay invariant.
- **Re-measurement:** the same 3 × (summer + lunchboxy) gate as 4.13, with the 4.13 failure retained as evidence.

## Approved heading-entry, unmapped-category and provider-deadline amendment — 2026-10-06

Measurement 4.18 (reasoning medium) separated the summer variants correctly but failed on representation and latency. The user approved:

- **Heading-only ingredient entry.** An entry with null quantity/unit whose sourceText (collapsed) is only a short heading ending in ":" (e.g. "sos:") is folded into the following entry of the same group: the heading is prefixed to that entry's sourceText unless already present. A trailing heading with no following entry is left unchanged. Warning `folded-heading-entry:<g>.<i>`.
- **Unmapped source category.** When the model's sourceCategory does not map to an allowed meal (e.g. "Posiłki"), it is treated as absent. sourceCategory becomes null (warning `unmapped-source-category`), and the model's allowed category is used, as the plan already allows when the source has no meal evidence. Mapped categories still override the model.
- **Provider deadline** 60 s → **120 s**. The 270 s import deadline and 300 s end-to-end bound are unchanged; reasoning stays medium.
- **Re-measurement** 3 × (summer + lunchboxy), same 3/3 gate.

## Approved F-01 budget amendment II — 2026-10-06

The user raised the cumulative F-01 budget again, from **USD 6 to USD 7** (7,000,000,000 nano-USD). Measurement 4.20 completed one passing run, but the preflight refused the remaining two by USD 0.268. Reasoning medium raised per-run usage, and USD 0.147456 stays held from the 4.18 timeout. All other limits, the maximum-reservation headroom rule and the reservation arithmetic are unchanged. Wherever this plan says USD 5 or USD 6 for F-01, read USD 7. The budget limit is part of the recorded configuration digest, so run 10798fa8 cannot share a frozen configuration with later runs. 4.20 is therefore measured with three new runs; 10798fa8 stays as supporting evidence. Three runs fit under USD 7 with the unchanged headroom rule.

## Approved F-01 budget amendment — 2026-10-06

The user raised the cumulative F-01 budget from **USD 5 to USD 6** (6,000,000,000 nano-USD). The preflight before measurement 4.18 refused the 3 × (summer + lunchboxy) run by USD 0.138 under maximum reservations while keeping the full final-matrix headroom. All historical spend and holds stay; the per-import (USD 0.50) and monthly (USD 10) limits, preflight headroom rule and reservation arithmetic are unchanged. Wherever this plan says "USD 5" for F-01, read USD 6. A new migration updates the existing `f01` scope limit and the default used when the scope is first created.

## Approved summer sub-list and reasoning-medium amendment — 2026-10-06

Re-measurement 4.16 passed lunchboxy 3/3 and failed summer 1/3. The user approved:

- **Sub-list groups.** A deterministic normalization applies when groups alternate between variant labels and a repeated sub-list heading label ending in ":" (e.g. `347 kcal`, `sos:`, `403 kcal`, `sos:`). Each sub-list group is appended to the preceding variant group, and its label is prefixed to the first appended entry's sourceText when the source line shows the heading only as a separate item. Validation then sees distinct labels. Golden invariance is required; unrelated duplicate labels stay invalid.
- **Scorer tolerance for dropped household text.** An actual ingredient entry also matches when its sourceText contains the golden name with the golden's trailing parenthetical removed. Quantity and unit must still match exactly where the golden has them. Ingredient membership and amounts stay blocking.
- **Reasoning medium.** `reasoning.effort=medium`; output cap, input cap, model, pricing and reservation (147,456,000 nano-USD/call) are unchanged.
- **Re-measurement** 3 × (summer + lunchboxy) under the same 3/3 gate, with offline re-scoring of saved runs reported first.

## Overview

F-01 will establish whether Dishly can read the accepted ebooks locally, recognize recipes through the authenticated backend and OpenAI, validate them, and persist complete recipes correctly within five minutes. It delivers a restricted feasibility screen, reusable processing modules and an evidence report; S-02 still owns the normal product import experience.

Planning decisions and the six-phase structure were approved on 2026-09-30. The Phase 4 repair amendment of 2026-10-03 follows [frame-2026-10-03.md](frame-2026-10-03.md) and the user's decisions: address both summer and pasta, use golden as the sole accuracy criterion, and base diagnosis on the three existing extraction runs. This amendment schedules repairs; it is not evidence that they pass.

## Current State Analysis

At initial planning, the application had Astro/React on Cloudflare Workers, Supabase authentication, an empty collection shell and a PDF-named R2/Queue diagnostic path. Phases 1–3 now have recorded verification: approved references, a local reader and durable budget controls. Phase 4 has an adapter, validator, evaluator and successful ledger-backed synthetic smoke, but extraction accuracy still fails. Recipe persistence and the feasibility screen remain Phase 5 work.

Research and the user-approved provider amendment settled PDF.js, local original PDFs, OpenAI API Paid with `gpt-5.4-mini`, USD 5 total for F-01, then USD 10/month application-wide and USD 0.50/import. Accepted provider retention is separate from application cleanup. Do not repeat provider selection or require another 50-recipe ebook.

The three accepted inputs are summer and pasta for full import, plus the 113-page low-glycemic-index ebook for limit rejection and local layout analysis. The approved goldens contain four summer recipes and five pasta recipes. Reader/smoke measurements do not establish full-path browser performance.

The reported observation is: “Modelowe wyniki nie są zgodne z zatwierdzonymi źródłami.” The reframed problem is: “The problem is an extraction-and-evaluation pipeline that discards available layout information and lacks sufficiently precise, reproducible failure evidence, while its retained results still fail the approved golden contract.”

The diagnosis in [frame-2026-10-03.md](frame-2026-10-03.md) establishes these boundaries:

| Finding | Evidence and implication |
| --- | --- |
| Layout disappears before inference | `prompt.ts:106–114` serializes anchor/text only although the reader and batches retain geometry. Its contribution to errors is unmeasured. |
| Summer losses include validation rejection | Latest output: five candidates, one retained and four invalid (one provenance, three group-label errors). Three golden recipes are missing from final output; unavailable rejected payloads prevent assigning their exact causes. All golden titles and variant labels occur in reader text. |
| Pasta has precise representation/content mismatches | All five final categories, page arrays, instructions, servings and footnotes match. All 67 names match; 67 quantity/unit pairs, five group labels, five sourceCategory values and 11 sourceText fields differ. Broad report buckets overstated the failures. |
| Evidence is incomplete | The runner overwrites previous files, drops rejected payloads and reports unconditional success. Only the latest detailed artifacts survive the three historical runs; earlier outputs cannot be reconstructed. |
| Golden remains authoritative | Golden self-comparison and projection into runtime shape pass. Neither a schema incompatibility nor model incapability has been established. Both fixtures and every compared field remain required. |

## Desired End State

An allowlisted signed-in evaluator can select a local PDF on the feasibility screen, observe reading/recognition/saving, and obtain confirmed saved, already-existing and incomplete counts. Summer yields four cards, each with at least one complete, correctly quantified variant (2026-10-05 amendment) and shared preparation; lunchboxy (replacing pasta) keeps all recipes with exact ingredients and amounts. Complete failure writes no recipes.

Repeated requests and later selection of the identical file by the same account do not duplicate saved recipes or overwrite corrections. Another account cannot see the import, text or recipes. A report compares real persisted content with user-approved references and records cost, stage timings, actual-host CPU and desktop/mobile results.

F-01 passes only when the final benchmark matrix passes and total F-01 AI usage, including uncertain charges, fits USD 5. Missing access, failed quality checks or missing manual evidence leave feasibility unproven; writing a failure report does not complete the successful F-01 gate or unlock S-02.

### Key Discoveries:

- `src/middleware.ts:4`, `:27`: session lookup exists, but new APIs must explicitly reject an absent user.
- `src/lib/supabase.ts:6`: preview deliberately disables Supabase. Preserve this isolation; PR previews cannot supply real-save evidence.
- `scripts/check-deploy-config.mjs:6`, `:11`: deployment checks enforce exact secrets/bindings and no CPU override. Extend the contract deliberately.
- `.github/workflows/ci.yml:59`: CI already runs local Supabase; use it for real database concurrency and ownership tests.
- `package.json:7` and `scripts/deployment-probe.test.mjs:1`: Node tests, Miniflare and build/config checks are reusable. A queue mock cannot prove PostgreSQL atomicity.
- `supabase/config.toml:53`: migrations are enabled but absent; the configured seed file is also absent. Remote schema state was not inspected.
- A ledger-backed synthetic OpenAI smoke passed; three ebook extraction runs did not establish golden accuracy. Synthetic schema/accounting success is separate from Phase 4.4 acceptance.

## What We're NOT Doing

- S-02's finished dashboard import flow; S-03's keep/discard UI; S-04–S-07 browsing, filtering, editing and deletion.
- Original-PDF upload, ebook storage, OCR, background continuation after closing the tab, or rebuilding the diagnostic queue.
- Raising 20 MB, importing the complete 113-page ebook as an acceptance fixture, or adding a separate 50-recipe fixture. (The page limit is 115 by user amendment of 2026-10-05.)
- Changing the provider/model, accepting a higher budget, upgrading hosting, or claiming zero provider retention.
- Automatic content merging across different PDFs, deduplication by mutable title, category editing, calorie calculations or portion conversion.
- Committing the user's PDFs or full copyrighted reference recipes into the repository. Keep source-derived content in ignored local evaluation files; commit schemas, synthetic examples and aggregate evidence.
- Claiming the UI can detect every omission. Correctness is established by source comparison in evaluation.
- Changing goldens to match output, accepting semantic similarity, dropping either ebook, or using expected recipes to repair runtime output. No additional ebooks or new paid diagnostic calls are part of this plan update.

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

Initial bounded execution settings belong in one server-owned limits module: decimal 20,000,000 PDF bytes in the browser, 115 pages (user amendment 2026-10-05; originally 100), 512 KiB per text-batch HTTP body, 2 MiB cumulative canonical input and 2 MiB finalization body, 98,304 counted input tokens per model call, one candidate, 8,192 total maximum output tokens (including any non-visible tokens), with reasoning.effort=none. Reserve the output limit once; reasoning usage is a subset, not an additional budget. Never silently truncate text to fit a bound; split at source-item boundaries or reject explicitly. Backend payload limits are independent resource limits, not a claim that browser-supplied file size is trusted.

Batch construction uses up to eight core pages and the immediately preceding/following page as context, split further for byte/token limits; at most 32 batches per import. The Phase 4 repair adds the first three document pages as explicitly marked document context through the same shared builder used by evaluation and the future browser flow; duplicate pages occur only once in a batch. All context participates in byte/token limits and input digests, and cannot grant recipe ownership. Ownership of a candidate follows its source-start item in a core range. Context-only candidates are not saved twice. Identical source anchors with conflicting content are an explicit validation failure, not an arbitrary winner. A continuation outside supplied context must be flagged incomplete rather than invented.

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

Add bounded model calls and distinguish structural validity, detected incompleteness and source accuracy. Resume with the repair sequence below. Existing 4.1–4.3 checkmarks record earlier verification; new 4.5–4.9 gates verify the repaired configuration. Phase 4.4 remains pending and requires zero golden discrepancies. Source review explains failures but cannot waive them.

### Changes Required:

#### 1. Fixed model adapter

**Files**: `src/lib/pdf-processing/openai.ts`, `src/lib/pdf-processing/prompt.ts`, `src/lib/pdf-processing/validation.ts`, `scripts/pdf-processing.test.mjs`.

**Intent**: Use a small fetch-based REST adapter on Workers, keeping model syntax and billing separate from product logic.

**Contract**: Pin POST /v1/responses with model gpt-5.4-mini, store=false, background=false, reasoning.effort=none and strict text.format JSON Schema. Follow [provider-decision.md](provider-decision.md) for counting, request fields, response validation and pricing. Verify compatibility in a bounded ledger-backed synthetic smoke. Count the full input/instructions/schema before reservation; stop if counting is unavailable. Enforce 98,304 input and 8,192 total output tokens. Reconcile input_tokens/output_tokens; reasoning_tokens is already included in output_tokens. Pricing/accounting incompatibility fails closed. Reserve the full conservative maximum even when a timeout prevents usage reporting.

Use a 60-second provider deadline and 270-second total processing deadline, leaving time for commit/status verification within 300 seconds. No automatic paid retry. A transport/429/5xx/truncation/blocked response ends the attempt explicitly; a deliberate retry requires a new reservation within the same import cap and remaining time, or reselecting the PDF after failure. Never repair truncated JSON into a successful result. Test `MAX_TOKENS`, missing candidates/usage, malformed fields and oversized responses. Provider errors are sanitized.

#### 2. Deterministic validation and evaluation

**Files**: `src/lib/pdf-processing/categories.ts`, `src/lib/pdf-processing/reconcile.ts`, `scripts/pdf-evaluate.mjs`, `package.json`.

**Intent**: Preserve the source and make omissions, inventions and duplicates visible in the evaluation report.

**Contract**: Validate field types/lengths, supplied page/item references, exactly one allowed category and labelled ingredient groups. Source categories map deterministically: breakfast/second breakfast → breakfast, lunch → lunch, dinner → dinner, dessert → dessert, including sweet/savory variants. An explicitly labelled sweet dinner stays dinner; AI inference applies only with no source category. Conflicting source classification is flagged for evaluation rather than silently overwritten.

Missing title, ingredients, instructions, category or required source metadata means incomplete; never invent it to pass schema checks. Invalid provenance or schema is an invalid result, not a candidate eligible for automatic saving. Filename and owner come from validated import/session context, never the model. Reconcile overlapping source anchors and flag content conflicts. Persist a digest of the exact canonical validated payload with its owner/import/batch/schema version before returning it to the browser.

Add `pdf:evaluate`: compare against the approved local golden set, allowing the existing whitespace/line-wrap normalization only. Golden is the sole accuracy criterion: semantic equivalence, source review and an AI judge cannot waive a mismatch. Structural/provenance validity and existing safety, cost and time gates remain independently required.

#### 3. Precise comparison and reproducible evidence — repair first

**Files**: `scripts/pdf-evaluate.mjs`, `scripts/pdf-extract-review.mjs`, `scripts/pdf-processing.test.mjs`, `package.json`, `context/changes/validate-pdf-processing/evaluation.md`.

**Intent**: Identify every failed field and candidate disposition before changing extraction. Preserve the latest historical files and record unavailable earlier artifacts honestly.

**Contract**: Keep missing/invented/duplicate checks and add field-level paths for title, group count/labels/order, ingredient count/order/name/quantity/unit/sourceText, instructions, servings, footnotes, canonical category, sourceCategory and pages. Existing aggregate buckets may remain for compatibility but derive from precise differences. Null versus text, array boundaries/order and every non-whitespace content change remain significant. Validate source-start ownership separately; do not relax it to obtain a pass. Test each planted field mutation independently, alongside unchanged and whitespace-only passing controls.

Create immutable run directories under ignored `evaluation/validate-pdf-processing/local/extraction-review/<run-id>/`; refuse overwrite. Before any paid effect, validate CLI arguments, approved manifest/PDF/reference hashes and reader source identity. No arguments selects both accepted fixtures; unknown names/options fail before import creation or dispatch. Record build or dirty-tree code fingerprint, model/API, prompt/schema/config hashes, input hashes, per-batch timings, usage/ledger IDs and candidate dispositions. Raw candidates, exact requests and detailed expected/actual diffs remain only in private local artifacts (files mode 0600); operational output contains IDs/counts/error codes only. Product/server retention rules stay unchanged.

Retain rejected candidates with batch/candidate identity, anchors, exact validation condition and field path. Distinguish nonexistent provenance, context ownership and invalid labels instead of storing one broad code. Save partial-run failure evidence and charged/held accounting if later batches fail. Provide offline replay of a saved run without provider access, account creation or ledger mutation. Top-level `ok` and exit status reflect both comparison and pipeline success: any required fixture/batch failure or golden mismatch returns nonzero. Diagnostics never edit expected or actual content to obtain success.

#### 4. Shared layout-preserving model input — repair second

**Files**: `src/lib/pdf-processing/prompt.ts`, `src/lib/pdf-processing/batching.ts`, `src/lib/pdf-processing/contracts.ts`, `scripts/pdf-extract-review.mjs`, `scripts/pdf-processing.test.mjs`, `scripts/pdf-reader.test.mjs`.

**Intent**: Carry the reader's existing evidence through to the provider and remove the runner's special input path.

**Contract**: Version the serialized input to include page dimensions and each item's stable anchor, text, transform, width, height, direction and line-ending flag. Preserve original item identity/order; geometry informs grouping without rewriting source text. A geometry-only change must alter the actual provider input and its digest. Use one shared builder for core/adjacent/document context, moving the runner-only first-three-pages addition into it. Mark context roles explicitly, excluding context-only recipe starts from owned results while allowing a source heading to classify recipes across batches.

Recompute canonical byte totals and full request token counts after all context is included. Enforce per-request and cumulative caps including repeated context, split core ranges deterministically where possible, and reject unsplittable input without truncation or dispatch. Tests exercise the payload passed to the adapter, not just the reader object. Use synthetic multi-column/cross-batch heading examples and existing local reader artifacts; golden recipe content never enters extraction input.

#### 5. Extraction representation and honest completeness — repair third

**Files**: `src/lib/pdf-processing/prompt.ts`, `src/lib/pdf-processing/validation.ts`, `src/lib/pdf-processing/contracts.ts`, `src/lib/pdf-processing/categories.ts`, `src/lib/pdf-processing/reconcile.ts`, `scripts/pdf-processing.test.mjs`.

**Intent**: Resolve contradictory instructions and ambiguous field conventions without hiding missing content or accepting incorrect values.

**Contract**: State general source-to-field rules with synthetic examples: quantity and unit are separate verbatim scalars when unambiguous; do not copy a combined measure into quantity. Preserve full ingredient wording in sourceText. If multiple/ambiguous measures cannot be faithfully represented by a single pair, retain sourceText and use null scalars instead of selecting or calculating a measure. Copy actual variant labels; an unlabelled single group has a null label. Preserve source paragraph/step boundaries, shared preparation, servings and footnotes without paraphrasing or duplication per variant. Copy sourceCategory from the applicable source heading verbatim and derive canonical category through the existing mapping. These rules derive from source structure, never fixture names, titles, hashes or golden values.

Exclude covers/TOCs/headings alone, but emit genuinely incomplete recipes with supplied evidence and reasons; remove the instruction to return only complete recipes. Introduce typed, versioned omission reasons distinguishing required content (including missing continuation/variant content) from absent optional servings/footnotes. Required omissions prevent `complete` even when arrays are nonempty; absent optional fields alone do not. Unknown/inconsistent reasons fail closed as incomplete/invalid, never silently ignored. Derive human-readable explanations from those reasons. Update schema, runtime validation and canonical digest/version together; incompatible prior results cannot be reused under the new contract. Structural status still cannot certify unseen omissions or golden accuracy.

Do not weaken provenance or multi-group label validation to retain summer candidates. Preserve rejects for diagnosis. Reconciliation remains deterministic and reports conflicts; no expected-content lookup, fuzzy acceptance or replacement with golden values is permitted.

#### 6. Offline gate, then one bounded acceptance attempt — repair last

**Files**: `scripts/pdf-extract-review.mjs`, `src/lib/pdf-processing/openai.ts`, `scripts/pdf-processing.test.mjs`, `scripts/pdf-processing-db.test.mjs`, `context/changes/validate-pdf-processing/evaluation.md`.

**Intent**: Verify the repaired path before spending, then obtain attributable evidence for both fixtures without an open-ended tuning loop.

**Contract**: Run new offline gates, existing evaluator tests, fixture validation, lint, Astro checks/build and affected database checks before paid evaluation. Mock a multi-batch import to prove the 270-second deadline starts once per import and is not reset per batch; each provider deadline is at most 60 seconds and bounded by remaining import time. Expiry prevents further dispatch while retaining actual/unknown charges.

Keep all real historical spend and reservations in the existing ledger. Do not reset counters, recreate accounting scopes or treat a new evaluator as fresh F-01 budget. Preflight remaining USD 5 global and USD 0.50/import capacity using current maximum reservations and account for the pending final matrix. Insufficient capacity stops live work; it does not permit higher limits. Reuse the accepted provider and tested reservation/dispatch path, with no automatic retry.

After offline checks pass, a deliberate acceptance attempt runs summer and pasta once each on the same frozen configuration, loading golden only for comparison after extraction. Require exactly four summer and five pasta retained complete recipes, zero field differences, missing/invented/duplicate recipes or unresolved invalid/incomplete/conflicting candidates. Preserve artifacts and report fixtures independently; overall success requires both. A failed attempt stops for evidence-based diagnosis, leaves 4.4/4.9 pending and cannot trigger automatic resampling or model fallback. This planning update itself makes no paid calls.

#### 7. Product-relevant acceptance and configuration — 2026-10-05 amendment

**Files**: `src/lib/pdf-processing/validation.ts`, `src/lib/pdf-processing/limits.ts`, `src/lib/pdf-processing/openai.ts`, `scripts/pdf-acceptance.mjs` (new), `scripts/pdf-acceptance.test.mjs` (new), `scripts/pdf-processing.test.mjs`, `scripts/pdf-extract-review.mjs`, `package.json`, `context/changes/validate-pdf-processing/provider-decision.md`, `context/changes/validate-pdf-processing/fixtures.md`, `context/foundation/prd.md`, `context/foundation/roadmap.md`, `context/changes/validate-pdf-processing/evaluation.md`.

**Intent**: Stop our own metadata gates from discarding recipes whose content is present. Measure the blocking/reported acceptance contract. Spend once on a higher-reasoning configuration measured 3+3.

**Contract — validation**: Code owns source metadata and verified field presence. A model omission reason contradicted by a present field (absent-servings/absent-footnotes with content; missing-title/ingredients/instructions/category with that content present) is dropped with a `dropped-contradictory-reason:<code>` warning instead of `invalid`. `missing-source-metadata` is dropped with a warning when `pages` and `sourceStart` passed provenance validation. A missing label in a multi-group result becomes a `unlabelled-variant-group` warning instead of `invalid`. Unknown codes, wrong field paths, schema errors and all provenance checks (supplied pages, anchors, context-only ownership) stay invalid. Synthetic tests cover each relaxed and each still-strict case. Applying the change to saved raw responses must not create a candidate from a context-only anchor.

**Contract — acceptance**: `npm run pdf:acceptance -- --run <run-dir> [--run …]` scores saved runs offline (no provider/ledger), using `report.json` actual/reconciliation and the pinned golden. An actual ingredient entry matches a golden entry when its sourceText (whitespace-collapsed, leading list bullet/dash removed, case-insensitive) contains the golden `name`, and quantity/unit equal the golden values where the golden has them. Matching is one-to-one: leftovers are added (actual) or missing (golden). For summer, the variant rule above applies. Output: per run and fixture, blocking PASS/FAIL with reasons, reported-tier counts from `evaluateRecipes`, and an overall verdict requiring 3/3 per fixture with an identical recorded config digest. `--self-test` plants each blocking failure (missing, invented, incomplete, added/missing/altered entry, wrong amount, mixed-variant summer recipe) and passes controls (one golden variant, all variants as distinct groups, form-only differences). Re-scoring the five saved lunchboxy runs must reproduce the frame verdicts: 8b771929 PASS, the others FAIL. This holds for the pre-change validation; the validation changes may legitimately turn eaa6c74b/5ea356b0 when revalidated. That before/after difference is recorded.

**Contract — configuration**: `PDF_LIMITS.reasoningEffort` becomes `low` and `maxOutputTokens` 16,384. The maximum reservation is recomputed (147,456,000 nano-USD) and tests are updated. Pricing, input cap, budgets and no-retry stay unchanged. Record the change and reservation arithmetic in `provider-decision.md`. The live measurement makes three invocations of `npm run pdf:extract-review` (summer + lunchboxy), sequentially, with no automatic retry. Each preflight must pass, including final-matrix headroom. Insufficient capacity stops the measurement. Score with `pdf:acceptance` and record runs, verdicts, reported-tier counts, tokens and cost in `evaluation.md`. On failure, stop and ask the user about `gpt-5.4`.

**Contract — documents**: Change the PRD US-01 summer clause, roadmap S-02 summer sentence, plan Desired End State and `fixtures.md` expected structure to: at least one complete, correctly quantified variant per summer recipe; never merge quantities across variants. Use the existing amendment-note style; goldens and their hashes stay unchanged.

Progress note (2026-10-06): 4.9, 4.13, 4.16 and 4.18 are checked as **superseded**. They measured earlier configurations and failed; 4.20 passed on the accepted configuration and replaces them. Their failure evidence remains in evaluation.md. Progress note: 4.4 and 4.9 keep their titles. From 2026-10-05 they are judged by this amendment's two-tier 3/3 contract (4.13) rather than exact golden equality.

Phase 4 supplies canonical digest generation and verifies that representation changes alter it. Phase 5 must wire durable owner/import/batch/schema-bound digest recording into the batch handler before returning any candidate to the browser; local JSON digests alone do not satisfy this handoff. Extraction-only success does not establish real-save or five-minute end-to-end feasibility.

### Success Criteria:

#### Automated Verification:

- `npm run test:pdf` passes adapter contract, usage accounting, malformed/truncated/blocked responses, source validation, category precedence, overlap reconciliation and prompt-injection-as-source-data cases.
- `npm run pdf:evaluate -- --self-test` detects planted omissions, quantity/unit changes, merged variants, invented dishes, duplicate anchors and incorrect source pages.
- A ledger-backed synthetic provider smoke records the exact accepted model/API, schema support, bounded usage and reconciled cost without raw prompt/response logs.
- `npm run pdf:evaluate -- --self-test` independently detects every compared field mutation and accepts only unchanged or whitespace-normalized controls; offline replay reports precise differences without provider calls.
- `npm run test:pdf` proves geometry reaches the adapter input, shared context preserves ownership, and post-context byte/token bounds reject oversize input without truncation or dispatch.
- `npm run test:pdf` proves separate quantity/unit and unlabelled-group conventions, required versus optional omission handling, strict provenance, deterministic reconciliation and version-bound canonical digests.
- Offline runner and database checks prove truthful exit status, immutable private run artifacts, hash/argument preflight, retained rejection/partial-failure evidence, one import deadline and preservation of historical spending; lint, Astro checks and build pass.
- One bounded ledger-backed attempt on the repaired fixed configuration passes exact golden comparison for all four summer and five pasta recipes, with no unresolved invalid/incomplete/conflicting candidates and complete run/accounting evidence.
- `npm run test:pdf` proves contradicted or provenance-verified omission reasons are dropped with warnings, an unlabelled group among several is a warning, and unknown reasons, schema and provenance failures stay invalid.
- `npm run pdf:acceptance -- --self-test` detects every planted blocking failure and passes the variant and form-only controls; re-scoring saved lunchboxy runs reproduces the frame verdicts.
- `npm run test:pdf` proves requests use `reasoning.effort=low` and `max_output_tokens` 16,384 and reservations use 147,456,000 nano-USD per call; lint, Astro check and build pass.
- Three ledger-backed summer + lunchboxy runs on one frozen configuration pass the blocking tier 3/3 per ebook in `pdf:acceptance`, with reported-tier counts, tokens and cost recorded.

#### Manual Verification:

- With golden results approved, summer and pasta extraction are compared with source pages; every discrepancy is documented and resolved before claiming a passing extraction configuration.
- The user reviews the reported-tier differences of the measured runs and the updated PRD, roadmap and fixtures variant wording, and accepts them.
- `npm run test:pdf` and `npm run test:pdf:db` prove one bounded 429 retry under a new reservation, zero-cost 429 reconciliation, no retry or release for timeout/5xx/transport errors, and the geometry-derived continuation-line merge with golden invariance.
- A re-measurement of 3 × (summer + lunchboxy) on one frozen configuration passes the blocking tier 3/3 per ebook in `pdf:acceptance`, with the two earlier 429 reservations reconciled and recorded.
- `npm run test:pdf` and `npm run pdf:acceptance -- --self-test` prove sub-list groups merge into their preceding variant, unrelated duplicate labels stay invalid, and household-parenthetical tolerance keeps amounts blocking; requests use `reasoning.effort=medium`; golden invariance holds.
- A re-measurement of 3 × (summer + lunchboxy) with reasoning medium passes the blocking tier 3/3 per ebook in `pdf:acceptance`.
- `npm run test:pdf` proves heading-only entries fold into the next entry, an unmapped source category falls back to the model's allowed category while mapped categories still win, and the provider deadline is 120 s within the unchanged 270 s import deadline; golden invariance holds.
- A re-measurement of 3 × (summer + lunchboxy) with these rules passes the blocking tier 3/3 per ebook in `pdf:acceptance`.

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
3. Complete Phase 4 offline repair gates, then run one bounded two-fixture acceptance attempt; stop on discrepancies and preserve evidence. Existing smoke/tuning spend remains charged.
4. Run the final eight-cell matrix on a fixed configuration with clean test collections; compare persisted fields exactly against approved goldens, allowing only existing whitespace normalization.
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
- Phase 4 diagnosis/acceptance amendment (2026-10-03): [frame-2026-10-03.md](frame-2026-10-03.md); implementation gaps are established, the proposed repair's accuracy remains unproven.
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

- [x] 2.1 `npm run test:pdf` covers size/page limits, empty versus unreadable documents, deterministic provenance, bounded batches and cancellation cleanup. — c08e7fb
- [x] 2.2 `npx --no-install astro sync && npx --no-install astro check` and `npm run build` pass with PDF.js confined to the browser and its matching worker emitted. — c08e7fb

#### Manual

- [x] 2.3 Visual comparison against summer and pasta source pages confirms intact columns, variant labels, serving notes and 1-based pages; selecting the 113-page file fails before any provider call. — c08e7fb

### Phase 3: Durable Spending Controls

#### Automated

- [x] 3.1 `npm run test:pdf:db` applies migrations locally and proves atomic near-limit admission across independent concurrent requests, all budget scopes, rounding, UTC rollover, duplicate reservations and exactly-once reconciliation. — b0fefdb
- [x] 3.2 `npm run test:pdf:db` proves anon/authenticated clients cannot reserve or reconcile spending, a second owner cannot access import metadata, and timeout/crash/cancel never release possibly charged usage. — b0fefdb
- [x] 3.3 `npm run test:pdf` passes fail-closed database/provider-dispatch tests, including a crash between dispatch claim and network response. — b0fefdb

### Phase 4: OpenAI Recognition and Result Validation

#### Automated

- [x] 4.1 `npm run test:pdf` passes adapter contract, usage accounting, malformed/truncated/blocked responses, source validation, category precedence, overlap reconciliation and prompt-injection-as-source-data cases.
- [x] 4.2 `npm run pdf:evaluate -- --self-test` detects planted omissions, quantity/unit changes, merged variants, invented dishes, duplicate anchors and incorrect source pages.
- [x] 4.3 A ledger-backed synthetic provider smoke records the exact accepted model/API, schema support, bounded usage and reconciled cost without raw prompt/response logs.
- [x] 4.5 `npm run pdf:evaluate -- --self-test` independently detects every compared field mutation and accepts only unchanged or whitespace-normalized controls; offline replay reports precise differences without provider calls.
- [x] 4.6 `npm run test:pdf` proves geometry reaches the adapter input, shared context preserves ownership, and post-context byte/token bounds reject oversize input without truncation or dispatch.
- [x] 4.7 `npm run test:pdf` proves separate quantity/unit and unlabelled-group conventions, required versus optional omission handling, strict provenance, deterministic reconciliation and version-bound canonical digests.
- [x] 4.8 Offline runner and database checks prove truthful exit status, immutable private run artifacts, hash/argument preflight, retained rejection/partial-failure evidence, one import deadline and preservation of historical spending; lint, Astro checks and build pass.
- [x] 4.9 One bounded ledger-backed attempt on the repaired fixed configuration passes exact golden comparison for all four summer and five pasta recipes, with no unresolved invalid/incomplete/conflicting candidates and complete run/accounting evidence.
- [x] 4.10 `npm run test:pdf` proves contradicted or provenance-verified omission reasons are dropped with warnings, an unlabelled group among several is a warning, and unknown reasons, schema and provenance failures stay invalid. — 70fe903
- [x] 4.11 `npm run pdf:acceptance -- --self-test` detects every planted blocking failure and passes the variant and form-only controls; re-scoring saved lunchboxy runs reproduces the frame verdicts. — 70fe903
- [x] 4.12 `npm run test:pdf` proves requests use `reasoning.effort=low` and `max_output_tokens` 16,384 and reservations use 147,456,000 nano-USD per call; lint, Astro check and build pass. — 70fe903
- [x] 4.13 Three ledger-backed summer + lunchboxy runs on one frozen configuration pass the blocking tier 3/3 per ebook in `pdf:acceptance`, with reported-tier counts, tokens and cost recorded.
- [x] 4.15 `npm run test:pdf` and `npm run test:pdf:db` prove one bounded 429 retry under a new reservation, zero-cost 429 reconciliation, no retry or release for timeout/5xx/transport errors, and the geometry-derived continuation-line merge with golden invariance. — 275115b
- [x] 4.16 A re-measurement of 3 × (summer + lunchboxy) on one frozen configuration passes the blocking tier 3/3 per ebook in `pdf:acceptance`, with the two earlier 429 reservations reconciled and recorded.
- [x] 4.17 `npm run test:pdf` and `npm run pdf:acceptance -- --self-test` prove sub-list groups merge into their preceding variant, unrelated duplicate labels stay invalid, and household-parenthetical tolerance keeps amounts blocking; requests use `reasoning.effort=medium`; golden invariance holds. — 332aa84
- [x] 4.18 A re-measurement of 3 × (summer + lunchboxy) with reasoning medium passes the blocking tier 3/3 per ebook in `pdf:acceptance`.
- [x] 4.19 `npm run test:pdf` proves heading-only entries fold into the next entry, an unmapped source category falls back to the model's allowed category while mapped categories still win, and the provider deadline is 120 s within the unchanged 270 s import deadline; golden invariance holds. — 9033455
- [x] 4.20 A re-measurement of 3 × (summer + lunchboxy) with these rules passes the blocking tier 3/3 per ebook in `pdf:acceptance`. — 3d72e8d

#### Manual

- [x] 4.4 With golden results approved, summer and pasta extraction are compared with source pages; every discrepancy is documented and resolved before claiming a passing extraction configuration.
- [x] 4.14 The user reviews the reported-tier differences of the measured runs and the updated PRD, roadmap and fixtures variant wording, and accepts them.

### Phase 5: Real Persistence and the Feasibility Screen

#### Automated

- [x] 5.1 `npm run test:pdf:db` proves all-or-nothing finalization, two-account isolation, altered-payload rejection, request replay safety, concurrent finalize/cancel ordering and recovery after a lost commit response.
- [x] 5.2 `npm run test:pdf:db` proves importing identical bytes again, including a renamed file, skips existing recipes and preserves test-edited content; another account remains independent.
- [x] 5.3 `npm run lint`, `npx --no-install astro check`, `npm run test:pdf`, `npm run test:deployment` and `npm run test:deploy-config` pass.
- [x] 5.4 Production and preview builds pass their existing `check:deploy` checks; preview remains isolated and the local Worker/Supabase auth smoke passes.

#### Manual

- [x] 5.5 On the feasibility screen, complete results save automatically and read back correctly; incomplete results remain unsaved with warnings, complete failure saves nothing, and cancellation/retry reports confirmed outcomes honestly.

### Phase 6: Measurements and F-01 Verdict

#### Automated

- [ ] 6.1 `npm run pdf:report` validates all eight final matrix cells, fixture/config identity, persisted-content comparison totals, <=300-second per-run elapsed time and F-01 usage including uncertain reservations within USD 5.
- [ ] 6.2 All offline PDF, local database, existing auth/deployment and build/config checks pass for the evaluated commit; negative limit tests produce zero provider dispatches.

#### Manual

- [ ] 6.3 The user completes Chrome and Firefox tests on a real phone for both accepted ebooks, checks variants/content and confirms responsive operation; device/browser details and results are recorded.
- [ ] 6.4 Actual Cloudflare CPU/outcomes and desktop browser evidence support the selected hosting configuration; logs and network inspection confirm no original PDF upload, raw-content logging or credential exposure.
- [ ] 6.5 The final evaluation records a supported F-01 verdict and an S-02 handoff; every required manual result is actual evidence rather than an assumed pass.
