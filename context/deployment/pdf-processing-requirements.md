# PDF import: accepted browser + backend + AI flow

Decision accepted by the user on 2026-09-23. Implementation and provider selection are pending.

## Product contract

The [PRD](../foundation/prd.md) remains the source of truth: selectable-text PDFs, at most 20 MB and 100 pages, private recipes, automatic saving of complete results, keep/discard for detected incomplete results. The representative 50-recipe flow must finish within five minutes from local text reading through AI processing and confirmed saving, excluding file selection and user decisions. This is a requirement, not a measured result.

The original PDF stays on the user's device. The app sends extracted text with necessary layout/column/page context through the authenticated backend to the AI provider. Temporary application-held input is released after success, failure or cancellation; the original local file is never deleted. Provider retention is a separate unresolved selection criterion.

## Responsibilities

1. **Browser:** validate local size/page/text-readability constraints; read text page by page, retaining column boundaries and 1-based PDF page numbers; show progress for reading, recognition and saving. Keep the tab open until completion. No scanned-PDF/OCR support is added.
2. **Backend:** authenticate the user; enforce independent payload, request and import limits; treat browser-supplied metadata as untrusted; send bounded text batches to AI; store provider credentials server-side. Local file-limit checks are not a substitute for backend request/cost limits.
3. **AI provider:** identify recipes, titles, ingredients, instructions, variants and an allowed meal category from source text. It must not invent missing content, treat shopping lists as recipes, choose the owner or write to the database.
4. **Validation/persistence:** ordinary backend code checks required fields, permitted categories and references to supplied pages, binds ownership to the verified session, and performs idempotent writes. Complete validated recipes save automatically; detected incomplete ones await keep/discard. Full extraction failure saves no result. Counts report confirmed writes, not proposed model output.
5. **UI:** report saved and pending counts without claiming every source recipe was found; expose detected omissions. Later editing/deletion and filtering do not require model calls.

The summer ebook acceptance example is four recipe cards, each preserving three labelled ingredient-quantity variants and shared instructions. This does not introduce calorie calculations, portion conversion or dietary filters.

## Remaining decisions and verification

- Choose provider/model, spending limits, provider data-use/retention terms and the user-facing explanation of text transfer. No provider or paid plan was approved by acceptance of the flow.
- Verify extraction quality with source comparisons, starting from the three inspected ebooks: columns, quantities, units, variants, source pages, missed/duplicated recipes and editorial-page exclusion. The 113-page ebook is an analysis fixture outside the accepted product limit; raising that limit remains a proposal.
- Test the PRD's known 50-recipe case separately, including confirmed persistence. Local text extraction speed is not evidence for AI quality or end-to-end performance.
- Measure browser memory/responsiveness on desktop/mobile and backend CPU, response validation, network/provider latency and total processing time. Assess actual deployment limits before assuming the Free plan is sufficient.
- Define bounded requests, timeouts and retry behavior. A retry must not create duplicate recipes or uncontrolled repeat AI charges. Reconcile confirmed writes after interruptions; closing the tab does not guarantee cancellation of already submitted provider calls.
- Test private access with two accounts, complete failure, detected incomplete results, invalid model responses and provider unavailability. Structured output alone is not an accuracy guarantee.
- Avoid raw recipe text, provider credentials or full responses in operational logs. Keep temporary application data only for processing and decisions; select provider-side retention separately.
- Choose request/job mechanics during implementation planning. Users are required to keep the tab open; continuing the import after closing it is not promised. Existing queue infrastructure does not impose the old PDF upload protocol.

## Relation to the deployed diagnostic and prior research

The existing Workers Free diagnostic transports and deletes a fixed marker in R2/Queues. It performs no user PDF parsing, AI extraction or recipe writes. Its deployment remains intact and its measurements are not product-import benchmarks.

This accepted flow supersedes the previous requirement to upload original PDFs into R2 and parse them in a server-side Queue consumer. Paid parsing-runtime selection, the proposed CPU override and a mandatory 20-PDF server-parser benchmark are no longer prerequisites of this design. Existing diagnostic cleanup/retry behavior remains specific to that diagnostic; it must not be reused as evidence that a user import succeeded.

No billing, resource, deployment, secret or source-code changes are performed by this documentation decision.
