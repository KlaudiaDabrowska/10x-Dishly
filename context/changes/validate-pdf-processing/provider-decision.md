# Accepted OpenAI integration — 2026-09-30

The user accepted OpenAI API with gpt-5.4-mini after learning that API billing is separate from ChatGPT Pro, then confirmed completion of billing/key setup. This supersedes the Gemini provider, request/accounting and retention clauses in earlier research and foundation documents. Product scope, source fixtures, 20 MB / 100 pages, six phases, five-minute target and monetary caps remain unchanged.

## Input-limit amendment — 2026-10-03

The user requested raising the application input cap after summer exceeded it. Exact counts are 60,886 and 80,950 tokens for the two standard batches; the previously rejected page-4 window measured 34,625. The new 98,304 cap leaves headroom and fits the documented 400,000-token context window together with the unchanged 8,192 output cap. Official model limits and standard USD 0.75 / 4.50 per million rates were rechecked on 2026-10-03. Existing monetary caps and historical reservations are preserved.

## Account evidence

OPENAI_API_KEY is present in ignored local configuration. Authenticated GET /v1/models/gpt-5.4-mini returned HTTP 200 with the requested model ID on 2026-09-30. No key, account identifier or raw API response was logged. Billing setup is user-reported; balance and project identity were not independently inspected. Metadata visibility does not prove generation entitlement, quota, schema support or quality. Generation requests: 0. The first paid synthetic smoke still waits for Phase 3's tested ledger.

## Adapter contract

Use server-only OPENAI_API_KEY and POST https://api.openai.com/v1/responses with model gpt-5.4-mini, store=false, background=false, tools=[], reasoning.effort=none and strict text.format JSON Schema. Ordinary HTTP fetch is sufficient; no ChatGPT subscription authentication, Files upload, hosted tools or model fallback. Record requested and returned model IDs; any model/configuration change requires fresh evaluation. The adapter file is src/lib/pdf-processing/openai.ts.

Bound each request to 98,304 counted input tokens and max_output_tokens=8,192, covering all billed output, including any reasoning/formatting tokens. Remove the Gemini-specific 1,024 thinking-token budget. The existing candidateCount=1 means one response, not an OpenAI n parameter. Reject incomplete, refused, malformed or unexpected outputs, even if the HTTP status is 200. Never accept partial JSON as success.

Before reservation, count the full model input, instructions and schema via POST /v1/responses/input_tokens; verify the endpoint's configuration coverage and current charging policy before live use. No silent token estimation or truncation. If counting is unavailable/incompatible, stop dispatch. Any billable preparatory operation must itself be reserved; the counting endpoint has not been called in this setup check.

## Pricing and accounting

Standard public rates checked 2026-09-30: USD 0.75 per million input tokens and USD 4.50 per million output tokens. Reserve input at the uncached rate and the full output limit: at both configured maxima, USD 0.110592 = 110,592,000 nano-USD. This is a per-call bound, not an ebook price. Reconcile usage.input_tokens and usage.output_tokens once; output_tokens_details.reasoning_tokens is a subset, never an extra charge. Apply a verified cache discount only when supported by reported usage and the pricing snapshot. No Batch/Flex/Priority/regional routing or paid tools are in scope. Retain USD 5 total F-01, USD 0.50/import and later USD 10/month global limits; fewer maximum-size calls may fit the same import budget. Unknown costs remain held; no automatic retry or budget increase.

## Provider data handling

Use store=false and no persistent conversation. OpenAI documents no API training by default, standard abuse monitoring retention up to 30 days (subject to exceptions/legal requirements), and separate prompt-cache retention. This is not zero retention: store=false disables response storage but does not remove all provider retention. The former Google-specific 55-day explanation must not be shown for OpenAI. Check current terms again when preparing the live screen.

## Device and remaining evidence

Golden references approved. Real phone: iPhone 15 Pro Max with Chrome; iOS/browser versions and Firefox availability are still unconfirmed. The desktop/phone Chrome/Firefox matrix remains required. Together with the approved references and passing offline checks, this prerequisite record completes Phase 1 criteria. It does not complete F-01 or waive later live-test prerequisites. Phase 2 can proceed offline; Phase 4 live work requires verified spend controls and a bounded smoke. No paid model call or deployment is authorized merely by this record.

## Sources

- [Model, schema support and standard pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Counting tokens and output limits](https://developers.openai.com/api/docs/guides/token-counting)
- [Data controls and retention](https://developers.openai.com/api/docs/guides/your-data)
