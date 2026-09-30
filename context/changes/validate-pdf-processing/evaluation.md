# F-01 evaluation record

Date: 2026-09-30. State: Phase 1 criteria completed; **live execution blocked pending prerequisites**.
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

| Requirement                            | Evidence/status                                                          | Next evidence needed                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Original files and local golden drafts | Available, hashes pinned                                                 | Completed on 2026-09-30; approval metadata and hashes recorded                                        |
| Accepted model on the actual account   | OpenAI gpt-5.4-mini metadata visible (HTTP 200)                          | Ledger-backed generation smoke after Phase 3                                                          |
| Paid billing and project identity      | User reports billing/key setup completed; balance not inspected          | Verify billing operation in the ledger-backed smoke; do not infer account balance from metadata |
| Responses/schema/configuration support | Documentation supports the selected contract; account execution untested | Ledger-backed bounded synthetic smoke after Phase 3                                                   |
| Desktop Chrome/Firefox                 | Chrome present; Firefox missing                                          | Arrange current Firefox for Phase 6 and record actual tested versions                                 |
| Real phone Chrome/Firefox              | iPhone 15 Pro Max, Chrome confirmed; iOS version/Firefox unconfirmed     | Record iOS/browser versions and arrange Firefox for the agreed matrix                                 |
| Actual Cloudflare CPU/latency          | Not measured for this path                                               | Phase 6 on authorized deployment                                                                      |
| Durable spend controls                 | Not implemented in Phase 1                                               | Phase 3 transaction/concurrency tests before paid calls                                               |

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
