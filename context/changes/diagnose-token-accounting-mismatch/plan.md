# PDF Token Accounting Mismatch Diagnostic Implementation Plan

## Overview

Before another paid product-acceptance run, preserve a minimal content-free record
when the OpenAI count endpoint and completed response usage disagree. Keep strict
token equality and fail-closed spending control unchanged, then use the evidence in
one separately approved diagnostic run.

## Current State Analysis

The shared adapter throws one stable `input-token-accounting-mismatch` code for
both unequal count/usage and invalid cached-token details, but discards the values
needed to distinguish them. The service correctly fails the import and leaves any
post-dispatch reservation held. Product acceptance writes fixture evidence only
after success, so the failed paid run left no correlated failure record.

## Desired End State

A mismatch produces an allowlisted private diagnostic record and a public random
correlation ID without PDF content, model output or personal data. Hermetic tests
prove that the adapter does not retry, reconcile or release the uncertain cost.
Only after every free gate passes may a human approve one bounded live diagnostic
run for the first `summer` fixture.

### Key Discoveries

- `src/lib/pdf-processing/openai.ts:309-320` uses the same error code for two distinct accounting failures.
- `src/lib/pdf-processing/openai.ts:375-416` already keeps every non-429 post-dispatch failure held and does not retry it.
- `scripts/pdf-product-acceptance.mjs:519-525` persists evidence only after fixture execution returns successfully.

## What We're NOT Doing

- Adding tolerance between count and usage.
- Automatically retrying an accounting mismatch.
- Releasing or reconciling the existing uncertain reservation.
- Adding a database migration or administrative hold-resolution workflow.
- Running the full two-fixture product-acceptance gate as part of this change.
- Sending any additional paid request without fresh, explicit cost approval.

## Implementation Approach

Extend the existing typed provider error with a minimal evidence object, propagate
only a random diagnostic ID to the public API, and emit the detailed allowlist to a
private structured sink. Make product acceptance persist a safe failure record even
when fixture execution throws. Prove all invariants hermetically before allowing a
single-fixture live probe.

## Critical Implementation Details

The mismatch is detected after a paid dispatch has returned, so evidence capture
must not call reconciliation or release the reservation. `count-vs-usage` keeps
precedence when both count and cached-token details are invalid; the cached status
may be recorded, but an invalid raw cached value must never be copied.

## Phase 1: Hermetic mismatch contract

### Overview

Make both mismatch variants observable without changing fail-closed behavior.

### Changes Required

#### 1. Shared OpenAI adapter

**File**: `src/lib/pdf-processing/openai.ts`

**Intent**: Add a content-free typed diagnostic payload to `OpenAiPdfError` and
populate it at the two accounting guards.

**Contract**: Evidence version `1` contains `diagnosticId`, `mismatchKind`,
`batchIndex`, `attempt`, `reservationId`, API, requested/returned model,
`responseId`, counted/reported input tokens, signed delta, cached-token status and
a cached-token value only when it is a valid integer. `mismatchKind` is
`count-vs-usage` or `cached-token-detail-invalid`. No raw provider value or content
field is permitted.

#### 2. Adapter regression tests

**File**: `scripts/pdf-processing.test.mjs`

**Intent**: Reproduce both mismatch classes with deterministic mocks and protect
the financial lifecycle.

**Contract**: Cover count `123` versus usage `124`, valid equal count with invalid
cached details, and simultaneous mismatch with count precedence. Each scenario
asserts one reservation, no retry, no reconciliation and no accepted result.

### Success Criteria

#### Automated Verification

- Adapter mismatch tests pass without network access or provider cost.
- Evidence exposes the exact approved keys and values for both mismatch kinds.
- Existing exact-usage reconciliation tests remain green.

## Phase 2: API and private-log correlation

### Overview

Expose a harmless correlation handle while retaining detailed evidence only in a
private structured record.

### Changes Required

#### 1. Error response boundary

**File**: `src/lib/pdf-validation.ts`

**Intent**: Correlate a user-visible failure with private evidence without leaking
provider or PDF details.

**Contract**: An evidence-bearing accounting mismatch keeps HTTP 502 and returns
exactly `{ "error": "input-token-accounting-mismatch", "diagnosticId": "<uuid>" }`.
Other error responses retain their existing shape. The private structured event is
`pdf_input_token_accounting_mismatch` and contains only the evidence allowlist.

#### 2. HTTP privacy tests

**File**: `scripts/pdf-product-http.test.mjs`

**Intent**: Lock the public/private boundary and prevent future accidental logging
of content or credentials.

**Contract**: Assert exact public keys, exact private keys, correlation by the same
diagnostic ID, and absence of PDF text/name, prompt/schema, request/response body,
output, owner data, credentials and raw exception messages.

### Success Criteria

#### Automated Verification

- HTTP tests prove that the public mismatch body contains only error and diagnostic ID.
- Structured-log tests prove the exact allowlist and reject private-content markers.
- Existing non-mismatch API error contracts remain green.

## Phase 3: Runner failure evidence and ledger invariants

### Overview

Persist useful failure evidence even when fixture execution throws, without
pretending that cleanup or cost reconciliation succeeded.

### Changes Required

#### 1. Product-acceptance failure records

**File**: `scripts/pdf-product-acceptance.mjs`

**Intent**: Leave a private, auditable record for a failed fixture and make cleanup
status truthful.

