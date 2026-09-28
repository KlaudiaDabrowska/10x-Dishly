---
date: 2026-09-28T20:50:12Z
researcher: Codex
git_commit: 364060cec7a3c27344be4cdab2c0fbce63831298
branch: main
repository: 10xdevs
topic: "F-01 validate-pdf-processing: existing capabilities and feasibility evidence"
tags: [research, codebase, pdf, gemini, cloudflare]
status: partial
last_updated: 2026-09-28
last_updated_by: Codex
last_updated_note: "User accepted the three existing ebooks as representative; exact 50-recipe fixture requirement superseded"
---

# Research: validate-pdf-processing

## Research Question

What can F-01 reuse, what evidence exists for the accepted local PDF reading → authenticated backend → Gemini → validation flow, and what must planning resolve before feasibility can be demonstrated?

## Summary

The repository provides an Astro/React/Cloudflare runtime and Supabase authentication, but the inspected application does not implement PDF text extraction or AI recipe recognition. Its PDF-named queue handles a fixed diagnostic marker, not user documents (`src/lib/deployment-probe.ts:1`, `workers/pdf-consumer/index.ts:6`). F-01 is ready for planning, not proven feasible (`context/foundation/roadmap.md:70`).

Provider selection is settled: Gemini Developer API Paid, `gemini-2.5-flash`, USD 5 for F-01, then USD 10/month for application-wide AI and USD 0.50/import; accepted abuse-monitoring retention is 55 days, without product-improvement use of prompts/responses (`context/deployment/pdf-processing-requirements.md:23`). This research does not reopen that decision.

Material evidence gaps remain: the accepted representative ebooks still lack independently checked expected extraction results; no browser/AI/confirmed-save timing; no demonstrated concurrent budget enforcement. These are missing validation inputs and measurements, not negative feasibility results. Research status is partial for those gaps; the requested codebase investigation is finished. Roadmap state remains unchanged.

## Detailed Findings

### Runtime and integration boundaries

- `astro.config.mjs:11` selects server output; React and Cloudflare are configured at lines 13 and 17. `package.json:21` declares application dependencies but no direct PDF.js or Gemini SDK dependency. This is a manifest observation, not a statement about globally installed tools.
- Supabase cookies and user lookup already exist (`src/lib/supabase.ts:5`, `src/middleware.ts:27`). Reuse this session boundary. The inspected middleware protects `/dashboard` via its route list; a future processing API must explicitly reject absent `locals.user` before accepting text or spending money (`src/middleware.ts:4`, `src/middleware.ts:36`).
- The operations probe deliberately bypasses Supabase and uses a separate bearer token (`src/middleware.ts:12`, `src/lib/deployment-probe.ts:62`). It is not an example of user-owned import authorization.
- The dashboard is an empty collection shell (`src/pages/dashboard.astro:29`). The inspected `src/`, worker entrypoint and `supabase/` inventory contained no import endpoint, recipe persistence implementation or budget ledger. `supabase/config.toml:53` has empty schema paths; remote database state was not inspected.

### Diagnostic infrastructure is not extraction evidence

`src/lib/deployment-probe.ts:98` writes the constant declared at line 2. `consumeProbe` compares the stored contents to that sentinel at line 157 and deletes the object; `workers/pdf-consumer/index.ts:6` delegates to this diagnostic handler. Its success cannot establish recipe correctness or a successful import.

Useful patterns include bounded message validation, restricted object keys and allowlisted operational log fields (`src/lib/deployment-probe.ts:36`, `:42`, `:46`). Its treatment of an already-deleted object as success is justified by diagnostic semantics; copying that behavior to a charged AI job or recipe write would require a separate correctness argument (`src/lib/deployment-probe.ts:110`, `:155`).

The current deployment guard expects an exact secret/binding set and rejects a custom CPU limit (`scripts/check-deploy-config.mjs:6`, `:11`, `:14`, `:30`). A deployed Gemini integration must update the relevant configuration and verification contract deliberately. A queue concurrency setting does not enforce the accepted application-wide monetary limit.

### Fixtures and earlier measurements

Prior analysis records these documents in the local Pobrane directory (`context/foundation/pdf-import-review.md:7`):

