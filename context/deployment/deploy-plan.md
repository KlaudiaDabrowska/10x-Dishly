# Cloudflare Integration and First Deployment Plan

## Summary

Deploy an infrastructure proof-of-concept to `workers.dev` consisting of two independent Workers:

- `dishly-web`: the existing Astro SSR application using Astro's supported default entrypoint.
- `dishly-pdf-worker`: a standalone Queue consumer responsible for background jobs and DLQ cleanup.

Use an EU-jurisdiction R2 bucket, Cloudflare Queues, hosted Supabase in Frankfurt (`eu-central-1`), GitHub Actions with a manual production gate, and no cloud resources or secrets in PR previews.

## Implementation Changes

### Web Worker and platform configuration

- Rename the production Worker from the starter name to `dishly-web`.
- Keep `@astrojs/cloudflare/entrypoints/server`; do not introduce a custom Astro entrypoint. Current Astro issues show custom entrypoints can break request initialization, cookies, cache behavior, and prerendering ([issue #17591](https://github.com/withastro/astro/issues/17591), [issue #17600](https://github.com/withastro/astro/issues/17600)).
- Configure `session: false`, because authentication uses Supabase cookies rather than Astro Sessions.
- Set the Cloudflare adapter's image service to compile-time optimization. A verification build must show only the intended `ASSETS`, R2, and Queue bindings—no automatically provisioned `SESSION` KV or `IMAGES` binding.
- Add production bindings:
  - `PDF_BUCKET` → `dishly-pdf-imports-eu`
  - `PDF_IMPORT_QUEUE` → `dishly-pdf-imports`
- Add a binding-free `preview` environment. Preview code must return a controlled `503 infrastructure_unavailable` response from infrastructure-dependent routes instead of accessing production resources. Cloudflare bindings are non-inheritable, so omitting them from that environment creates the required isolation ([environment documentation](https://developers.cloudflare.com/workers/wrangler/environments/)).
- Declare `SUPABASE_URL`, `SUPABASE_KEY`, and `DEPLOY_PROBE_TOKEN` as required production secrets. Use a Supabase publishable key, not a legacy `anon` key or privileged secret/service-role key ([Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys)).

### Queue consumer and proof endpoint

- Add a standalone Worker under `workers/pdf-consumer/` with its own Wrangler config and generated binding types.
- Configure:
  - consumer queue: `dishly-pdf-imports`
  - DLQ: `dishly-pdf-imports-dlq`
  - batch size: `1`
  - maximum concurrency: `1`
  - retries: `3`
  - retry delay: `60` seconds
  - CPU limit: `300000` ms
  - observability enabled with full sampling for MVP
  - EU R2 binding `PDF_BUCKET`
- Consume a versioned message:
  - `{ version: 1, kind: "deployment_probe", jobId, objectKey, requestedAt }`
- Add `POST /api/ops/deployment-probe` to the web Worker:
  - require `Authorization: Bearer <DEPLOY_PROBE_TOKEN>`;
  - reject absent/incorrect tokens with `401`;
  - generate a UUID, store a small synthetic PDF-shaped object in R2, and enqueue its identifiers;
  - return `202` with `{ jobId, status: "queued" }`;
  - never return object keys, credentials, or provider diagnostics to unauthenticated callers.
- The normal consumer verifies the object, emits structured logs, deletes it in `finally` on success or handled terminal error, then acknowledges the message.
- On retryable failure, preserve the object and retry the message.
- Consume the DLQ with the same standalone Worker; delete the corresponding R2 object, log `terminal_failure`, and acknowledge. Without a DLQ consumer, failed messages only persist temporarily ([DLQ behavior](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)).
- Apply an R2 lifecycle deletion rule of one day as a last-resort safety net for abrupt runtime termination. Immediate application cleanup remains primary because lifecycle deletion can lag ([R2 lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)).
- Log structured fields only: `event`, `job_id`, `attempt`, `object_deleted`, `duration_ms`, `outcome`. Never log PDF contents, secrets, authorization headers, or signed URLs.

## Provisioning and Deployment Runbook

### Human setup gates

1. Create Cloudflare and enable Workers Paid before provisioning the queue consumer; five-minute CPU allowance requires the paid plan, while memory remains fixed at 128 MB ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
2. Create a Supabase project in the specific Frankfurt `eu-central-1` region—not the broad “Europe” grouping, which may include non-EU locations ([Supabase regions](https://supabase.com/docs/guides/platform/regions)).
3. Create Cloudflare resources interactively:
   - `npx wrangler r2 bucket create dishly-pdf-imports-eu --jurisdiction eu`
   - `npx wrangler queues create dishly-pdf-imports`
   - `npx wrangler queues create dishly-pdf-imports-dlq`
4. Add an R2 lifecycle rule deleting objects after one day.
5. Deploy the web shell once without activating the probe, obtain its `workers.dev` URL, then:
   - set that URL as Supabase Auth `SITE_URL`;
   - allow only that production URL and local development URLs;
   - do not whitelist wildcard preview URLs;
   - install `SUPABASE_URL`, `SUPABASE_KEY`, and a generated high-entropy `DEPLOY_PROBE_TOKEN` as Worker secrets.
6. Create a narrowly scoped Cloudflare CI token restricted to the selected account and deployment operations. Resource creation remains an interactive bootstrap action and does not use the long-lived CI token.
7. Store only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in a GitHub `production` environment. Do not copy Supabase application secrets into GitHub.

### CI/CD

- Correct existing CI triggers from `master` to `main`.
- Keep lint, Astro check, build, and local Supabase smoke tests on pushes and pull requests.
- Add PR preview upload for `dishly-web-preview` using `wrangler versions upload --env preview`; deploy no consumer Worker and bind no Supabase, Queue, or R2 resources. Preview acceptance covers public routes and controlled degradation only.
- Add a manually dispatched production workflow:
  1. require a commit SHA from `main`;
  2. check out that exact SHA;
  3. rerun install, lint, type checks, build, and local smoke tests;
  4. verify the generated Astro deploy config contains the expected bindings and no `SESSION`/`IMAGES`;
  5. deploy `dishly-pdf-worker` first;
  6. deploy `dishly-web` second;
  7. print both version IDs and the `workers.dev` URL into the workflow summary.
- Use the official Wrangler action or pinned local Wrangler 4.131.1 consistently; do not silently upgrade Wrangler during deployment. Cloudflare CI requires an account ID and API token stored outside the repository ([official CI guidance](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)).

### First-release verification and rollback

- Verify `/`, unauthenticated `/dashboard` redirect, signup/signin/signout against hosted Supabase, then invoke the deployment probe.
- Tail both Workers using JSON output, correlate on `job_id`, and confirm the R2 object no longer exists.
- Force one retryable failure and confirm retry metadata; force terminal failure and confirm DLQ cleanup.
- Record deployed version IDs and resource names in this document after deployment.
- Roll back in compatibility order:
  1. disable or rotate `DEPLOY_PROBE_TOKEN` if the endpoint is implicated;
  2. roll back `dishly-web` first to stop new messages;
  3. allow compatible queued jobs to drain;
  4. roll back `dishly-pdf-worker`;
  5. never purge queues, delete R2 data, rotate primary secrets, or change Supabase configuration without explicit human approval.
- Rollback does not reverse secrets, bindings, queued messages, or database changes; treat those as separate recovery operations.

## Test and Support Plan

- Unit-test message validation, token authentication, retry classification, deletion-in-`finally`, and redaction of sensitive values.
- Run local integration tests with simulated R2 and Queues for success, missing object, malformed message, transient failure, retry exhaustion, duplicate delivery, and DLQ cleanup.
- Confirm duplicate probe delivery is harmless: the second delivery treats an already deleted object as an idempotent success.
- Validate builds with exact installed versions: Astro 7.3.2, Cloudflare adapter 14.3.1, and Wrangler 4.131.1.
- Add deployment checks for:
  - missing required secrets;
  - accidental production bindings in previews;
  - generated `SESSION` KV or `IMAGES` bindings;
  - Worker bundle and startup limits;
  - consumer CPU/memory failures;
  - orphaned R2 objects older than the expected processing window.
- Operational support:
  - `401` probe response: verify token presence and rotation, without printing its value.
  - `503 infrastructure_unavailable`: inspect the selected Wrangler environment and generated binding config.
  - queue backlog: pause new probes, inspect consumer errors and CPU/memory outcomes, then retry only after fixing the consumer.
  - repeated memory/CPU exhaustion: stop the Cloudflare extraction path and invoke the documented Render Workflows fallback; do not increase concurrency.
  - auth redirect failures: verify exact Supabase `SITE_URL`, HTTPS scheme, and `workers.dev` hostname.
  - unknown partial deployment: compare recorded version IDs, stop the producer first, and restore the last known compatible web/consumer pair.
- Keep native Workers Logs only for MVP; retention is up to seven days on Workers Paid, so deployment evidence and version IDs belong in the repository artifact rather than logs ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).

## Assumptions

- This release proves Cloudflare integration and deployment; it does not implement recipe extraction, import tables, user-facing upload UI, or recipe persistence.
- The probe endpoint is retained as a protected deployment diagnostic until the real import endpoint replaces it.
- Production publication, secret rotation, queue purge, resource deletion, and database changes remain human-approved operations.
- A custom domain and authenticated cloud previews are deferred until the `workers.dev` deployment is stable.

## Deployment Record

- Status: repository plan recorded; external provisioning and deployment pending human setup gates.
- Web Worker version: pending
- PDF Worker version: pending
- Production URL: pending
- R2 bucket: `dishly-pdf-imports-eu` (pending creation)
- Queue: `dishly-pdf-imports` (pending creation)
- Dead-letter queue: `dishly-pdf-imports-dlq` (pending creation)
