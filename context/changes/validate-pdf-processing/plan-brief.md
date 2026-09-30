# Validate PDF Processing — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)
> Decisions and six phases approved: 2026-09-30.

## What & Why

F-01 will verify the complete local PDF reading → authenticated backend → Gemini → validation → real-save path.
Its purpose is evidence that the accepted ebooks can become correct private recipes within five minutes and the agreed budget.
A restricted feasibility screen supports the experiment; S-02 still owns the finished product import experience.

## Starting Point

Astro/React, Cloudflare Workers, Supabase authentication and deployment/auth checks already exist.
There is no PDF reader, Gemini adapter, recipe persistence or shared spending ledger. The existing PDF-named queue handles a diagnostic marker only.

## Desired End State

An evaluator selects a local ebook, sees progress and obtains confirmed saved, already-existing and incomplete counts.
The saved recipes preserve source details and labelled variants; another account cannot read them.
A repeat of the identical PDF skips existing recipes without overwriting edits, and an evidence report determines readiness for S-02.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Real save | Include minimal persistence in F-01 | The five-minute measurement must include a confirmed write/read-back | Plan: 1A |
| Category | Source wins; second breakfast → breakfast; AI only if unlabelled | Preserve the author's classification | Plan: 2A |
| Golden results | Agent prepares; user checks before live ebook extraction | Keep the reference independent of model output | Plan: 3A |
| Mobile | User tests Chrome and Firefox on a real phone in F-01 | Emulation does not establish real-device feasibility | Plan: 4A |
| Reimport | Skip saved source recipes for identical bytes on the same account | Avoid duplicates and preserve corrections | Plan: 5A |
| Inputs | Summer/pasta full imports; 113-page book rejection/local analysis | Use the accepted representative set and unchanged 20 MB / 100-page limit | Research / PRD |
| AI | Gemini Developer API Paid, gemini-2.5-flash | Preserve the accepted provider/model decision | Research / PRD |
| Spending | USD 5 total F-01; bounded imports; tested later USD 10/month global and USD 0.50/import controls | Reserve before dispatch, including concurrency and uncertain charges | Research / Plan |
| Storage | Supabase metadata/accounting and saved recipes; unsaved content in browser/request memory | Reuse the stack and avoid retaining temporary input | Plan |

## Scope

**In scope:** independent references, PDF.js reader, budget ledger, backend AI/validation, minimal private persistence, restricted screen and measured evaluation.
**Out of scope:** finished S-02 UI, S-03 keep/discard, browsing/filtering/editing/deletion, OCR, original-PDF upload, raised file limits, background completion and hosting/provider upgrades.
Full source-derived fixtures remain ignored local files; only synthetic examples, schemas and aggregate evidence enter the repository.

## Architecture / Approach

Browser PDF.js preserves page/layout provenance; the authenticated Worker makes bounded sequential Gemini calls.
Supabase atomically reserves costs and records immutable result digests; finalization verifies browser-returned payloads against those digests and commits complete recipes atomically.
Stable owner/file/source-item identity prevents duplicate writes. Unknown provider charges remain reserved; closing the tab does not prove provider cancellation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. References/prerequisites | User-approved expected results and account/configuration checks | Chosen model access or source review unavailable |
| 2. Browser reader | Bounded local reading with columns, variants and pages | Layout loss or mobile resource use |
| 3. Spending controls | Durable reservations, authorization and concurrency tests | Unknown charges incorrectly released |
| 4. AI/validation | Fixed generateContent adapter and source-based quality evaluation | Valid JSON with wrong or missing recipe content |
| 5. Real save/screen | Private, atomic, replay-safe persistence and experiment UI | Client tampering, duplicates or misleading success |
| 6. Measurements | Desktop/phone matrix, actual-host CPU/cost and F-01 verdict | Missing evidence or a failed five-minute bound |

**Prerequisites:** accepted local ebooks, user's golden review, local Supabase, Paid Gemini access and server-side credentials, an authorized real deployment, two test accounts and a phone.
**Estimated effort:** a substantial six-phase change; provisional 6–10 focused working sessions plus user review/device tests, not a delivery commitment. Reassess after references and the ledger-backed smoke.

## Open Risks & Assumptions

- Gemini 2.5 access is restricted to prior users in the lifecycle documentation checked during planning. Unavailable access blocks live work; a replacement requires a separate decision.
- Workers Free suitability is unproven. Measure the actual path; a failure does not authorize a paid hosting upgrade.
- Final matrix: two ebooks × Chrome/Firefox × desktop/real phone = eight clean imports on a fixed configuration. Tuning and smoke calls also count toward USD 5.
- App cleanup and the accepted 55-day provider retention are separate. Preview intentionally has no live model/database access.

## Success Criteria (Summary)

- All expected recipes/content match approved source references, including four summer cards with three labelled variants each.
- Every final run confirms real persistence within 300 seconds; budgets, privacy, duplicate prevention and failure handling pass.
- Real phone and actual Cloudflare evidence are recorded. Missing/failed evidence leaves F-01 unproven and S-02 gated.

## References

[PRD](../../foundation/prd.md) · [PDF requirements](../../deployment/pdf-processing-requirements.md) · [Roadmap](../../foundation/roadmap.md) · [Gemini access/lifecycle](https://ai.google.dev/gemini-api/docs/deprecations).
