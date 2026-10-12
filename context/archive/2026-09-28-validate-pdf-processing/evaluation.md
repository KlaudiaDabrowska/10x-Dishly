# F-01 evaluation record

Current status (2026-10-03): Phase 4 offline repairs verified (63 tests); the latest two-fixture attempt with visual line hints still fails golden acceptance. Current cumulative ledger spend is USD 0.75889125, held USD 0. See the final section for run 403bc33a-7139-4f78-b9a2-8bb8ce56a3c4. Earlier sections preserve historical evidence.

Date: 2026-09-30. State: Phase 1 and Phase 2 criteria completed. **Paid execution waits for durable spending controls.**
This is a prerequisite/evidence record, not an extraction benchmark or a successful F-01 verdict.

## What was actually checked

- The three local originals were hashed and counted with Poppler: 16, 12 and 113 pages. Full expected results were prepared for summer/pasta and visually compared with all nine recipe pages.
- Golden review status: both references explicitly approved by the user on 2026-09-30. See [fixtures.md](fixtures.md) for local review links and hashes in the manifest.
- Available local tooling: Node 24.18.0, npm, pdfinfo, pdftotext and pdftoppm.
- Desktop Chrome: Google Chrome 152.0.7977.75. Firefox executable was not found locally. No browser import benchmark was run.
- A presence-only check found no GEMINI_API_KEY or GOOGLE_API_KEY in the process environment, .env, .env.local or .dev.vars. Secret values were not printed. This does not assert that no credential exists elsewhere.
- Authenticated OpenAI GET /v1/models/gpt-5.4-mini returned HTTP 200 on 2026-09-30. Local key presence and model visibility confirmed without logging secrets. No billing-console inspection, generation, remote schema inspection or paid call was made.

## Automated verification

- PASS: npm run pdf:fixtures on the three actual local PDFs and both references; user review was subsequently approved.
- PASS: npm run test:pdf (11 tests). The deliberate-break check changed the inclusive 20 MB boundary to exclusive, observed the expected failing test, and restored the staged file before re-running successfully.
- PASS: npm run test:deployment (12 tests), npm run test:deploy-config (7 tests), npm run lint and astro check (zero errors/warnings/hints).
- PASS: npm run build and npm run check:deploy -- production. Build retains the existing sitemap warning about the missing site setting.
- PASS: existing auth smoke (27 steps) against the built local Worker and local Supabase, with runtime bindings explicitly set to the loopback database. Two local test accounts were created. The temporary Worker was stopped; the existing Supabase instance was left running. No deployment was performed.

## Prerequisites and owners

| Requirement                            | Evidence/status                                                          | Next evidence needed                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Original files and local golden drafts | Available, hashes pinned                                                 | Completed on 2026-09-30; approval metadata and hashes recorded                                  |
| Accepted model on the actual account   | OpenAI gpt-5.4-mini metadata visible (HTTP 200)                          | Ledger-backed generation smoke after Phase 3                                                    |
| Paid billing and project identity      | User reports billing/key setup completed; balance not inspected          | Verify billing operation in the ledger-backed smoke; do not infer account balance from metadata |
| Responses/schema/configuration support | Documentation supports the selected contract; account execution untested | Ledger-backed bounded synthetic smoke after Phase 3                                             |
| Desktop Chrome/Firefox                 | Chrome present; Firefox missing                                          | Arrange current Firefox for Phase 6 and record actual tested versions                           |
| Real phone Chrome/Firefox              | iPhone 15 Pro Max, Chrome confirmed; iOS version/Firefox unconfirmed     | Record iOS/browser versions and arrange Firefox for the agreed matrix                           |
| Actual Cloudflare CPU/latency          | Not measured for this path                                               | Phase 6 on authorized deployment                                                                |
| Durable spend controls                 | Not implemented in Phase 1                                               | Phase 3 transaction/concurrency tests before paid calls                                         |

Progress 1.4 is complete: authenticated model metadata, user-confirmed billing setup and the planned device environments are recorded, with missing prerequisites explicitly identified. This criterion records readiness and blockers; it does not require successful generation or the Phase 6 browser matrix. Paid execution still waits for the tested ledger and bounded smoke; Firefox availability and actual device/browser versions remain required before the final benchmark.
Unavailable model access stops the live branch and requires a separate model decision; there is no automatic fallback or hosting upgrade.

## Current provider contract and pricing

The user accepted separately billed OpenAI API with gpt-5.4-mini. See [provider-decision.md](provider-decision.md) for the authoritative contract, official sources and authenticated metadata evidence. Billing setup is user-reported; generation entitlement, actual balance and extraction quality remain untested.

At the public standard rates (USD 0.75 / 4.50 per million input/output tokens), 32,768 input plus 8,192 total output tokens reserve USD 0.06144. Reasoning is included in output usage, not charged twice. No Gemini thinking budget applies. Monetary caps are unchanged. Unknown costs remain held; paid dispatch waits for the tested ledger.

## Measurement contract

The final eight-cell matrix is summer/pasta × desktop/real phone × Chrome/Firefox on the passing configuration.
Each cell starts with a clean dedicated test collection and ends at owner-scoped read-back of the actual commit; deduplication is not an import-speed benchmark.
The <=300-second maximum includes fingerprinting, reading, provider/database/network time, validation, persistence and confirmation. Selection and human decisions are excluded.
Record fixture/reference/config/build hashes, model/API, versions, device/OS, stage times, CPU/outcomes, actual/held cost and field-level errors. No raw content or secrets belong in operational logs.

## Privacy and current spend

Originals, local text, reference JSON and source-page images remain inside the ignored local evaluation directory.
No ebook was sent to Gemini or another extraction provider during this phase. Preparation is local; the chat agent inspected locally rendered pages.
Live generation calls made by this phase: 0. This is not a statement about historical usage elsewhere on the account.
The accepted provider retention terms remain separate from app cleanup; account/Paid status must be confirmed before live ebook processing.

## Pending manual evidence

1. Completed: user-approved summer/pasta results, reviewer/date and updated hashes recorded in fixtures.md and manifest.json.
2. Model metadata visible; billing setup reported complete by the user. First paid generation/schema/accounting check remains pending after Phase 3.
3. iPhone 15 Pro Max with Chrome confirmed. iOS/browser versions and Firefox availability remain pending.
   The later benchmark, extraction quality and F-01 verdict are not yet run.

## Provider reconsideration requested by the user

On 2026-09-30 the user confirmed they do not have Gemini API access and asked whether their existing ChatGPT Pro plan can cover this workload. The user subsequently approved OpenAI API / gpt-5.4-mini; the plan and prerequisite record are updated, but no live inference has been performed.

