# PDF Token Accounting Mismatch Diagnostic — Plan Brief

> Full plan: `context/changes/diagnose-token-accounting-mismatch/plan.md`
> Frame brief: `context/changes/diagnose-token-accounting-mismatch/frame.md`
> Research: `context/changes/diagnose-token-accounting-mismatch/research.md`

## What & Why

Fail-closed accounting correctly stops an inconsistent provider result, but the
current evidence contract does not retain the minimal, non-sensitive metadata
needed to explain why the two official token measurements disagreed. Add that
evidence before another paid attempt without weakening cost or privacy controls.

## Starting Point

The shared adapter already counts before dispatch and holds every uncertain
post-dispatch cost. One paid product-acceptance attempt exposed a mismatch, but its
two token values and provider identity were discarded and the runner wrote no
failure record.

## Desired End State

A user receives a harmless diagnostic ID while private operators can distinguish
count/usage mismatch from invalid cached-token details. Free tests prove the
financial and privacy boundaries; one `summer` diagnostic run remains explicitly
human-approved and separate from the full release gate.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Equality rule | Keep exact equality | Official count semantics do not justify tolerance | Frame / Research |
| Ledger scope | Evidence only | Existing uncertain cost cannot be safely released | Plan |
| Public correlation | Return random diagnostic ID | Enables support correlation without content leakage | Plan |
| Storage | Private log plus local failure record | Avoids a database migration and keeps evidence allowlisted | Research / Plan |
| Paid verification | Separate manual gate | Prevents automatic spend and bounds the next attempt | Plan |

## Scope

**In scope:** typed mismatch evidence, public correlation ID, private structured
logging, failure records, ledger lifecycle tests and a one-fixture diagnostic mode.

**Out of scope:** token tolerance, automatic retries, old-hold resolution, database
migration, full two-fixture product acceptance and automatic paid execution.

## Architecture / Approach

The adapter creates a fixed evidence object at the mismatch boundary. The API
returns only its diagnostic ID, the server emits the private allowlist, and product
acceptance persists a sanitized failure record plus safe ledger state. No evidence
path may reconcile or release a reservation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Hermetic mismatch contract | Typed evidence for both mismatch variants | Accidentally changing financial behavior |
| 2. API and log correlation | Safe public ID and private allowlist | Sensitive-data leakage |
| 3. Runner and ledger evidence | Durable failure record and truthful cleanup | Mistaking held cost for zero cost |
| 4. Diagnostic probe | One approved `summer` live run | Unapproved spend or broader execution |

**Prerequisites:** existing local PDF test environment and private fixtures.

**Estimated effort:** three implementation phases plus one separately approved live-verification session.

## Open Risks & Assumptions

- The current provider incident cannot be classified retroactively because its
  counters were not preserved.
- The existing held reservation remains unresolved by design.
- The current `summer` preflight uses two batches and a maximum of `294912000`
  nano-USD; any changed total requires new approval.

## Success Criteria Summary

- Both mismatch variants are reproducible and classified without network access.
- Public and private evidence contracts contain only their exact allowlists.
- A mismatch never retries, reconciles or releases its uncertain reservation.
- No live request can run without a fresh matching cost approval.
