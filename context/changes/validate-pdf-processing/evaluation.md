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
