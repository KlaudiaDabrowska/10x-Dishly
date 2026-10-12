---
date: 2026-09-28T20:50:12Z
researcher: Codex
git_commit: 364060cec7a3c27344be4cdab2c0fbce63831298
branch: main
repository: 10xdevs
topic: "F-01 validate-pdf-processing: existing capabilities and feasibility evidence"
tags: [research, codebase, pdf, gemini, cloudflare]
status: partial
last_updated: 2026-10-04
last_updated_by: Codex
last_updated_note: "Added Jev/TypeSafe assessment against the current extractor; documented conditional fit, evidence gaps and superseded provider/page-limit findings"
---

# Research: validate-pdf-processing

> Historical snapshot: the original sections describe 2026-09-28. The 2026-10-04 Jev follow-up below updates the provider, implementation and fixture-limit findings without rewriting that history.

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

## Follow-up: could Jev improve PDF recipe extraction? — 2026-10-04

**Observed metadata:** 2026-10-04T15:28:47Z; researcher Codex; repository `10xdevs`; branch `validate-pdf-processing`; HEAD `b0fefdbd5ff67623be4894cdf37a5ef182dd06e6`. Code references below describe the dirty working tree, not necessarily that commit. Scope: documentation and existing evidence; no Jev inference, implementation changes or paid calls during this follow-up.

### Answer and evidence boundary

Jev by TypeSafe AI is **not a drop-in replacement for the current complete-recipe extractor**. Its documented decision primitives can help select existing source fragments or classify blocks, but replacing the current provider would require a different extraction pipeline. Whether that improves exact agreement with the approved golden is unmeasured on our Polish PDFs. Recommendation: retain the current provider decision while evaluating a narrowly scoped source-selection approach, if a later experiment is authorized. This research does not authorize migration or spending.

The current contract requires source anchors, arbitrary source strings and variable-length ingredient groups, instructions and notes (`src/lib/pdf-processing/contracts.ts:74`). Strict schema output is already enabled (`src/lib/pdf-processing/openai.ts:66`). Therefore an additional type guarantee alone does not establish source accuracy. Acceptance remains exact golden comparison with the evaluator's whitespace normalization (`scripts/pdf-evaluate.mjs:20`, `:57`, `:165`); a model confidence score cannot replace it.

### Documented capabilities and constraints

