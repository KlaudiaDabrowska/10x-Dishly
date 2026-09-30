# F-01 evaluation record

Date: 2026-09-30. State: Phase 1 offline preparation; **live execution blocked pending prerequisites**.
This is a prerequisite/evidence record, not an extraction benchmark or a successful F-01 verdict.

## What was actually checked

- The three local originals were hashed and counted with Poppler: 16, 12 and 113 pages. Full expected results were prepared for summer/pasta and visually compared with all nine recipe pages.
- Golden review status: awaiting the user's independent check. See [fixtures.md](fixtures.md) for local review links and hashes in the manifest.
- Available local tooling: Node 24.18.0, npm, pdfinfo, pdftotext and pdftoppm.
- Desktop Chrome: Google Chrome 152.0.7977.75. Firefox executable was not found locally. No browser import benchmark was run.
- A presence-only check found no GEMINI_API_KEY or GOOGLE_API_KEY in the process environment, .env, .env.local or .dev.vars. Secret values were not printed. This does not assert that no credential exists elsewhere.
- No authenticated model metadata request, billing-console inspection, generated content, remote schema inspection or paid call was made.

## Automated verification

- PASS: npm run pdf:fixtures on the three actual local PDFs and both draft references; human review remains pending.
- PASS: npm run test:pdf (11 tests). The deliberate-break check changed the inclusive 20 MB boundary to exclusive, observed the expected failing test, and restored the staged file before re-running successfully.
- PASS: npm run test:deployment (12 tests), npm run test:deploy-config (7 tests), npm run lint and astro check (zero errors/warnings/hints).
- PASS: npm run build and npm run check:deploy -- production. Build retains the existing sitemap warning about the missing site setting.
- PASS: existing auth smoke (27 steps) against the built local Worker and local Supabase, with runtime bindings explicitly set to the loopback database. Two local test accounts were created. The temporary Worker was stopped; the existing Supabase instance was left running. No deployment was performed.

## Prerequisites and owners

| Requirement                                  | Evidence/status                                                          | Next evidence needed                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Original files and local golden drafts       | Available, hashes pinned                                                 | User approval of both golden references                                                               |
| Accepted model on the actual account         | Unverified; credential unavailable here                                  | Supply key through ignored local configuration, then record authenticated models.get/list result      |
| Paid billing and project identity            | Unverified                                                               | User confirms the key's project has Paid billing; record confirmation without payment details/secrets |
| generateContent/schema/configuration support | Documentation supports the selected contract; account execution untested | Ledger-backed bounded synthetic smoke after Phase 3                                                   |
| Desktop Chrome/Firefox                       | Chrome present; Firefox missing                                          | Arrange current Firefox for Phase 6 and record actual tested versions                                 |
| Real phone Chrome/Firefox                    | User agreed to run both; device/OS unknown                               | User identifies phone/OS and later records actual versions/results                                    |
| Actual Cloudflare CPU/latency                | Not measured for this path                                               | Phase 6 on authorized deployment                                                                      |
| Durable spend controls                       | Not implemented in Phase 1                                               | Phase 3 transaction/concurrency tests before paid calls                                               |

Offline work may continue while these are pending. Do not mark Progress 1.4 complete from documentation alone.
Unavailable model access stops the live branch and requires a separate model decision; there is no automatic fallback or hosting upgrade.

## Provider contract and current public evidence

Accepted provider remains Google Gemini Developer API Paid, model `gemini-2.5-flash`.
The [model page](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash), checked 2026-09-30, lists structured output/thinking support and limits of 1,048,576 input / 65,536 output tokens.
The [lifecycle page](https://ai.google.dev/gemini-api/docs/deprecations), checked the same day, restricts 2.5 access to previous active users; this is not proof that this project's account has access.

Pin `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.
The [generateContent reference](https://ai.google.dev/api/generate-content) documents contents, systemInstruction, generationConfig and usageMetadata. Accounting must distinguish promptTokenCount, candidatesTokenCount and thoughtsTokenCount.
Do not copy Interactions-specific fields from current generic examples. Read-only [models.get](https://ai.google.dev/api/models) can establish the advertised account-visible model metadata, but not Paid billing or successful structured generation.
No source PDF/text is needed for that metadata lookup.

## Pricing snapshot and monetary bounds

The [Standard Paid pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash), checked 2026-09-30, lists USD 0.30 per million text-input tokens and USD 2.50 per million output tokens, including thinking.
These are public list prices, not a verified account invoice. This experiment excludes audio, grounding, context caching and provider Batch/Flex/Priority services.

The plan's per-call safety configuration is 32,768 counted input tokens, one candidate, 8,192 maximum output tokens and 1,024 thinking tokens. Model-specific thinking/output-limit interaction remains a required smoke assertion.
The conservative reservation at this snapshot, counting output plus thinking separately for safety, is USD 0.0328704 = 32,870,400 nano-USD.
This is a maximum configured-call illustration, not measured ebook usage; request schema/instructions count toward input.

Reserve before every paid dispatch. F-01 total is USD 5 across all smoke/tuning/final runs; per-import cap USD 0.50. Later application mode uses USD 10 per UTC calendar month, shared across users.
Unknown charges remain held/accounted for. A timeout, tab close, redeploy or month change must not create free capacity for an uncertain F-01 call.

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

1. User-approved golden summer/pasta results and exact approved hashes.
2. Account-visible accepted model plus Paid billing confirmation.
3. Planned real phone/OS and availability of both required browsers.
   The later benchmark, extraction quality and F-01 verdict are not yet run.
