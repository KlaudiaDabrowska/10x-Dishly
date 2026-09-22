# Production PDF processing — separate from the Free diagnostic

The Workers Free proof of concept validates transport and cleanup of a fixed 41-byte marker. It performs no PDF parsing, recipe extraction, or database writes. Its success does not establish the feasibility of a five-minute PDF import on Free.

## Product requirements retained

The [PRD](../foundation/prd.md) still requires selectable-text PDFs up to 100 pages / 20 MB, a representative roughly 50-recipe import within five minutes (excluding upload and user decisions), private recipe storage, and deletion of temporary PDFs after success or failure. Five minutes is an end-to-end processing requirement, not a CPU allocation or a measured result.

## Decisions and changes required before implementation

1. Select and explicitly approve a processing runtime/budget. Workers Free's CPU allowance is not the runtime budget for this feature. Evaluate Workers Paid or the previously researched Render Workflows fallback; do not enable either automatically. Recheck current provider limits and pricing when making that decision.
2. If paid Workers is selected, review the consumer's CPU configuration and update the deployment guard deliberately. The prior `limits.cpu_ms: 300000` proposal is not active. Even a five-minute CPU allowance does not guarantee a five-minute completion deadline: storage, database, queue delays, and retries consume wall time. The 128 MB Worker memory constraint still matters.
3. Benchmark actual parsing and extraction on at least 20 diverse PDFs, including 100-page/20-MB examples. Measure peak memory, CPU, wall time, cold start, and retry behavior. Preserve meaningful headroom; the earlier p95 CPU target below 240 seconds is insufficient by itself to prove an absolute five-minute product deadline.
4. Replace the diagnostic marker protocol with a separate versioned import protocol and authenticated upload route. Validate file size/pages/type, apply per-user limits, define job states/deadlines, and keep PDFs out of Queue messages. Do not reuse the diagnostic's missing-object-is-success rule for a real import without persisted job-state evidence.
5. Implement transactional/idempotent recipe writes and user isolation in Supabase. Ensure duplicate delivery cannot produce duplicate or partial recipes, and distinguish partial extraction from full success.
6. Reconcile retry/retention with immediate terminal cleanup. Keep objects for retryable attempts, delete after terminal success/failure and DLQ handling, and retain a lifecycle safety net. Add alerting for orphaned objects and exhausted DLQ cleanup; lifecycle expiry is delayed and is not an immediate deletion guarantee.
7. Review deployment compatibility, observability, rate limits, billing exposure, and rollback with both Worker versions. Update the foundation infrastructure contract and deploy plan before real PDFs are accepted.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Queue consumer limits](https://developers.cloudflare.com/queues/platform/limits/), and the [original infrastructure research](../foundation/infrastructure.md). The original paid-processing recommendation remains research for this future decision; the current release is diagnostic only.