- `LETNI-DZIEN-PROBNY.pdf`: the prior table records 16 pages and four preparation-heading pages; the analysis identifies recipe pages 7, 9, 11 and 13, each with three labelled ingredient variants and shared instructions (`pdf-import-review.md:11`, `:21`). These are the summer acceptance inputs, not proof of field-level AI accuracy.
- `MINI-E-BOOK-MAKARONOWY-2kbhp6.pdf`: the prior analysis records 12 pages and five recipe pages, with ingredients and preparation in separate columns (`pdf-import-review.md:13`, `:23`).
- `Niski indeks glikemiczny - niska waga.pdf`: the prior analysis records 113 document pages and 100 preparation-heading pages (`pdf-import-review.md:12`, `:22`). The full document exceeds the accepted 100-page product limit and is an analysis/rejection fixture, not an accepted successful import (`context/deployment/pdf-processing-requirements.md:44`).

A filename-only check of the documented Pobrane directory during this investigation confirmed those three filenames. Their bytes were not reread, hashed, benchmarked or sent to AI. Repository filename inspection located no checked-in PDF or extraction fixture; this does not establish absence elsewhere on the device.

The original PRD v4 used a 50-breakfast-recipe example. The user clarified during this research that 50 was approximate and accepted the three named ebooks as representative. PRD v5 records this correction at `context/foundation/prd.md:204`. A separate 50-recipe fixture is no longer required. Planning still needs manually verified expected results for the accepted documents; counting headings is insufficient.

The earlier 0.02–0.13-second readings are individual local Poppler runs, explicitly not browser, mobile or end-to-end timings (`context/foundation/pdf-import-review.md:17`). They remain evidence for readable text in those earlier inspections, not for the five-minute requirement.

### Performance, cost and temporary data

The accepted time bound is five minutes from local reading through confirmed saving, excluding selection and keep/discard decisions (`context/foundation/prd.md:142`). A test ending at valid JSON cannot claim this bound is met.

Historical live deployment notes record a homepage invocation at 14 ms CPU and later homepage/auth samples at 13–15 ms with successful outcomes (`context/deployment/deploy-plan.md:188`, `:192`). They are historical, not current measurements, and do not prove failure; they do undermine assuming sufficient Free CPU headroom. Re-profile the actual extraction/validation path before choosing a hosting change. No paid hosting decision follows from the accepted AI budget.

Budget reservations must cover concurrent calls and retries before dispatch (`context/deployment/pdf-processing-requirements.md:26`). Planning must define durable reservation/reconciliation, including uncertain outcomes after a timeout: lack of a response is not proof of no provider charge. A per-process variable would not establish a shared cap across Worker instances. No implementation of this guarantee was found in the inspected runtime.

The accepted numerical illustration is USD 0.065 for 50,000 input plus 20,000 billable output tokens at the documented rates, excluding additional usage, retries, taxes and infrastructure (`context/deployment/pdf-processing-requirements.md:28`). It is not a measured ebook cost.

Temporary application input must be released after success, failure or cancellation while saved recipes remain. Provider retention is separate; closing a tab does not prove cancellation or deletion at the provider (`context/foundation/prd.md:167`, `context/deployment/pdf-processing-requirements.md:27`). Logging should carry IDs, status, timings and usage rather than raw text/model responses.

### External evidence and API-version caution

The preceding provider research is preserved with primary-source links in `context/deployment/pdf-processing-requirements.md:31`; its accepted choices are inputs here, not newly measured capabilities.