**Contract**: On failure, exclusive-create a content-free failure record with mode
`0600` inside the existing `0700` run directory. It contains the stable error,
public diagnostic ID when present, fixture ID, safe ledger read-back and cleanup
status. It never copies `error.message`, provider evidence or private content.
Cleanup failure remains a failed gate and is not silently reported as deletion.

#### 2. Runner and ledger tests

**File**: `scripts/pdf-product-acceptance.test.mjs`

**Intent**: Prove the failure artifact, file permissions and fail-closed ledger
state before any paid verification.

**Contract**: Assert exclusive creation, `0600`, exact keys, negative privacy
markers, import `failed`, one `dispatch-claimed` reservation, no reconciliation,
no retry and no success record.

### Success Criteria

#### Automated Verification

- Runner tests persist an allowlisted failure record after a thrown mismatch.
- Ledger lifecycle tests retain the uncertain reservation and perform no retry or reconciliation.
- Full PDF test suite, lint and Astro type checking pass.

#### Manual Verification

- A deliberately planted hermetic mismatch leaves a readable private failure record and sanitized console output.

## Phase 4: Manually approved diagnostic probe

### Overview

Use the new evidence once against the same first fixture as the incident, with a
separate cost decision and without starting the full acceptance gate.

### Changes Required

#### 1. Single-fixture diagnostic mode

**File**: `scripts/pdf-product-acceptance.mjs`

**Intent**: Reuse the real product route for `summer` only, while preserving the
same revision, fixture-hash, manifest and budget preflight guarantees.

**Contract**: The command selects only `summer`, aborts before dispatch if its
approved identity changes, and requires `approved-max-nano-usd` to equal the fresh
preflight total. With the current two batches the maximum is `294912000` nano-USD;
any changed total invalidates prior approval. A mismatch stops immediately; a
non-mismatch completes and reconciles the selected fixture only.

### Success Criteria

#### Automated Verification

- Diagnostic preflight tests reject changed revision, fixture identity, manifest or approved maximum.
- All free tests and static checks pass immediately before live approval is requested.

#### Manual Verification

- A human explicitly approves the exact current maximum before the live command runs.
- The live result is correlated by diagnostic ID and classified as count/usage mismatch, cached-detail mismatch or not reproduced.
- No second fixture or full product-acceptance run is started by this phase.

## Testing Strategy

### Unit and Hermetic Tests

- Test both mismatch kinds and their precedence.
- Test the exact typed evidence and public response contracts.
- Test absence of retry, reconciliation, accepted results and sensitive fields.

### Integration Tests

- Exercise service failure propagation and ledger read-back with the local database.
- Exercise product-acceptance failure persistence and cleanup reporting.

### Manual Testing

1. Plant a hermetic mismatch and inspect only the private record and sanitized CLI output.
2. Review the preflight revision, fixture identity, batch count and maximum cost.
3. Obtain fresh cost approval before the one-fixture live probe.

## Performance Considerations

Evidence is created only on accounting mismatch and contains a fixed, small set of
scalar fields. It must not serialize provider bodies or add provider calls.

## Migration Notes

No database migration is included. The existing held reservation remains intact;
future audited hold resolution is a separate change.

## References

- Frame: `context/changes/diagnose-token-accounting-mismatch/frame.md`
- Research: `context/changes/diagnose-token-accounting-mismatch/research.md`
- Existing adapter: `src/lib/pdf-processing/openai.ts:277-320,351-419`
- Existing runner: `scripts/pdf-product-acceptance.mjs:501-536`
- Official token-counting guide: <https://developers.openai.com/api/docs/guides/token-counting>

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Hermetic mismatch contract

#### Automated

- [x] 1.1 Adapter mismatch tests pass without network access or provider cost. — e30ed6f
- [x] 1.2 Evidence exposes the exact approved keys and values for both mismatch kinds. — e30ed6f
- [x] 1.3 Existing exact-usage reconciliation tests remain green. — e30ed6f

### Phase 2: API and private-log correlation

#### Automated

- [x] 2.1 HTTP tests prove that the public mismatch body contains only error and diagnostic ID.
- [x] 2.2 Structured-log tests prove the exact allowlist and reject private-content markers.
- [x] 2.3 Existing non-mismatch API error contracts remain green.

### Phase 3: Runner failure evidence and ledger invariants

#### Automated

- [ ] 3.1 Runner tests persist an allowlisted failure record after a thrown mismatch.
- [ ] 3.2 Ledger lifecycle tests retain the uncertain reservation and perform no retry or reconciliation.
- [ ] 3.3 Full PDF test suite, lint and Astro type checking pass.

#### Manual

- [ ] 3.4 A deliberately planted hermetic mismatch leaves a readable private failure record and sanitized console output.

### Phase 4: Manually approved diagnostic probe

#### Automated

- [ ] 4.1 Diagnostic preflight tests reject changed revision, fixture identity, manifest or approved maximum.
- [ ] 4.2 All free tests and static checks pass immediately before live approval is requested.

#### Manual

- [ ] 4.3 A human explicitly approves the exact current maximum before the live command runs.
- [ ] 4.4 The live result is correlated by diagnostic ID and classified as count/usage mismatch, cached-detail mismatch or not reproduced.
- [ ] 4.5 No second fixture or full product-acceptance run is started by this phase.