The public API exposes Choice (select an option), Score (evaluate a rubric) and Noul (estimate a statement's truth). These are decision outputs, rather than arbitrary generated recipe JSON. [Introduction](https://docs.typesafe.ai/introduction). Choice permits at most 255 options; source identifiers can be options that application code resolves back to text. [Choice reference](https://docs.typesafe.ai/primitives/choice).

As inspected on 2026-10-04, `jev-1.13.0` accepts text, not PDF binaries or page images. Its limits are 64k tokens for the whole request and 32k for state plus the longest question. English is its strongest language; Polish accuracy requires our own measurement. The browser reader and spatial reconstruction therefore remain necessary. Different tokenizers prevent treating existing OpenAI counts as exact Jev counts. [Models](https://docs.typesafe.ai/models).

The provider documents unreliable precise numeric reasoning, sensitivity to irrelevant context and option ordering, and absence of text-generation training. It recommends generating candidates separately and using Jev to choose among them. This limits any assumption that switching models fixes quantity or unit errors. [Jev 1.13 limitations, reviewed 2026-10-02](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

The launch's hallucination guarantee concerns the bounded output/type space, not empirical correctness of a selected recipe fragment. An allowed answer can still select the wrong source. Vendor speed/cost comparisons do not establish end-to-end performance on our fixtures. [Launch explanation](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

### Applicable extraction patterns

- **Select and copy existing values.** The official example finds candidate values with code, lets Jev select one, then copies the original text. This could reduce rewriting of measures, provided candidate detection and selection are correct. A missing candidate cannot be recovered through selection alone. [Pre-parsed extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook).
- **Recover structure.** An official example judges adjacent-line joins and classifies resulting blocks; application code renders the retained text. This suggests title/ingredient/instruction/note labels for our pipeline. Its demonstration is a plain-text memorandum, not evidence for multi-column recipe PDFs or ingredient variants. [Structure recovery](https://docs.typesafe.ai/cookbooks/autoformat), retrieved through Context7; direct page retrieval failed in this session.
- **Verify another extractor.** The official cascade uses `gpt-5.4-mini` for extraction, Jev for field checks and a stronger generative model for corrections. It supports an auxiliary role. Its vendor experiment and deliberately reproducible demonstration errors do not measure our golden accuracy. A verifier also adds calls and can miss errors. [Extraction verification cascade](https://docs.typesafe.ai/cookbooks/sde_cascade).

For the inspected pasta attempt `403bc33a-7139-4f78-b9a2-8bb8ce56a3c4`, all five titles were retained; the report records 25 quantity, 29 unit, four category and five source-category differences, while sourceText, instructions, notes and servings matched (`evaluation.md:204`, `:209`). **Inference:** testing deterministic separation of measures from already-correct sourceText is a useful baseline before adding another model. This does not prove such a parser handles every format. Explicit category headings already have deterministic mappings (`src/lib/pdf-processing/categories.ts:11`).

### Cost, integration and data handling

The inspected Jev price is USD 0.042 per million input tokens, with free output. For an illustrative **aggregate** 100,000 billable input tokens across requests that each fit the context limits, this is USD 0.0042. It is not a full-ebook estimate: questions, repeated context and correction calls depend on the eventual pipeline. [Pricing and model limits](https://docs.typesafe.ai/models).

TypeSafe requires its own account/API key. [Quickstart](https://docs.typesafe.ai/introduction/quickstart). Integrating its endpoint and usage fields requires a separate adapter and reservation/reconciliation behavior, not changing the model name in the existing request. The current dispatch/accounting path is provider-specific (`src/lib/pdf-processing/openai.ts:319`). Question-map keys are not passed to the model, so any future source-identification instructions must be explicit in question content. [API reference](https://docs.typesafe.ai/api).

The privacy policy commits not to train on submitted input and describes US hosting. Its general retention provision gives no fixed duration for a standard account. [Privacy policy](https://typesafe.ai/legal/privacy-policy). Enterprise zero-retention arrangements are separately offered; no-training is not equivalent to no-retention. [Legal documentation](https://docs.typesafe.ai/legal). A future provider decision must address this difference from the currently accepted integration.

### Current fixture readiness and historical corrections

- **Earlier Gemini selection: superseded.** The accepted provider is OpenAI `gpt-5.4-mini` (`provider-decision.md:1`, `:17`). This Jev assessment does not change that decision.
- **Earlier absence of an extractor/accounting path: superseded.** Current implementations exist in `src/lib/pdf-processing/openai.ts:66`, `:319`; quality remains failing in the cited pasta attempt. Existence and quality are separate findings.
- **Earlier 100-page rejection of low-gi: superseded in the edited reader, implementation verification still partial.** The user authorized 115 pages and selected low-gi instead of summer. The working tree has `maxPages: 115` (`src/lib/pdf-processing/limits.ts:4`). The fixture has 113 pages and pending-reference status (`evaluation/validate-pdf-processing/manifest.json:29`). Private built-reader evidence at `evaluation/validate-pdf-processing/local/reader-low-gi/4661d499-a630-40d2-aea5-8e451d43a830/summary.json` records a successful 712.8 ms read and 15 batches. This is desktop reading evidence, not successful extraction, mobile performance or completed limit rollout.
- **Golden readiness: unresolved for low-gi.** Its manifest reference path/hash are null (`evaluation/validate-pdf-processing/manifest.json:35`). The review harness blocks unapproved references (`scripts/pdf-extract-review.mjs:86`). Existing approved references do not automatically cover this newly selected document.
- **Budget constraint: still applicable.** For the current OpenAI configuration, reserving 15 calls at the per-call ceiling USD 0.110592 requires USD 1.65888, above the accepted USD 0.50/import (`provider-decision.md:23`; `scripts/pdf-extract-review.mjs:199`). This is a conservative reservation, not measured cost. Jev's price does not authorize increasing existing caps.

### Conditional experiment and planning handoff

A useful future comparison would keep identical source text and independently approved golden, then compare the existing extractor, deterministic source parsing, and Jev-assisted source selection. Start with representative pasta errors and a reviewed low-gi subset covering columns, measures, headings and continuations. A subset result cannot establish acceptance for the full ebook. Keep golden out of runtime candidate generation; candidates must derive from the supplied document.

Measure exact final recipe equality, missing/extra recipes, wrong span selection, latency and total billed workflow cost. For verifier experiments, also measure incorrect outputs that the verifier approves. Preserve source anchors and original text; uncertain classification must not silently drop possible recipes. Pin the tested model version and repeat with reordered options to expose decision sensitivity.

Unresolved evidence: Jev quality on these Polish sources, reliable candidate segmentation, actual total workflow cost/time, and an independently approved low-gi golden. These gaps prevent a superiority claim. Documentation research is complete for this question; overall research status remains partial because empirical feasibility is still unproven. Parallel read-only investigations covered official capabilities and repository fit; the primary agent checked decisive contracts, provider request, evaluation evidence, pricing and privacy. This follow-up changes only research documentation; the metadata guard verified that change metadata already had the current date and required no edit.