Context7 resolved the official Gemini documentation collection, but the focused query for Gemini 2.5 accounting returned examples for newer models and the Interactions API. Exa retrieval likewise showed the general [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) and [token guide](https://ai.google.dev/gemini-api/docs/tokens) using Interactions examples. Do not copy those request/usage fields uncritically into a Gemini 2.5 adapter.

The [generateContent reference](https://ai.google.dev/api/generate-content) separately documents `contents`, `systemInstruction` and `generationConfig`. Planning should pin the API path and verify the selected model's schema support, output/thinking limits, usage fields and truncation handling with a bounded smoke check. No authenticated provider call was made in this research. Structured output constrains representation; source comparison still determines recipe correctness (`context/foundation/prd.md:66`).

## Architecture Insights

Recommended planning boundary, not an implemented design:

- Keep original PDF bytes in the browser. Preserve page/block provenance and column structure before model extraction; do not use the R2 probe upload path.
- Separate browser reading, authenticated text intake, server-side model invocation, result validation and evaluation reporting. Page overlap needs deterministic source-based reconciliation so recipes are neither split nor duplicated.
- Preserve ingredient variants as separate labelled groups with shared instructions. Validate missing fields without inventing them; assign ownership from the verified session and validate page references against supplied input.
- Use an evaluation harness to compare expected recipes, quantities, units, variants and steps; report omissions, invented recipes and duplicates separately. Basic schema validity is not the quality metric.
- Keep F-01 evidence distinct from S-02 product integration. Record partial stage timings honestly until a confirmed-save path exists.

## Historical Context

The older PDF review's local-text observations and summer layout requirements remain relevant. Its statements that provider/cost selection remains open (`context/foundation/pdf-import-review.md:3`, `:41`, `:54`) are superseded by the accepted decision in `context/foundation/prd.md:170`.

The proposed 150-page limit in `context/foundation/pdf-import-review.md:49` was not accepted; the current contract remains 20 MB / 100 pages (`context/foundation/prd.md:110`). The marker deployment evidence remains valid for the diagnostic path, but its measurements do not validate extraction (`context/deployment/deploy-plan.md:188`).

No earlier research.md was located in the inspected active/archive filename inventory. Foundation and deployment documents supply the relevant prior research instead. `context/foundation/lessons.md` currently has its heading/intro without recorded lessons.

## Code References

- `src/middleware.ts:4` — protected route list; `:27` — authenticated user lookup.
- `src/lib/supabase.ts:5` — request-scoped Supabase integration.
- `src/lib/deployment-probe.ts:77` — diagnostic producer; `:138` — consumer semantics.
- `workers/pdf-consumer/index.ts:6` — diagnostic queue dispatch.
- `scripts/check-deploy-config.mjs:6` — exact provider-secret/configuration contract.
- `package.json:21` — declared dependencies.
- `context/foundation/pdf-import-review.md:17` — scope of prior timing evidence.

## Open Questions and Planning Handoff

1. **Validation input — selection resolved:** use the three named ebooks accepted by the user. Prepare independently checked expected results. Summer and pasta support full-import acceptance; the 113-page book supports layout analysis and limit rejection until a page-limit change is explicitly accepted. No separate 50-recipe document is needed.
2. **F-01 completion boundary:** roadmap lines 66 and 82 place product persistence integration in S-02, while the full performance contract includes confirmed saving. The plan must explicitly allocate a minimal real-save feasibility experiment or keep the full acceptance measurement pending for S-02; it must not claim the full requirement from extraction-only timing. Research has not changed this scope.
3. **Category ambiguity:** the older review proposes mapping second breakfast to breakfast and preferring source categories (`pdf-import-review.md:24`), but those detailed rules were not accepted as a PRD change. Define the deterministic policy during planning while retaining the four permitted categories.
4. **API/runtime evidence:** verify the chosen API/model contract, bounded request sizes, timeout/truncation behavior, actual token cost, browser/mobile memory and hosting CPU. Credentials, current account quotas and billing setup were not inspected.
5. **Spending and retries:** specify a shared reservation store and ambiguous-charge reconciliation before live experiments, consistent with the accepted budget; do not silently release a reservation on a timeout.

## Verification and Scope

Parallel read-only investigations covered runtime/auth/configuration and historical PDF/fixture evidence; the primary agent inspected decisive middleware, probe, configuration and prior-review sources. Working-tree changes present at start were AGENTS.md, PRD, roadmap and PDF requirements; existing edits were preserved, with the later fixture clarification applied narrowly to the relevant documents. Source anchors refer to the inspected working tree, not invented commit permalinks.

No implementation, deployment, live extraction, production data access, test run or paid inference was performed. The research artifact and metadata are in this new active change folder; the user's later fixture clarification also updates PRD, roadmap and PDF requirements. Missing empirical evidence is explicitly retained above; F-01 is not marked done.

## Follow-up: representative ebooks accepted

The user clarified that the three existing ebooks are representative and the initial “50 recipes” was approximate. This supersedes the initial research conclusion that a separate 50-recipe document must be located. PRD v5, the roadmap and PDF requirements were narrowly synchronized with that explicit correction. Expected-output preparation and empirical performance remain open; no PDF limit was increased and no live extraction was performed.
