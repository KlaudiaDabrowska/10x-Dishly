# PDF import: accepted browser + backend + AI flow

Flow accepted by the user on 2026-09-23; provider, budget and processing terms accepted on 2026-09-28. Implementation and feasibility verification are pending.

## Product contract

The [PRD](../foundation/prd.md) remains the source of truth: selectable-text PDFs, at most 20 MB and 100 pages, private recipes, automatic saving of complete results, keep/discard for detected incomplete results. Each representative import within the accepted file limits must finish within five minutes from local text reading through AI processing and confirmed saving, excluding file selection and user decisions. This is a requirement, not a measured result.

The original PDF stays on the user's device. The app sends extracted text with necessary layout/column/page context through the authenticated backend to the AI provider. Temporary application-held input is released after success, failure or cancellation; the original local file is never deleted. Provider retention is separate from application cleanup and follows the accepted decision below.

## Responsibilities

1. **Browser:** validate local size/page/text-readability constraints; read text page by page, retaining column boundaries and 1-based PDF page numbers; show progress for reading, recognition and saving. Keep the tab open until completion. No scanned-PDF/OCR support is added.
2. **Backend:** authenticate the user; enforce independent payload, request and import limits; treat browser-supplied metadata as untrusted; send bounded text batches to AI; store provider credentials server-side. Local file-limit checks are not a substitute for backend request/cost limits.
3. **AI provider:** identify recipes, titles, ingredients, instructions, variants and an allowed meal category from source text. It must not invent missing content, treat shopping lists as recipes, choose the owner or write to the database.
4. **Validation/persistence:** ordinary backend code checks required fields, permitted categories and references to supplied pages, binds ownership to the verified session, and performs idempotent writes. Complete validated recipes save automatically; detected incomplete ones await keep/discard. Full extraction failure saves no result. Counts report confirmed writes, not proposed model output.
5. **UI:** report saved and pending counts without claiming every source recipe was found; expose detected omissions. Later editing/deletion and filtering do not require model calls.

The summer ebook acceptance example is four recipe cards, each preserving three labelled ingredient-quantity variants and shared instructions. This does not introduce calorie calculations, portion conversion or dietary filters.

## Accepted provider and budget — 2026-09-28

Google Gemini Developer API Paid, model `gemini-2.5-flash`; USD 5 total for F-01 validation, then USD 10 per month for AI and USD 0.50 per import. Prompts and responses are not used to improve Google products; the accepted abuse-monitoring retention is 55 days, subject to provider policy and legal obligations. This is not zero data retention.

- Local reader: PDF.js; preserve text positions, columns, variants and 1-based source pages. Model output uses a structured schema; backend checks remain mandatory.
- Budget enforcement: reserve the maximum bounded call cost before dispatch, including concurrent requests, output/reasoning tokens and retries; reconcile actual usage and stop new calls when the remaining budget is insufficient. The USD 10 monthly limit is shared across the application, not per registered user.
- Privacy: no raw recipe text or full responses in application logs; release temporary application data after completion, failure or cancellation. Explain text transfer and the separate 55-day provider retention to users. Provider abuse monitoring may include authorized human review; this decision does not promise EU-only processing.
- Cost illustration only: 50,000 input tokens plus 20,000 billable output tokens at USD 0.30 / USD 2.50 per million cost USD 0.065, excluding additional tokens, retries, taxes and infrastructure. Actual ebook usage must be measured.
- This accepts a paid-provider choice within the stated budget. No billing setup, secrets, deployment or live ebook processing was performed by recording it.

Sources checked during research on 2026-09-28:

- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini terms](https://ai.google.dev/gemini-api/terms) — paid-service data use and EEA application availability.
- [Abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies) — 55-day retention.
- [Model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [PDF.js text API](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## Remaining verification

- Implement the accepted provider/model and spending controls; prepare the user-facing explanation of text transfer. Q4 is resolved, but this does not prove feasibility or complete F-01.
- Verify extraction quality with source comparisons, starting from the three inspected ebooks: columns, quantities, units, variants, source pages, missed/duplicated recipes and editorial-page exclusion. The 113-page ebook is an analysis fixture outside the accepted product limit; raising that limit remains a proposal.
- Use the three representative ebooks accepted on 2026-09-28: summer and pasta for full import with confirmed persistence; the 113-page book for layout analysis and rejection at the unchanged page limit. The earlier 50-recipe count was approximate, not a required separate fixture. Local text extraction speed is not evidence for AI quality or end-to-end performance.
- Measure browser memory/responsiveness on desktop/mobile and backend CPU, response validation, network/provider latency and total processing time. Assess actual deployment limits before assuming the Free plan is sufficient.
- Define bounded requests, timeouts and retry behavior. A retry must not create duplicate recipes or uncontrolled repeat AI charges. Reconcile confirmed writes after interruptions; closing the tab does not guarantee cancellation of already submitted provider calls.
- Test private access with two accounts, complete failure, detected incomplete results, invalid model responses and provider unavailability. Structured output alone is not an accuracy guarantee.
- Avoid raw recipe text, provider credentials or full responses in operational logs. Keep temporary application data only for processing and decisions; provider-side retention follows the accepted terms above.
- Choose request/job mechanics during implementation planning. Users are required to keep the tab open; continuing the import after closing it is not promised. Existing queue infrastructure does not impose the old PDF upload protocol.

## Relation to the deployed diagnostic and prior research

The existing Workers Free diagnostic transports and deletes a fixed marker in R2/Queues. It performs no user PDF parsing, AI extraction or recipe writes. Its deployment remains intact and its measurements are not product-import benchmarks.

This accepted flow supersedes the previous requirement to upload original PDFs into R2 and parse them in a server-side Queue consumer. Paid parsing-runtime selection, the proposed CPU override and a mandatory 20-PDF server-parser benchmark are no longer prerequisites of this design. Existing diagnostic cleanup/retry behavior remains specific to that diagnostic; it must not be reused as evidence that a user import succeeded.

No billing, resource, deployment, secret or source-code changes are performed by recording these documentation decisions.
