# Validate PDF Processing — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md) · Phase 4 diagnosis: [frame-2026-10-03.md](frame-2026-10-03.md) · Acceptance reframe: [frame.md](frame.md)
> Six phases approved: 2026-09-30. Repair amendment: 2026-10-03. Acceptance-contract amendment: 2026-10-05.

## Provider amendment — 2026-09-30

User-approved OpenAI API replacement: [provider-decision.md](provider-decision.md). Ledger-backed synthetic generation passed; ebook accuracy has not passed. This supersedes the historical Google-specific provider/retention clauses.

## What & Why

F-01 will verify the complete local PDF reading → authenticated backend → OpenAI → validation → real-save path.
Its purpose is evidence that the accepted ebooks can become correct private recipes within five minutes and the agreed budget.
A restricted feasibility screen supports the experiment; S-02 still owns the finished product import experience.
Since 2026-10-05 the problem is framed as: the gate tested verbatim field equality, while the product needs recipes that are never lost and never carry wrong or foreign ingredients/amounts. Our own metadata gates still drop present recipes.

## Starting Point

Phases 1–3 are verified: approved goldens, local PDF reader and durable spending controls. Phase 4 has layout-preserving input, immutable evidence and deterministic normalization (4.1–4.8). Six exact-golden attempts failed. Lunchboxy repeat runs pass the product-relevant blocking tier 1/5; summer loses recipes mainly to contradictory metadata rejection. Spend USD 1.15 of 5. Persistence and the screen remain pending.

## Desired End State

An evaluator selects a local ebook, sees progress and obtains confirmed saved, already-existing and incomplete counts.
The saved recipes keep every source recipe with correct ingredients and amounts (summer: at least one complete variant); another account cannot read them.
A repeat of the identical PDF skips existing recipes without overwriting edits, and an evidence report determines readiness for S-02.

## Key Decisions Made

| Decision       | Choice                                                                                           | Why                                                                      | Source          |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------- |
| Real save      | Include minimal persistence in F-01                                                              | The five-minute measurement must include a confirmed write/read-back     | Plan: 1A        |
| Category       | Source wins; second breakfast → breakfast; AI only if unlabelled                                 | Preserve the author's classification                                     | Plan: 2A        |
| Acceptance | Blocking tier (all recipes, exact ingredient set, exact metric amounts) 3/3 runs per ebook; other field diffs reported | Product = good starting point for edits; users must not fix lost recipes or wrong amounts | User / Frame 2026-10-05 |
| Summer variants | Any one complete variant suffices; never mix variants | User decision 2026-10-05; PRD/roadmap updated accordingly | User |
| Validation | Contradicted/provenance-verified omission reasons and unlabelled groups become warnings; provenance stays strict | 2/5 lunchboxy failures and most summer losses were self-inflicted | Frame 2026-10-05 |
| Model config | gpt-5.4-mini, reasoning low, 16,384 output tokens (USD 0.147456/call); gpt-5.4 only after a failed 3+3 and user approval | Cheapest escalation first | User |
| Input cap | 98,304 tokens per call | Summer measured up to 97,329; monetary caps unchanged | User amendment 2026-10-03 |
| Fixtures | Summer + lunchboxy (pages 1–12) replace pasta/low-gi for acceptance | Simpler, user-approved golden | User 2026-10-05 |
| Mobile         | User tests Chrome and Firefox on a real phone in F-01                                            | Emulation does not establish real-device feasibility                     | Plan: 4A        |
| Reimport       | Skip saved source recipes for identical bytes on the same account                                | Avoid duplicates and preserve corrections                                | Plan: 5A        |
| Inputs         | Summer/pasta full imports; 113-page book rejection/local analysis                                | Use the accepted representative set and unchanged 20 MB / 100-page limit | Research / PRD  |
| AI | OpenAI API Paid, gpt-5.4-mini | User-approved replacement on 2026-09-30 | Provider amendment |
| Spending       | USD 6 total F-01 (raised from 5 on 2026-10-06); bounded imports; tested later USD 10/month global and USD 0.50/import controls | Reserve before dispatch, including concurrency and uncertain charges     | Research / Plan |
| Storage        | Supabase metadata/accounting and saved recipes; unsaved content in browser/request memory        | Reuse the stack and avoid retaining temporary input                      | Plan            |