- Manual PDF extraction in ChatGPT is supported as a file workflow ([official guide](https://learn.chatgpt.com/docs/use-chatgpt)); this could supply reviewed JSON for a future manual-import path, but does not implement the planned automatic in-app flow.
- Eligible Pro subscriptions can power requests through Sign in with ChatGPT. The documented open-source/local route is available; paid or remotely hosted apps are directed to an interest form ([availability](https://developers.openai.com/siwc/token-sharing-open-source)). Dishly's Cloudflare deployment is not proven eligible.
- This preview requires streaming and store=false, and does not accept max_output_tokens or the Files upload API ([limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)). Adoption would require revising authentication, limits, accounting and validation; it is not a provider-name substitution.
- Standard API token billing is separate from subscription usage ([pricing](https://learn.chatgpt.com/docs/pricing)). An independently billed OpenAI API integration remains an alternative for the hosted app; the subsequent accepted choice is recorded in provider-decision.md.

Decision: use separately billed OpenAI API / gpt-5.4-mini, as accepted by the user. Quality and the 300-second target remain unmeasured.

## Phase 2: local reader evidence (2026-09-30)

Implemented the browser reader with pinned pdfjs-dist 6.3.289 and a native same-origin module worker. Hashing precedes buffer transfer; pages are read sequentially and retain raw text transforms, widths, directions, line endings, rotations and stable source anchors. Byte/page/text/batch limits reject explicitly; empty/photo pages are accepted within readable documents. No provider adapter or upload endpoint is used.

### Browser evidence

Local desktop headless Chrome 152.0.7977.75 read all three original fixtures through the browser File API. Both the development entry and the built inspection entry were exercised. Full results and summaries remain ignored under evaluation/validate-pdf-processing/local/reader/ and local/reader-built/.

| Fixture | Built reader result                  | Text items | Batches / UTF-8 body bytes |
| ------- | ------------------------------------ | ---------- | -------------------------- |
| summer  | 16 pages accepted                    | 1312       | 2 / 164000 + 161500        |
| pasta   | 12 pages accepted                    | 743        | 2 / 102258 + 69502         |
| low-gi  | rejected: too-many-pages (113 pages) | not read   | none                       |

Development and built results match exactly, including source hashes and text positions. Built local read-plus-batching observations were approximately 625 ms, 196 ms and 136 ms respectively; these are single desktop observations, **not** the end-to-end import benchmark or phone results. All 4 summer and 10 pasta reference anchors were found on their expected pages in the local reader text.

Both browser runs exercised cancellation after native worker creation and returned cancelled. No workers remained after completion/error/cancellation and no external HTTP requests were observed. The built entry rejects selected-page inspection with inspection-disabled. The emitted worker is byte-identical to the installed package (SHA-256 8ab0e5e30031b4a06ecfddd5ae9562f0227f830ee7ec9ed1a968b134243d2386).

The agent visually compared all nine recipe pages: summer 7/9/11/13 and pasta 4/6/8/9/11. Columns, variant labels, serving notes and 1-based page identities were preserved. A local side-by-side review is available at [reader/review.html](../../../evaluation/validate-pdf-processing/local/reader/review.html). Its approximate system font is only an inspection aid; raw transforms are retained in JSON. The user confirmed the visual comparison on 2026-09-30, completing Progress 2.3.

### Implementation adaptations

- The engine-independent reader-core.ts permits deterministic cleanup/error tests; the browser adapter uses the actual PDF.js worker.
- A separate Vite inspection build proves browser bundling before Phase 5 adds the product UI. It lives in dist/pdf-reader-inspection, outside deployed Cloudflare assets, and has separate cache and dotenv loading disabled. The app does not yet import PDF.js.
- Batches shrink their core-page windows when needed and count repeated context/envelopes against the cumulative limit. A single oversized page/context is rejected explicitly without truncation. Provider envelopes and token limits still require enforcement in Phase 4.
- Installed PDF.js 6 declarations/source require PDFWorker.create and no longer expose the former isEvalSupported option. The adapter follows the installed API.

Paid generation calls in Phase 2: **0**. Phone/Firefox, AI extraction accuracy, durable spending controls, persistence and the final F-01 verdict remain later-phase work.

### Phase 2 automated verification

- PASS: npm run test:pdf — 20 tests, including the actual authored PDF fixture and cleanup/limits/batching cases.
- PASS: deliberate-break check removed the previous-page batch context; the ownership/overlap test failed, and git checkout restored the staged implementation unconditionally. The full PDF suite passed afterwards.
- PASS: npx --no-install astro sync and astro check — zero errors, warnings or hints.
- PASS: npm run build, followed by the final inspection rebuild/browser check after the DOM typing correction. The matching PDF.js worker is emitted. The existing sitemap warning about missing site remains unchanged.
- PASS: npm run lint, npm run test:deployment (12 tests), npm run test:deploy-config (7 tests), npm run check:deploy -- production.
- Type checking and lint initially found integration/type-style issues; they were corrected without suppressing rules or weakening assertions. The standalone inspection uses a separate Vite cache to avoid conflicts with Astro.
- No deployment, paid API call or phone benchmark was performed. The auth smoke was not repeated for this browser-only phase; Phase 1 evidence remains above.

## Phase 4 repair and bounded acceptance attempt (2026-10-03)

Current result: **offline repair gates pass; golden acceptance fails**. Progress 4.5–4.8 are complete. Manual 4.4 and live accuracy gate 4.9 remain pending; Phase 5 and F-01 completion are not claimed.

### Implemented repair

- Shared batches and provider input use v2 and retain page dimensions, rotation, item transforms, widths/heights, direction, line endings and stable source anchors. The source/reader identity remains v1.
- First-three-page document context and adjacent context are assembled centrally, with distinct ownership roles. Repeated context counts toward byte/token limits. A full-input token preflight reduces core windows from 8 to 4 to 2 to 1 pages when necessary; irreducible oversized input fails before any paid reservation/dispatch.
- Recipe schema v2 has typed omission reasons: required content omissions prevent automatic completeness, optional absent servings/footnotes do not, and unknown/inconsistent reasons are invalid. Rejected candidates retain exact validation conditions and field paths.
- Comparison reports exact field paths and preserves the approved whitespace-only acceptance rule. Null, missing fields, array boundaries/order and non-whitespace text changes remain significant.
- Each attempt has an immutable private run directory with prompt/schema/code/input hashes, exact requests, provider responses, candidate dispositions, per-batch evidence, report hashes and accounting. Raw content remains ignored and private (0600 files inside 0700 run directories). CLI output contains aggregate diagnostics; nonmatching/failed runs exit nonzero.
- The 270-second processing deadline is shared across token preparation and all batches of an import. Individual provider calls remain bounded by 60 seconds and the remaining import time.
- Database tests now use an independently named temporary local Supabase project with copied migrations and separate ports. The primary database is never reset; the temporary project is cleaned up after testing.

### Verification

| Gate | Result |
| --- | --- |
| PDF offline suite | PASS — 60 tests |
| Evaluator self-test | PASS — 39 independent mutation cases, 2 passing controls |
| Original fixtures/references | PASS — all three PDF identities and both approved reference hashes unchanged |
| Isolated real-database suite | PASS — 6 tests, including concurrent budgets, access isolation and unknown charges |
| Deliberate-break check | PASS — replacing serialized page width with zero made the geometry test fail; staged implementation restored unconditionally and the test passed again |
| Lint | PASS after correcting global declarations and literal-type inference; no rule suppressions |
| Astro sync/check | PASS — zero errors, warnings or hints after the literal-type correction |
| Build and production configuration | PASS — existing sitemap/site warning only |
| Deployment tests / configuration tests | PASS — 12 / 7 tests |
| Actual run replay | PASS as a diagnostic check — reproduces both failed outcomes offline and exits 1, with no provider/ledger activity |

### Actual acceptance attempt

Private run ID: 46fd1556-9117-4af8-a48b-85e67c3d6326.

Artifacts: evaluation/validate-pdf-processing/local/extraction-review/46fd1556-9117-4af8-a48b-85e67c3d6326/.
The immutable run.json identifies the evaluated dirty-tree code fingerprint, provider configuration, references and starting ledger snapshot; result.json pins the fixture reports. Earlier fixed-name artifacts remain intact. No raw recipe text is included in this record.

| Fixture | Outcome | Evidence |
| --- | --- | --- |
| summer | FAIL before generation | Eight counting attempts exhausted 8/4/2/1-page splitting. Even the one-core-page window at page 4 plus required context exceeded 32,768 tokens. Zero paid calls/reservations, no candidates; four golden recipes missing because extraction did not run. Elapsed 24.678 s. |
| pasta | FAIL golden comparison | Six two-core-page batches completed and reconciled. Six candidates retained (four complete, two incomplete), nine rejected for context-only source starts, one duplicate title, no reconciliation conflicts. All five golden titles occur, but exact content comparison fails. Elapsed 39.738 s. |

Pasta has 136 detailed comparison records, including one duplicate-title record. They include 47 quantity and 53 unit field mismatches, five sourceCategory mismatches, two sourceText mismatches and structural/instruction/serving/footnote/category/page differences. All nine rejected candidates have the precise condition context-only-anchor-is-not-owned; this is now evidence rather than an inferred explanation. One incomplete candidate starts on page 3 without ingredients/instructions; another on page 9 lacks a mapped category.

The comparator intentionally does not select a more favorable duplicate to hide failure. Consequently field totals describe the actual retained output and exact matching policy; they are not a claim that every duplicated candidate has the same errors. No golden values were changed or copied into runtime output.

This attempt used 118,936 input and 8,661 output tokens across six paid generation calls, all for pasta. Incremental cost: **128,176,500 nano-USD = USD 0.1281765**. Historical F-01 spend before the attempt was 271,532,250 nano-USD; after it is **399,708,750 nano-USD = USD 0.39970875**, with **zero held unknown charges**. The accounting history survived isolated database testing. This is application-ledger evidence, not an independent billing-console balance check.

No automatic retry or second configuration was run. The next repair must address input representation/context overhead and the now-observed source ownership/content failures before another acceptance attempt. These extraction-only timings do not establish the browser → AI → confirmed-save benchmark or phone/actual-host feasibility.

Offline reproduction:

    npm run pdf:extract-review -- --replay evaluation/validate-pdf-processing/local/extraction-review/46fd1556-9117-4af8-a48b-85e67c3d6326

Exit code 1 is expected while these immutable results fail golden acceptance. It must not be changed to a success or waived through semantic review.

## User-approved input-cap increase (2026-10-03)

The user explicitly requested increasing the cap to unblock summer. Before changing it, the counting endpoint measured the original two standard batches at **60,886 and 80,950 input tokens**; the previously rejected single-core-page-4 window measured **34,625**. Numeric-only evidence is stored privately in local/token-counts-2d6a1264-21f8-4c55-a247-8914d4ba5be7.json. These measurements did not generate recipes.

The application cap is now **98,304 input tokens**. Output stays 8,192; the maximum per-call reservation is **110,592,000 nano-USD (USD 0.110592)**. USD 0.50/import and USD 5 cumulative F-01 caps and prior spending remain unchanged. The [official model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini), rechecked on 2026-10-03, documents a 400,000-token context window and unchanged standard input/output rates. The adapter now records exact counts before accepting or rejecting them; private count-result artifacts include the active limit.

Validation: **61 PDF tests pass**, including summer-sized inputs, the inclusive 98,304 boundary, rejection at 98,305 and exact diagnostic capture. Lint, Astro check (zero errors/warnings/hints), build and diff whitespace checks pass. No database schema or accounting-history reset occurred.

One bounded summer-only verification was run under the amended configuration: **f8d03470-e4f1-469d-a422-20dfca70395d**. Both original batches passed input admission and generation and reconciled in 18.760 s; recorded input counts are 60,886 and 80,950. Total input is 141,836 tokens; output is 4,512 tokens. Incremental cost is **USD 0.126681**; cumulative F-01 spend is **USD 0.52638975**, with zero held unknown charges.

**Input-limit problem resolved; golden quality still fails.** Five candidates were returned: one retained complete candidate and four rejected. Three expected recipes remain missing, and the report contains 21 detailed comparison records. Category/page comparison passes for the retained candidate; ingredient and structure comparison do not. No additional retries followed and pasta was not rerun under this amended configuration. Progress 4.4/4.9 remain pending.

The private run directory under local/extraction-review/ pins exact code/config/reference hashes and contains requests, responses, numeric count results and rejection evidence. Prior run directories are unchanged.

## Visual line hints and field-convention repair (2026-10-03)

The user requested continuing after the input-cap change. Diagnosis used saved responses and the unchanged reader/goldens before making another paid attempt. The previous summer run rejected three candidates for missing variant labels and one for a context-only source start. Its retained candidate omitted two variants and notes. Raw source ordering places some titles and section headings after their bodies; the available coordinates locate them correctly. Pasta also exposed an instruction defect: equivalent household and metric quantities had been treated like ambiguous alternatives.

### Changes and offline evidence

- Added a deterministic, source-derived visualLines index before raw page items in the shared model input. It groups horizontal LTR fragments into spatial rows/cells, separates column gaps and retains original anchors. All original items and geometry remain unchanged and canonical; unsupported orientations remain available there. No fixture identities, expected recipe content or golden lookup are used by this helper.
- Clarified explicitly stated metric quantities versus household equivalents, removal of list bullets, continuation lines, descriptive versus measurement parentheses, calorie headings as variant labels, shared preparation paragraphs and substitution notes. Dedicated meal headings remain verbatim; where a book only states a meal type in its title/introduction, the instruction requests that meal noun in the source language. These are extraction conventions; the comparator and approved references are unchanged.
- PASS: 63 PDF tests, lint, Astro check (zero errors/warnings/hints), build, original fixture/reference validation and diff whitespace checks. The existing sitemap warning remains. The deliberate-break check reversed spatial ordering, observed the title-order test fail, restored the staged implementation unconditionally and verified both new layout tests pass.
- No database schema or accounting logic changed. Existing isolated database evidence remains applicable; the primary ledger was not reset.

### One fixed-configuration acceptance attempt

Private run: **403bc33a-7139-4f78-b9a2-8bb8ce56a3c4** under local/extraction-review/. All four generation batches completed and reconciled; there were no provider, input-limit or output-limit failures. Both fixtures used two batches on the same code/configuration. Exact requests, responses, validations, input counts, hashes and comparisons remain private and immutable.

| Fixture | Input / output tokens | Extraction time | Result | Actual cost |
| --- | --- | --- | --- | --- |
| summer | 169,274 / 3,189 | 17.308 s | FAIL: 2 retained complete candidates, 3 invalid; 2 expected recipes missing; 26 detailed differences | USD 0.141306 |
| pasta | 89,902 / 5,282 | 17.824 s | FAIL: all 5 titles retained, 3 complete and 2 incomplete; 1 invalid context candidate; 63 detailed differences | USD 0.0911955 |

Summer's per-call input counts were 71,945 and 97,329, both below the 98,304 cap. The rejected candidates have three distinct conditions: an absence reason contradicts present notes, a source start belongs only to context, and a multi-group result lacks a required label. Retained candidates still omit ingredient variants and continuations. Their exact instruction, note, category and page fields match; their ingredient fields do not. Correct title anchors improve in the raw output, but that does not establish completeness or a passing recipe.

Pasta has 25 quantity and 29 unit differences in the final two recipes, four category differences and five sourceCategory differences. All instruction, note, serving and sourceText fields match in this attempt. Two candidates still declare missing source metadata; one extra context-only candidate is rejected. No invented or duplicate titles and no reconciliation conflicts occur for either fixture. Counts describe this run's retained output, not an overall accuracy percentage.

Incremental cost: **USD 0.2325015**. Cumulative F-01 spend rose from USD 0.52638975 to **USD 0.75889125**, with **zero held unknown charges** and USD 4.24110875 remaining under the USD 5 ledger cap. This is ledger evidence, not billing-console balance verification.

Offline replay reproduced both failures and exited 1 without provider or ledger calls:

    npm run pdf:extract-review -- --replay evaluation/validate-pdf-processing/local/extraction-review/403bc33a-7139-4f78-b9a2-8bb8ce56a3c4

**GATE 4.9: FAIL.** Progress 4.4/4.9 stay pending; no Phase 5, commit or successful F-01 claim follows. No further paid retry was run. The evidence shows that adding spatial hints and more explicit instructions is insufficient on this configuration; it does not by itself prove that the model cannot perform the task. The next repair should investigate a shorter, lossless representation and stronger source-block constraints, with offline equivalence tests first. Increasing the token cap again would not address any observed failure in this run.

## Dietetyka diagnostic excerpt and lunchboxy fixture (2026-10-05)

### Dietetyka excerpt — invalid fixture

Run **f78525c2-29ba-4ace-bc29-a07ca72dce41** (1 batch, 12,331 counted input tokens, USD 0.01199775). The excerpt's CropBox (595×500) hides the upper half of the MediaBox from PDF.js, while the golden was prepared with Poppler from the full page. Two of three expected recipes never reached the model, and the visible "PROTEINOWA PASTA Z ZIELONEGO GROSZKU" was absent from the golden. The result therefore measures the fixture, not extraction. Genuine model errors were still visible: the visible sauce recipe was omitted, the "SKŁADNIKI DO PRZYGOTOWANIA 2 PORCJI:" heading became a group label, and household measures were chosen over the adjacent gram column. The excerpt is retired.

Rejected candidate: `1600-1 (1).pdf` is an image-only Photoshop export with no text layer (OCR is out of scope).

### Lunchboxy fixture (user amendment)

The user replaced pasta/low-gi with pages 1–12 of `8. Klaudia MIx Fit - Lunchboxy.pdf` as the second acceptance fixture. The golden contains five recipes: one unlabelled group each, the explicit gram/ml amount as quantity/unit, null scalar fields for non-metric amounts, except an unambiguous count, one preparation paragraph, no servings/notes (nutrition summaries are not notes), `category: null` and `sourceCategory: null`. The user approved it on 2026-10-05. The built browser reader read the file in 504 ms into two batches without external requests or remaining workers.

Offline gates: 66 PDF tests pass. Evaluator self-test: 42 mutation cases and 6 passing controls, including four allowed inferred categories and rejection of an invalid/null category or an invented sourceCategory. Fixture validation passes for all five manifest entries.

### Lunchboxy attempt — FAIL

Run **8b771929-148c-40c7-a324-62d1bcbfb77a**: 2 batches (25,931 + 25,078 input, 1,287 + 704 output tokens), 13.9 s. Incremental cost **USD 0.04721625**. Cumulative F-01 spend **USD 0.81810525**, zero held.

All 5 recipes were found, with no invented, duplicate, invalid, incomplete or conflicting candidates, and all quantities/units and pages correct. Exact golden comparison fails with 14 field differences in three categories:

| Error | Recipes | Cause |
| --- | --- | --- |
| "Składniki:" / "Składniki" returned as group label | 3/5 | A section heading treated as a variant label despite the explicit prompt rule |
| One paragraph split into 2 instructions | 3/5 | Split at a visual line that ends with a full stop — mid-paragraph breaks in the source |
| Ingredient name changed | 2/5 | "makaronu" → "makaron" (grammatical normalization); the "(dowolny smak)" continuation dropped from the name (sourceText remained correct) |

Categories inferred by AI: dinner, dinner, breakfast, dinner, lunch, all allowed. **GATE 4.9: FAIL**; 4.4/4.9 remain pending and no automatic retry was made. All three error classes are deterministic and source-structural. They are candidates for deterministic post-processing (dropping a single group's "Składniki" heading label and merging non-numbered instruction lines into one paragraph), which plan section 5 does not yet authorize.

## Deterministic normalization and summer + lunchboxy acceptance attempt (2026-10-05)

### Implemented (user-approved plan amendment)

`src/lib/pdf-processing/normalize.ts` is applied once inside `validateRecipeCandidate`, before the canonical digest. It uses only the candidate plus the supplied source text and geometry, and reports every change as a warning. It sets a single group's ingredient-section heading label to null, restores the ingredient name verbatim from sourceText after the metric amount (dropping only household-measure parentheticals), and merges an unnumbered instruction whose first source line directly continues the previous entry's last line in the same column.

Offline gates: PASS for 70 PDF tests, including 4 new synthetic normalization tests. Two deliberate breaks (removing the column-overlap condition and the numbered-step guard) turned the tests red, and the code was restored. Also PASS: evaluator self-test, fixtures, lint, Astro check (0/0/0), build and preflight. **Golden invariance:** normalizing all 14 approved golden recipes (summer, pasta, lunchboxy) against their source geometry changes nothing. **Saved-response revalidation without provider calls:** lunchboxy run 8b771929 went from 14 differences to **0 (exact match)**. Summer run 403bc33a remained at 26 differences; its failures are outside the normalization's scope.

### Bounded attempt — FAIL

Run **cdf946c5-d899-48c3-a5b1-d3172c44b8a5**: all 4 batches completed and reconciled, with no automatic retry. Offline replay reproduces the result (exit 1).

| Fixture | Tokens (input / output) | Time | Result |
| --- | --- | --- | --- |
| summer | 169,274 / 3,276 | 17.3 s | FAIL: 0 retained, 5 invalid; all 4 recipes missing |
| lunchboxy | 51,009 / 2,064 | 13.2 s | FAIL: 5/5 retained and complete, 28 differences in 2 of 5 recipes plus the nutrition line as a footnote in 3 of 5 |

Incremental cost **USD 0.18924225**. Cumulative F-01 spend **USD 1.0073475**, zero held.

Summer rejection causes:

- 3 of 5 candidates declared `absent-footnotes` while returning 3–5 notes (a self-contradiction that the validator rejects by design).
- 1 candidate started on a context-only page.
- 1 candidate had two groups, the first without a label.

The model again failed to separate the three kcal variants: every candidate had only one group.

Lunchboxy errors in this sample were different from the previous run:

- the "Całość: … kcal B/T/W" nutrition line was returned as a footnote (3 recipes);
- an ingredient from another recipe was added ("2g oleju" in the pasta recipe);
- continuation lines were split into separate ingredients ("(dowolny smak)", "wędzononego").

The heading, paragraph and name fixes applied correctly where they fit.

**GATE 4.9: FAIL.** 4.4/4.9 stay pending. Conclusion: the deterministic repair removes one class of systematic errors, but the model's output varies between identical requests (lunchboxy 14 → 28 differences with an unchanged request). For summer, the dominant problem is validation rejection of entire recipes and lost kcal variants. Further prompt or normalization changes would continue an open-ended tuning loop. Under the plan, the next step requires an evidence-based decision (frame/plan review) rather than another attempt.

## Frame verification: lunchboxy repeatability (2026-10-05)

The user ran `/10x-frame` and then requested verification before planning: three lunchboxy runs with unchanged code/prompt/model (**eaa6c74b, 5ea356b0, ba2d31c8**), each 2 batches, about 11–14 s, no automatic retry. All failed exact golden comparison (9 / 8 / 32 differences). Scored by the proposed product-relevant blocking tier (read-only script `.cache/frame-blocking-tier.mjs`), 1 of 5 lunchboxy runs passes (8b771929). The failures are: spurious `missing-source-metadata` making 3 recipes incomplete; 2 recipes rejected for contradictory `absent-footnotes`; and twice, a "2g oleju" ingredient added from another area plus wrapped continuation lines split into separate ingredients. Incremental cost **USD 0.142504** (3 runs). Cumulative F-01 **USD 1.14985125**, held 0. See [frame.md](frame.md). Gate 4.9 remains FAIL and 4.4/4.9 pending.

## Two-tier acceptance, lenient validation and reasoning low (2026-10-05)

### Offline (4.10–4.12) — PASS

- Validation: contradicted omission reasons and a model-supplied `missing-source-metadata` (after provenance passes) are dropped with warnings; an unlabelled group among several is the warning `unlabelled-variant-group`. Unknown/duplicate/mis-pathed reasons, schema errors, duplicate labels and all provenance checks stay invalid.
- `npm run pdf:acceptance`: offline blocking-tier scorer plus `evaluateRecipes` reported tier and a 3/3 same-config verdict. Self-test: 14 planted failures, 5 controls. Re-scoring the saved lunchboxy runs reproduces the frame verdicts: 8b771929 PASS; cdf946c5, eaa6c74b, 5ea356b0 and ba2d31c8 FAIL.
- Configuration: `reasoning.effort=low`, `max_output_tokens` 16,384, reservation 147,456,000 nano-USD per call.
- Gates: 79 PDF tests, lint, Astro check (0/0/0), build, evaluator self-test, fixtures, golden invariance and deployment tests all pass. Two deliberate breaks (amount check in the scorer; context-only ownership in validation) turned the tests red, and the code was restored.
- Offline revalidation of saved raw responses with the new validation: cdf946c5 summer keeps all 4 recipes and passes the blocking tier. The eaa6c74b and 5ea356b0 metadata losses disappear, but the ingredient errors remain.

### Live 3 × (summer + lunchboxy) on one frozen configuration (4.13) — FAIL

| Run | summer | lunchboxy |
| --- | --- | --- |
| ea77ac19 | **PASS** — 4/4 recipes; reported 25 diffs | FAIL — "Kanapka z pieczonym tofu": continuation lines split into entries |
| 77ca3fb1 | **ABORTED** — batch 2 HTTP 429 `provider-rate-limited`; 3 recipes missing | **PASS** — 0 differences, exact golden match |
| e7c581a0 | **ABORTED** — batch 2 HTTP 429; 3 recipes missing | **PASS** — 0 differences, exact golden match |

`pdf:acceptance` verdict: summer 1/3, lunchboxy 2/3 → **FAIL**. No automatic retry was made.

- The two summer failures are infrastructure, not extraction quality: the provider rejected the second summer call (97,329 input tokens) with 429, about 5–10 s after the previous runs. This is a tokens-per-minute rate limit of the account tier on back-to-back runs. The only completed summer run passed.
- The lunchboxy blocking failure is the recurring line-join defect on page 12 ("40g humusu" / "(dowolny smak)", "90g tofu" / "wędzononego"). It occurred in 3 of 8 lunchboxy samples across both reasoning settings.
- Reasoning low used 198–1,113 reasoning tokens per call; total output ≤ 2,788, far below 16,384.

Accounting: 9 completed calls reconciled. The two rate-limited calls stay **held at the full reservation (2 × USD 0.147456 = USD 0.294912)** by design, because a dispatched call with an unknown outcome is never auto-released. Cumulative spent **USD 1.5774885**, held **USD 0.294912**, with USD 3.1275995 available under the USD 5 cap. Releasing the 429 holds requires the trusted reconciliation that the plan names as a separate step; OpenAI does not bill a 429-rejected request, but the application ledger cannot prove that on its own.

**GATE 4.13: FAIL.** 4.4/4.9/4.13 remain pending. Per the amendment, the model escalation decision (`gpt-5.4`) belongs to the user. The evidence suggests two other causes first: rate-limit pacing between summer calls, and the page-12 line-join defect, which can be corrected deterministically from geometry.

## 429 handling, line merge and re-measurement (2026-10-06)

### 4.15 — PASS (commit 275115b)

- An HTTP 429 is reconciled at USD 0 under a `rate-limited` usage-report kind, followed by one retry under a new reservation. The ledger allows exactly one re-reservation per batch, enforced in the database. Timeouts, 5xx and transport errors stay held without retry. The runner pauses 30 s between fixtures.
- The two historical 429 holds (77ca3fb1 and e7c581a0, summer batch 1) were reconciled at 0 with the one-time CLI after migration 20261005090000 was applied locally. Held went from USD 0.294912 to 0; spent is unchanged. Evidence is in each run's `summer/batch-1-rate-limit-reconciliation.json`.
- Geometry-derived ingredient continuation merge ("(dowolny smak)", "wędzononego"). Golden invariance holds.
- Gates: PDF 87/87, isolated DB 10/10, lint, Astro check, build and deployment tests pass. Deliberate breaks (unbounded retry; merging any line) turned the tests red, and the code was restored.

### 4.16 — re-measurement on one frozen configuration: FAIL

Runs **5296e8f5, 02f9a3e9, f9efbc7f** (30 s apart). No 429 occurred and no retry was needed; held is 0 after each run.

| Run | summer | lunchboxy |
| --- | --- | --- |
| 5296e8f5 | FAIL — strawberry salad: the three variants' ingredients merged into one unlabelled group, adding 3 entries from other variants (the shared "sos:" lines) | **PASS**, 0 differences |
| 02f9a3e9 | **PASS** (4/4; 42 reported differences) | **PASS**, 0 differences |
| f9efbc7f | FAIL — salad rejected: a 4th group without a label next to labelled ones (`invalid-group-labels`, duplicate/blank among labels). Dessert: all 3 variants correct, but sourceText dropped household parentheses; the golden "napar z owocowej herbaty (pół szklanki)" name is therefore not contained in the actual sourceText | **PASS**, 0 differences |

`pdf:acceptance`: lunchboxy **3/3 PASS** (exact golden match in all three runs); summer **1/3** → overall FAIL.

Remaining summer causes, all in the multi-column kcal-variant pages:

- variants merged into one group (salad);
- a "sos:" sub-list emitted as an extra group and then rejected;
- dropped household-measure text.

The ingredient-membership and line-join failures seen earlier in lunchboxy did not recur.

Cost of this measurement: USD 0.611845. Cumulative spent **USD 2.18933325**, held 0, with USD 2.81066675 remaining under USD 5. The phase 6 final-matrix headroom check still passes.

4.13/4.16 remain FAIL, and 4.4/4.9 are pending. Further work on summer needs a user decision: a stronger model (`gpt-5.4`, not approved), reasoning `medium`, or a scorer/validation change for the "sos:" sub-list and household parentheses.

## Sub-list merge, budget USD 6 and reasoning medium (2026-10-06)

### 4.17 — PASS (commit 332aa84)

- Repeated sub-list groups (`347 kcal`, `sos:`, `403 kcal`, `sos:` …) are merged into their preceding variant before the label check. Unrelated duplicate labels stay invalid.
- The scorer tolerates a dropped trailing household parenthetical in the golden name; amounts stay blocking.
- `reasoning.effort=medium`.
- Gates: PDF 89/89, acceptance self-test (16 failures / 6 controls), golden invariance, lint, Astro check and build pass. Deliberate breaks (treating any label as a sub-list heading; ignoring amounts) turned the tests red, and the code was restored.
- Offline re-scoring of the saved low-reasoning summer runs: 3/4 now pass (f9efbc7f recovered). The variant-merge run (5296e8f5) still fails.

### Budget amendment (commit 55fa6df)

The preflight refused 4.18 by USD 0.138 while keeping maximum final-matrix headroom. The user raised the F-01 budget to USD 6. Migration 20261006090000 updates the existing scope; spend and holds are preserved. The deliberate break (old limit in the migration) made 2 DB tests fail, and the code was restored. Isolated DB 10/10.

### 4.18 — live 3 × (summer + lunchboxy), reasoning medium: FAIL

| Run | summer | lunchboxy |
| --- | --- | --- |
| 5d4423be | FAIL — salad: the model now separates all three variants correctly, but emits the sub-list heading "sos:" as its own amount-less ingredient entry → 3 `ingredient-added` | PASS, 0 differences |
| 66488a98 | ABORTED — batch 2 `provider-timeout` (60 s provider deadline exceeded; the call is held) | FAIL — 3 recipes `incomplete`: the model wrote a non-meal sourceCategory, the deterministic mapping returned none, so `missing-category` |
| 0043e87b | FAIL — same "sos:" heading-entry pattern as 5d4423be | PASS (6 reported differences) |

`pdf:acceptance`: summer 0/3, lunchboxy 2/3 → **FAIL**.

- Medium reasoning more than doubled output (4,457–9,535 tokens; up to 5,773 reasoning tokens) and latency (summer about 85 s, lunchboxy about 70 s per import). The 9,535-token summer batch approaches the 60 s provider deadline, which caused the timeout. A timeout is an unknown outcome: **USD 0.147456 stays held** by design.
- Read-only what-if (`.cache/whatif-medium.mjs`, nothing written) with two form rules: fold an amount-less heading entry ending in ":" into the next entry, and treat an unmapped sourceCategory as absent so the AI category is used. All completed medium runs then pass the blocking tier (5d4423be and 0043e87b summer; 66488a98 lunchboxy). The remaining failures are representational, not lost recipes or wrong amounts.

Cost: USD 0.711945 confirmed plus 0.147456 held. Cumulative spent **USD 2.90127825**, held **USD 0.147456**, with USD 2.95126575 available under USD 6. Phase 6 final-matrix headroom (USD 2.359296) still fits. 4.18 remains FAIL; 4.4/4.9/4.13/4.16 are pending. A next decision is required.

## Heading entries, unmapped category, 120 s deadline (2026-10-06)

### 4.19 — PASS (commit 9033455)

- Amount-less sub-list heading entries (e.g. "sos:") fold into the next entry of the same group.
- An unmapped sourceCategory (e.g. "Posiłki") is treated as absent, so the model's allowed category applies. Mapped meal headings still win.
- Provider deadline is 120 s; the import deadline stays 270 s.
- Gates: PDF 92/92, golden invariance, acceptance/evaluator self-tests, fixtures, lint, Astro check, build and deployment tests pass. Deliberate breaks (any entry treated as a heading; unmapped category clearing the category) turned the tests red, and the code was restored.
- Offline revalidation with current code: summer passes in 5/6 saved runs, including both completed medium runs (5d4423be, 0043e87b). The only failure is a low-reasoning variant merge (5296e8f5). Lunchboxy passes in 6/6 saved runs, including 66488a98, which was previously incomplete.

### 4.20 — live, stopped by the budget preflight

- **Run 10798fa8: summer PASS, lunchboxy PASS** (exact golden match). Summer took 94 s with a 11,998-token batch that finished inside the 120 s deadline. All calls reconciled; cost USD 0.27012.
- **Runs 2 and 3 were refused before any reservation** with `f01-budget-insufficient`. After run 1, available capacity is USD 2.6811405 (USD 6 − 3.1714035 spent − 0.147456 held from the 4.18 timeout). One more run requires USD 0.589824 at maximum reservations plus the unchanged phase 6 headroom of USD 2.359296, which leaves USD 0.268 short. No call was made. The control worked as designed.

The held USD 0.147456 is the 4.18 summer batch-2 timeout (an unknown outcome). It cannot be released without trusted billing evidence.

**4.20: 1 of the 3 required runs completed (passed); not accepted.** Cumulative spent **USD 3.1714035**, held **USD 0.147456**.

## Budget USD 7 and acceptance measurement 4.20 — PASS (2026-10-06)

The user raised the F-01 budget to USD 7 (commit 3d72e8d, migration 20261006120000). The deliberate break (old limit in the migration) made 2 DB tests fail, and the code was restored. PDF 92/92, DB 10/10, lint clean. The budget limit is part of the recorded configuration digest, so 4.20 used three new runs; 10798fa8 stays as supporting evidence.

Runs **e4e7a786, e6e3150c, 066f4d67**, all with config digest a1cf3030…, commit 3d72e8d, `gpt-5.4-mini`, reasoning medium and a 120 s provider deadline. There were no failures, timeouts or 429s, and all calls reconciled.

| Run | summer | lunchboxy |
| --- | --- | --- |
| e4e7a786 | PASS — 4/4, 18 reported diffs (99.8 s) | PASS — exact golden (42.6 s) |
| e6e3150c | PASS — 4/4, 9 reported diffs (65.2 s) | PASS — exact golden (38.9 s) |
| 066f4d67 | PASS — 4/4, 31 reported diffs (90.1 s) | PASS — 4 reported diffs (40.3 s) |

**`npm run pdf:acceptance`: ok=true — summer 3/3, lunchboxy 3/3, identical config.** Exact-golden replay still exits 1 by design; that tier is report-only since the 2026-10-05 amendment.

Reported-tier (non-blocking) differences across the three runs:

- summer `name`: the golden keeps "(pół szklanki)" etc. in the name; the model drops the household parenthetical (33).
- summer `quantity`/`unit`: "napar z owocowej herbaty (pół szklanki)" was given quantity "pół", unit "szklanki", where the golden has null (9 + 9). There is no metric amount, so this is not blocking under the contract.
- summer `sourceText`: "kurczaka kurczaka" (a duplicated word in the wrap) and a missing or differently placed "sos:" prefix or "(2 łyżeczki)" (7).
- lunchboxy `footnotes`: the "Całość: … kcal" nutrition line was returned as a footnote in 2 recipes in one run.

Cost of the three runs: USD 0.8590695. Cumulative spent **USD 4.03048275**, held **USD 0.147456** (the 4.18 timeout), with USD 2.82206125 available under USD 7. That covers the phase 6 final-matrix headroom of USD 2.359296.

Gate status: **4.20 PASS**. 4.9, 4.13 and 4.16 described earlier configurations and stay as failed historical gates. 4.4 and 4.14 (manual) await the user.

### Manual approval (2026-10-06)

The user reviewed the reported-tier differences of runs e4e7a786, e6e3150c and 066f4d67 (dropped household parentheticals in names, "pół szklanki" as quantity/unit, a duplicated word in one sourceText, "sos:" prefix variations, and the nutrition line as a footnote). The user also reviewed the PRD/roadmap/fixtures variant wording, and accepted both on 2026-10-06. Progress 4.4 and 4.14 are checked. 4.9, 4.13, 4.16 and 4.18 remain as superseded, failed historical gates of earlier configurations; the accepted configuration is the one measured in 4.20.

## Phase 5 — feasibility screen manual check (2026-10-06)

Local built Worker (`preview:worker`) against the local Supabase ledger, with migration 20261007090000 applied and one dedicated local evaluator account in the allowlist. Real OpenAI calls through the screen; no deployment.

- First import of `lunchboxy-1-12.pdf`: committed, 5 newly saved / 0 already saved / 0 not saved, owner read-back confirmed. The saved recipes start on pages 4, 6, 8, 10 and 12, as in the golden; category was inferred (4 lunch, 1 breakfast) because lunchboxy states no meal type. Import created → committed in 72 s.
- Second import of the identical file: committed, nothing duplicated (still 5 recipes for the account).
- Scanned PDF without a text layer: `unreadable-document` before any provider call; nothing saved.
- Cancellation during recognition: import `cancelled`, nothing saved.
- Fix found during the check: Workers rejects `fetch(..., { redirect: "error" })`, which was caught locally as `provider-transport-error` before any request left the Worker. The adapter now uses `redirect: "manual"` (a 3xx still fails as `provider-http-error`), with a regression test.

Cost of the screen checks: USD 0.198175 (three imports, including the cancelled one). Cumulative spent **USD 4.2286575**, held **USD 0.147456**, with USD 2.6238865 available under USD 7, which still covers the phase 6 final-matrix headroom of USD 2.359296.

Progress 5.5 is checked on the user's confirmation.

### Phase 5 implementation review fixes (2026-10-06)

[reviews/impl-review-phase-5.md](reviews/impl-review-phase-5.md) found no critical issue. Fixed before Phase 6:

- `reserve_pdf_batch` (migration 20261007100000) refuses a new reservation for a validation import that is cancelled, failed, committed or expired, so a cancel arriving during token counting can no longer let a paid call start. Cancel and failure also close batches that were never dispatched.
- The browser chooses the import id before sending text; create is idempotent on that id, so a cancelled or lost create can always be closed and cannot block the evaluator for 5 minutes.
- The four experiment secrets are optional for deploys again; missing configuration only disables the experiment.
- Deterministic RPC rejections return 400/409 instead of 500; 5xx outcomes log one content-free line (route, status, error code, SQLSTATE).
- Finalize uses a map instead of a nested scan; read-back is chunked; the status call checks the expiry-close result.

Design note: the plan's `processing → ready → committed` sequence is simplified. Finalize accepts a `processing` import directly once every batch is recorded; `ready` is never set. Cancellation and expiry behave as planned. Error codes produced by the shared request guard stay snake_case (`experiment_unavailable` etc.), as the existing middleware and preview checks use them.

## Phase 6 — offline preparation for the final benchmark (2026-10-06)

**F-01 verdict: pending.** This section records offline tooling only. No deployment, remote migration, remote carry-over or paid call was made. Paid calls in this step: 0. The F-01 ledger is unchanged: spent USD 4.2286575, held USD 0.147456 (local).

Binding decisions for the final matrix: second ebook **lunchboxy** (amendment 2026-10-05), F-01 budget **USD 7** (amendment II 2026-10-06), matrix {summer, lunchboxy} × {Chrome, Firefox} × {desktop, real phone} = 8 cells. The procedure is in [manual-tests.md](manual-tests.md).

### Implemented offline

- **Run record on the feasibility screen.** After a terminal outcome the screen offers *Copy run record* / *Download run record*. The non-content JSON holds the import ID, file SHA-256/bytes/page count (no filename), reading/recognizing/saving/total time (start before hashing, stop after commit read-back) with per-batch durations, outcome counts and read-back, user agent (and `userAgentData` where present), viewport, `deviceMemory`/`hardwareConcurrency`, peak JS heap via `performance.memory` and long tasks via `PerformanceObserver('longtask')`. Unsupported metrics are the string `"unavailable"`, never 0. No build identifier reaches the browser, so the operator supplies the evaluated commit.
- **`npm run pdf:report`** (`scripts/pdf-benchmark-report.mjs`):
  - `record` combines a run record with the cell metadata. It reads the import's persisted recipes owner- and import-scoped through a new read-only service-role RPC. It scores them with the existing `scoreFixture` (blocking tier) and `evaluateRecipes` (reported tier), and reads tokens, cost and the F-01 snapshot. The result is a private 0600 cell file under the ignored `local/benchmark/`.
  - `budget` and `record-rejection` prove zero spend for the negative inputs.
  - `report` (default) exits nonzero unless all 8 cells exist exactly once on one commit/config against the deployed target. Each cell needs the approved fixture hash, a committed import with read-back, a passing blocking tier, saved = golden count, existing 0, elapsed ≤ 300 s, no held charge, a matching browser/device class and no zero memory value. Both rejection checks must pass and F-01 spent + held ≤ USD 7. It prints max/mean elapsed and confirmed versus held cost.
- **F-01 carry-over** (migration `20261008090000_pdf_processing_f01_carryover.sql`, `npm run pdf:carry-over-f01`), described below.
- **Benchmark read RPC** (migration `20261008100000_pdf_processing_benchmark_read.sql`): `get_pdf_import_recipes(owner, import)`, service role only, read-only. The service role still has no table grant on `recipes`.
- **Negative limits:** a new service test proves that a create request over 20,000,000 bytes or over 115 pages is rejected before token counting, any RPC or any fetch (zero dispatches), with an at-limit control. The browser reader tests already proved rejection before the PDF loads or any page text is read.

### F-01 carry-over design

The cumulative F-01 ledger exists only in the local Supabase. Production has none of it, so its `f01` scope would otherwise start at zero and overstate the remaining budget.

- `pdf_budget_carryovers` has one row per scope (primary key, `scope_key = 'f01'` only) with the carried spent and held amounts, the source limit, a SHA-256 evidence digest, and the remote spent/held *before* the carry-over. RLS is enabled and all table privileges are revoked from every API role.
- `carry_over_pdf_f01_budget(spent, held, source_limit, evidence_digest)` is `security definer` with an empty `search_path`, fully schema-qualified, and executable only by `service_role`. It creates the `f01` scope with the standard USD 7 default if absent, locks it, and adds the carried spent to `spent_nano_usd` and the carried held to `held_nano_usd`. It never subtracts and never touches another scope. The existing `spent + held ≤ limit` check and an explicit check refuse overflow. An identical replay returns `applied = false` without changes; any different second carry-over raises `carry-over already applied`.
- After the carry-over, remote available = limit − remote spent − remote held − local spent − local held. The carried hold has no reservation of its own, so it stays held: fail-closed, distinguishable from confirmed spend in `spent`/`held`, and recorded separately in the carry-over row.
- The CLI reads the local snapshot (`localSupabase`/`readBudget`) and targets the remote only through explicit `PDF_TARGET_SUPABASE_URL` + `PDF_TARGET_SUPABASE_SECRET_KEY` (HTTPS, loopback refused). It is a dry run unless `--apply` is given, prints numbers and IDs only, and writes a private evidence file under `local/carry-over/`.
- Isolated DB tests check service-role-only access, input validation, exact arithmetic, once-only behaviour with an idempotent replay, and untouched month/import scopes.

### Offline verification (this step)

- `npm run test:pdf`: **103/103 pass** (new benchmark/carry-over tests and the zero-dispatch limit test included).
- `npm run test:pdf:db` (isolated project): **22/22 pass**, including the two new tests for the carry-over and the benchmark read.
- `npx --no-install astro check`: 0 errors / 0 warnings / 0 hints. ESLint is clean on every touched file.
- `npm run pdf:report` on the empty benchmark directory exits 1 and lists all 8 cells and both rejection checks as missing, as intended.
- The full gate stack for the evaluated commit (6.2) is not claimed here; it runs on the merged commit before deployment.

### Matrix status

| Cell | Status |
| --- | --- |
| summer / Chrome / desktop | not run |
| summer / Chrome / phone | not run |
| summer / Firefox / desktop | not run |
| summer / Firefox / phone | not run |
| lunchboxy / Chrome / desktop | not run |
| lunchboxy / Chrome / phone | not run |
| lunchboxy / Firefox / desktop | not run |
| lunchboxy / Firefox / phone | not run |

### Acceptance items

| Item | Status |
| --- | --- |
| 6.1 `pdf:report` validates 8 cells, identity, persisted-content comparison, ≤ 300 s, F-01 ≤ USD 7 | tooling implemented and tested offline; **not run** (no cells) |
| 6.2 offline/DB/auth/deployment/build checks on the evaluated commit; zero-dispatch negative limits | negative-limit tests pass; full stack **not run** on an evaluated commit |
| 6.3 real-phone Chrome/Firefox, both ebooks | **not run** (user) |
| 6.4 Cloudflare CPU/outcomes, desktop evidence, network inspection | **not run** (user) |
| 6.5 supported F-01 verdict and S-02 handoff | **pending** |
| Rejection of > 115-page and > 20 MB files with zero AI tokens | offline: pass; deployed: **not run** |
| F-01 history carried to production | migration + CLI ready; **not applied** |

Known failures carried forward: none new. The superseded failed gates 4.9/4.13/4.16/4.18 stay as recorded above.

### Current passing configuration (from 4.20)

`gpt-5.4-mini` via Responses API (`responses-v1`), `store=false`, strict JSON schema `pdf_recipe_candidates_v2`, `reasoning.effort=medium`, `max_output_tokens` 16,384, input cap 98,304 tokens, standard pricing USD 0.75 / 4.50 per million (`standard-2026-10-03`), maximum reservation 147,456,000 nano-USD per call, provider deadline 120 s, import processing deadline 270 s, end-to-end bound 300 s, one paced 429 retry under a new reservation, F-01 USD 7, USD 0.50/import, USD 10/month, 20,000,000 bytes, 115 pages, up to 8 core pages per batch. 4.20 ran at commit 3d72e8d with run config digest a1cf3030…. Later commits changed only persistence, the screen and the ledger guards, not the extraction configuration. The benchmark records its own `runtimeConfiguration` digest (model, API, pricing, limits, prompt and schema digests) for the evaluated commit.

### Reuse points for S-02 / S-03

- Browser reader `src/lib/pdf-processing/browser-reader.ts` (PDF.js, local hashing, limits) and batch builder `batching.ts`/`manifest.ts`, including `batchFromManifest`.
- Server pipeline `service.ts`: create (server-rebuilt manifest and digests), batch (reservation → dispatch → reconciliation → validation → recorded digests), finalize (digest-checked, atomic, deduplicating by owner + fingerprint + source start), status and cancel.
- Provider adapter `openai.ts`, prompt/schema `prompt.ts`, validation and normalization `validation.ts`/`normalize.ts`, categories and reconciliation.
- Ledger and budgets (migrations 2026-09-30…2026-10-07), the `recipes` table with owner-only RLS reads, and `persistence.ts`.
- Evaluation tooling: `pdf:acceptance` (blocking/reported tiers), `pdf:evaluate`, `pdf:report`.

### Remaining product integration (not done by F-01)

- S-02: the real dashboard import flow for all users (no evaluator allowlist or feature switch), the production UX for progress, errors and incomplete results, and moving the monthly USD 10 scope from test to product use.
- S-03: keep/discard of incomplete results; S-04–S-07: browsing, filtering, editing and deleting recipes.
- Retiring or gating the evaluation screen and the evaluator accounts after F-01, and a decision on the held USD 0.147456 (4.18 timeout), which stays held without billing evidence.

## Migration consolidation (2026-10-06)

Production had received no migration yet, so the user approved replacing the nine F-01 migrations with one file, `supabase/migrations/20261008120000_pdf_processing.sql`. There is no behavior change.

- `npm run test:pdf:migration` PASS. It applied the nine files from f1cdd0b and the single file to two separate fresh isolated projects. pg_dump, functions (definition md5, ACL, security definer, config), tables, columns, constraints, indexes, triggers, policies, RLS, default privileges and table rows were all identical: 18 functions, 11 tables, 1 policy, 94 constraints, 17 indexes, 1 trigger, 104 columns. A negative control (one changed function character plus one extra grant) failed as expected.
- Local evaluation ledger: backed up privately to `local/db-backup/`, brought to the full nine-migration schema (`migration up`), and compared read-only with the consolidated schema: identical. Only its history was repaired (nine versions reverted, 20261008120000 applied). It was not reset. F-01 is unchanged: spent 4,228,657,500, held 147,456,000 nano-USD. The ledger still holds 47 imports and 5 recipes.
- Gates: PDF 103/103, isolated DB 22/22 on the single migration, lint, Astro check, build, check:deploy production and deploy-config 8/8 all pass.
- Migration file names cited in earlier sections are historical; the originals remain in git.

## Phase 6 — final measurement and F-01 verdict (2026-10-07/08)

Deployed: commit `37f690e831ee7790e3287127cc0cf891d677dd23`, dishly-web version a1167ab6 (secrets applied on top of 5fecf473), production Supabase with the consolidated migration and the carried-over F-01 history (evidence digest da0a5558…). Model `gpt-5.4-mini`, Responses API, reasoning medium, 120 s provider deadline. The first-iteration matrix is desktop Chrome only (amendment 2026-10-08). One dedicated clean evaluator account was used per cell.

### Matrix (`npm run pdf:report`: ok=true)

| Cell | Result | Elapsed (read / recognize / save) | Saved | Blocking tier | Reported diffs | Tokens in/out | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| summer / Chrome 152 / Linux desktop | PASS | 105.4 s (1.8 / 103.0 / 0.6) | 4/4, read back | PASS | 11 | 169,274 / 18,482 | USD 0.2101245 |
| lunchboxy / Chrome 152 / Linux desktop | PASS | 56.6 s (0.15 / 56.0 / 0.5) | 5/5, read back | PASS | 5 | 51,009 / 8,679 | USD 0.07731225 |

Maximum elapsed 105.4 s, mean 81.0 s (limit 300 s). Browser: 0 long tasks, JS heap ≤ 52 MB; the user attested responsive with no crash. Rejections: the 125-page file failed with `too-many-pages` and the 20,000,001-byte file with `file-too-large`. Neither created an import or made a request to the import API, and the F-01 ledger did not change.

### Cloudflare (Workers Free) — `wrangler tail`

All invocations in both runs had outcome `ok`, with no `exceededCpu`, exception or application log line. CPU per request in ms, summer / lunchboxy:

| Request | Summer | Lunchboxy |
| --- | --- | --- |
| create | 73 | 24 |
| batch 1 | 47 | 26 |
| batch 2 | 53 | 17 |
| finalize | 11 | 9 |

Every import request except one exceeds the 10 ms Workers Free limit (lunchboxy finalize, 9 ms, is the exception). It currently runs within Cloudflare's tolerance. This is not evidence that Free is sufficient. The user accepted it as a first-iteration risk (amendment 2026-10-08), and Workers Paid is parked in the roadmap. Any `exceededCpu`/1102 reopens the decision.

Network inspection in desktop Chrome DevTools (user): the PDF was not uploaded (JSON requests only), the browser made no request to api.openai.com, and no credentials appeared.

### Spend

Matrix USD 0.28743675. F-01 cumulative: spent **USD 4.51609425**, held **USD 0.147456** (the 4.18 timeout, carried over), available USD 2.33644975 of USD 7.

### Acceptance items

| Item | Status |
| --- | --- |
| 6.1 `pdf:report` | PASS (2 required cells, rejections, ≤300 s, budget, identity) |
| 6.2 offline/DB/deploy checks | PASS (2bd26b9) |
| 6.3 real-phone Chrome/Firefox | **Deferred, not run** (amendment 2026-10-08; roadmap Parked) |
| 6.4 Cloudflare CPU/outcomes, desktop evidence, network | PASS with accepted risk (Workers Free CPU above limit, outcomes ok) |
| 6.5 verdict and handoff | This section |

### F-01 verdict — GO for the first iteration (desktop Chrome)

The local reading → backend → OpenAI → validation → atomic save path works on the deployed stack for both accepted ebooks. All expected recipes were saved with correct ingredients and metric amounts, in at most 105 s, within budget. Limits reject oversized input at zero cost. The verdict is scoped: Firefox and phone import are not verified, and Workers Free is an accepted risk, not a proven fit. Both are open conditions for later iterations, not passes.

Exact passing configuration: commit 37f690e, `gpt-5.4-mini`, reasoning medium, max output 16,384 tokens, input cap 98,304, provider deadline 120 s, import deadline 270 s, end-to-end bound 300 s, F-01 budget USD 7, USD 0.50 per import, USD 10 per month, normalization and validation rules as of 4.19.

### S-02 handoff

Reusable components:
- `browser-reader.ts`/`reader-core.ts` (PDF.js, limits, layout)
- `batching.ts`/`manifest.ts` (shared batch builder, input digests)
- `openai.ts`/`prompt.ts` (bounded adapter, 429 handling)
- `validation.ts`/`normalize.ts`/`categories.ts`/`reconcile.ts`
- `budget.ts`/`import-state.ts` plus the ledger RPCs
- `persistence.ts`/`service.ts` plus the `recipes` table and finalize RPC
- the four API routes

Remaining product work:
- S-02: the dashboard import flow replaces the restricted evaluator screen, so the allowlist/enable switch must be replaced by product access rules and a monthly budget.
- S-03: keep/discard handling for incomplete results.
- Later: Firefox/mobile verification and the hosting decision.

The carried-over hold of USD 0.147456 (the 4.18 provider timeout) has no reservation row in production, so no RPC can release or reconcile it. It is accepted as a permanent, fail-closed hold that reduces F-01 headroom. It may be resolved later only from OpenAI billing evidence, in a separate change (user decision, review F7).

The evaluator screen stays enabled at the user's request (only the 8 evaluator accounts can use it). Saved recipes and accounting are retained.