## Scope

**In scope:** independent references, PDF.js reader, budget ledger, backend AI/validation, minimal private persistence, restricted screen and measured evaluation.
**Out of scope:** finished S-02 UI, S-03 keep/discard, browsing/filtering/editing/deletion, OCR, original-PDF upload, raised file limits, background completion and hosting/provider upgrades.
Full source-derived fixtures and immutable diagnostic runs remain private ignored local files; only synthetic examples, schemas and aggregate evidence enter the repository. No golden-driven output repair or fixture-specific extraction rules.

## Architecture / Approach

Repair order: precise diagnostics → layout input → field conventions → deterministic normalization → (2026-10-05) lenient metadata validation → offline two-tier `pdf:acceptance` scorer → reasoning low → one 3+3 measurement.
The authenticated Worker makes bounded sequential OpenAI calls. Evaluation and the future browser path share input construction; every context page counts toward byte/token limits.
Supabase atomically reserves costs and records immutable result digests; finalization verifies browser-returned payloads against those digests and commits complete recipes atomically.
Stable owner/file/source-item identity prevents duplicate writes. Unknown provider charges remain reserved; closing the tab does not prove provider cancellation.

## Phases at a Glance

| Phase                       | What it delivers                                                  | Key risk                                           |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| 1. References/prerequisites | User-approved expected results and account/configuration checks   | Chosen model access or source review unavailable   |
| 2. Browser reader           | Bounded local reading with columns, variants and pages            | Layout loss or mobile resource use                 |
| 3. Spending controls        | Durable reservations, authorization and concurrency tests         | Unknown charges incorrectly released               |
| 4. AI/validation repair | Diagnostics, layout input, two-tier acceptance, 3+3 measurement | Membership/line-join errors may persist on mini+low |
| 5. Real save/screen         | Private, atomic, replay-safe persistence and experiment UI        | Client tampering, duplicates or misleading success |
| 6. Measurements             | Desktop/phone matrix, actual-host CPU/cost and F-01 verdict       | Missing evidence or a failed five-minute bound     |

**Prerequisites:** accepted local ebooks, user's golden review, local Supabase, Paid OpenAI access and server-side credentials, an authorized real deployment, two test accounts and a phone.
**Estimated effort:** a substantial six-phase change; provisional 6–10 focused working sessions plus user review/device tests, not a delivery commitment. Remaining repair effort depends on offline findings and exact acceptance; no success estimate follows from the smoke.

## Open Risks & Assumptions

- Recurring blocking failures: an ingredient added from another area and continuation lines split into entries. Reasoning low may not fix them; then a gpt-5.4 decision (cost unverified) is needed.
- The 3+3 measurement costs about USD 0.6–0.9; the preflight keeps final-matrix headroom. Failure stops with evidence; no automatic retries or ledger reset.
- Workers Free suitability is unproven. Measure the actual path; a failure does not authorize a paid hosting upgrade.
- Final matrix: two ebooks × Chrome/Firefox × desktop/real phone = eight clean imports on a fixed configuration. Tuning and smoke calls also count toward the USD 6 F-01 budget.
- App cleanup and the OpenAI provider retention described in provider-decision.md are separate. Preview intentionally has no live model/database access.

## Success Criteria (Summary)

- Blocking tier 3/3 per ebook: all four summer (one complete variant each) and five lunchboxy recipes, exact ingredient sets and metric amounts, nothing invented. Reported-tier differences reviewed by the user (4.14).
- Every final run confirms real persistence within 300 seconds; budgets, privacy, duplicate prevention and failure handling pass.
- Real phone and actual Cloudflare evidence are recorded. Missing/failed evidence leaves F-01 unproven and S-02 gated.

## References

[PRD](../../foundation/prd.md) · [PDF requirements](../../deployment/pdf-processing-requirements.md) · [Roadmap](../../foundation/roadmap.md) · [OpenAI provider decision](provider-decision.md).
