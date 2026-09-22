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
8. Configure required reviewers and restrict the `production` environment to `main`. The repository workflow references this environment, but reviewer/branch protection must be configured in GitHub ([environment gates](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)).
9. For PR uploads, create a separate GitHub `preview` environment with its own `CLOUDFLARE_ACCOUNT_ID` and narrowly scoped `CLOUDFLARE_API_TOKEN`. Do not put application secrets there or reuse production environment secrets. Same-repository PRs may upload; forks and Dependabot run validation only. If preview credentials are absent, the upload job fails explicitly after validation. Confirm the dedicated `dishly-web-preview` Worker has no pre-existing application secrets before enabling previews; version uploads preserve existing remote secrets.

### CI/CD

- Correct existing CI triggers from `master` to `main`.
- Keep lint, Astro check, build, and local Supabase smoke tests on pushes and pull requests.
- Add PR preview upload for `dishly-web-preview` using `wrangler versions upload --env preview`; deploy no consumer Worker and bind no Supabase, Queue, or R2 resources. Preview acceptance covers public routes and controlled degradation only.
  - Build with `npm run build:preview` first. The Cloudflare Vite environment is selected at build time; passing `--env preview` only at upload time does not turn a production build into a preview build ([Cloudflare environment selection](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)).
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

- Status: phases 0–3 complete locally as of 2026-09-22. Prerequisites reported complete by the user; external state has not been independently verified. GitHub environment setup, hosted workflow execution, and production deployment/verification remain unverified.
- Web Worker version: pending
- PDF Worker version: pending
- Production URL: pending
- R2 bucket: `dishly-pdf-imports-eu` (pending creation)
- Queue: `dishly-pdf-imports` (pending creation)
- Dead-letter queue: `dishly-pdf-imports-dlq` (pending creation)

### Phase 0 — Baseline validation

Scope confirmed by the user: installed versions, lint, Astro check, build, and Wrangler dry run. No production publication or resource changes were performed.

| Check | Result |
|---|---|
| Working tree before validation | Clean |
| Runtime | Node.js `24.18.0` |
| Installed deployment dependencies | Astro `7.3.2`, `@astrojs/cloudflare` `14.3.1`, Wrangler `4.131.1`; all match the plan |
| `npm run lint` | Passed |
| `npx astro check` | Passed: 29 files, zero errors, warnings, or hints |
| `npm run build` | Passed; sitemap skipped because Astro `site` is unset |
| `npx wrangler deploy --dry-run` | Passed using generated `dist/server/wrangler.json`; upload 2065.65 KiB, gzip 456.07 KiB |

Baseline findings to address during implementation:

- Worker name is still `10x-astro-starter`.
- Generated bindings are `ASSETS`, `SESSION`, and `IMAGES`. Disable Astro sessions and configure compile-time image optimization as planned before production deployment.
- R2 and Queue bindings, preview isolation, and the standalone consumer remain to be implemented.
- The dry run validates local packaging only; it does not verify cloud resources, production secrets, runtime startup, or hosted authentication. Resource creation labels above reflect the prior record and remain unverified despite the user's prerequisite completion report.

### Phase 1 — Web Worker configuration

Completed locally on 2026-09-21. No cloud publication or resource mutation performed.

- Renamed the Worker to `dishly-web`, retained the supported Astro entrypoint, disabled sessions, and enabled compile-time image optimization with runtime passthrough.
- Added EU-jurisdiction `PDF_BUCKET` and `PDF_IMPORT_QUEUE` production bindings and declared the three required production secrets in Wrangler. Astro secret fields remain optional so isolated previews can start without credentials.
- Added `dishly-web-preview` with empty R2/Queue bindings and required-secret list. `DEPLOYMENT_ENV=preview` also disables Supabase client creation even if credentials are accidentally present locally.
- Added `npm run build:preview`; missing infrastructure returns JSON `503 infrastructure_unavailable` for API and dashboard routes. Public pages remain accessible.
- Validation passed: lint; Astro check (29 files, zero diagnostics); production and preview builds; both Wrangler deployment dry runs; inspection of generated configs confirmed no `SESSION` or `IMAGES` bindings and no preview R2, Queue, or required secrets.
- Local preview HTTP checks passed: `/`, `/auth/signin`, `/auth/signup` returned `200`; `/dashboard` and same-origin POSTs to all three auth APIs returned the expected JSON `503`. Requests without a matching Origin remain subject to Astro's `403` CSRF protection.
- Expected warnings: absent local `DEPLOY_PROBE_TOKEN`, unset sitemap `site`, and intentionally omitted preview R2 binding. Production secret presence remains unverified.
- Next: standalone Queue consumer and protected deployment probe, followed by their tests and CI/CD implementation.

### Phase 2 — Queue consumer and deployment probe

Completed locally on 2026-09-21. No cloud resources, secrets, or production deployments changed.

- Added `workers/pdf-consumer/` with a standalone entrypoint, Wrangler configuration, and generated runtime/binding types (`npm run types:consumer`). Both the normal queue and DLQ have batch size/concurrency 1, three retries, and a 60-second retry delay. CPU limit is 300000 ms; observability uses full sampling.
- Added `POST /api/ops/deployment-probe`, independently authenticated with `DEPLOY_PROBE_TOKEN` so Supabase availability does not block diagnostics. Preview returns `503`; absent or invalid production credentials return `401`; accepted probes return only `jobId` and `status` with `202`.
- Messages require version 1, the deployment-probe kind, a UUID v4, a matching `deployment-probes/<jobId>.pdf` key, and a valid timestamp. The consumer verifies the small synthetic object, cleans up terminal outcomes in `finally`, and acknowledges only after deletion succeeds. Missing objects are idempotent successes. Storage/read/deletion failures retry; DLQ delivery performs terminal cleanup.
- Malformed messages are acknowledged without trusting or deleting their supplied object key. Unidentifiable objects, exhausted DLQ cleanup failures, and interrupted executions rely on the prerequisite one-day bucket lifecycle rule. That external rule remains unverified in this local phase.
- Queue-send failures trigger best-effort producer cleanup. Structured logs contain only the six approved fields, with no raw provider errors, object keys, authorization values, or PDF contents.
- Added `npm run test:deployment`: nine passing tests cover validation, authentication, absent infrastructure, local Miniflare R2 integration, duplicate delivery, simulated retry exhaustion/DLQ handling, body-read and cleanup failures, enqueue/write failures, acknowledgement ordering, and log redaction. Miniflare is pinned to the version already used by the installed Wrangler.
- Validation passed: lint; Astro check (34 files, zero diagnostics); production and preview builds/dry runs; standalone consumer dry run (2.59 KiB / gzip 1.06 KiB).
- Ran both Workers together locally with Wrangler and a synthetic token: incorrect token → `401`; accepted probe → `202`; local Queue delivery → consumer `success` with `object_deleted: true`, correlated by job ID. Live cloud retry timing and resource configuration still require first-release verification.
- Preview runtime finding: `astro preview` returned `401` for the probe despite the generated preview config containing `DEPLOYMENT_ENV=preview`. Running that same generated config directly with Wrangler returned the required `503`. Use `npm run build:preview` followed by `npm run preview:worker` for binding-sensitive preview verification; this command runs only the local generated Worker. The production build must be restored before a production dry run/deploy.
- Local combined-worker command after building: `npx wrangler dev --config dist/server/wrangler.json --config workers/pdf-consumer/wrangler.jsonc`. Configure a local-only probe token through the existing local secret mechanism before building; do not use production credentials for the probe test.
- Next: CI/CD workflows and deployment configuration checks. Cloud publication remains pending.

### Phase 3 — CI/CD and deployment checks

Implemented locally on 2026-09-22; no push, GitHub workflow dispatch, or cloud publication performed.

- CI now runs on pushes/PRs to `main` and can be called by the release workflow for an exact SHA. It uses Node 24 and lockfile-installed tools, runs lint, Astro checks, nine probe tests, six deployment-config/publication tests, production/consumer/preview dry runs, and eight preview HTTP assertions.
- The separate smoke job starts disposable local Supabase, builds using only local URL/publishable-key credentials, and runs all eight authentication smoke assertions against Wrangler's local Worker runtime. No Supabase credentials are read from GitHub secrets. Local service startup output is redirected to avoid printing generated test credentials.
- Same-repository PRs upload only the isolated web version with `wrangler versions upload --env preview --preview-alias pr-<number>`. Preview URLs are enabled in the preview config. No consumer is uploaded. Preview credentials are separate from production and exposed only to the publication step.
- `.github/workflows/deploy.yml` accepts a full lowercase commit SHA via manual dispatch on `main`, verifies it is an ancestor of `origin/main`, and reruns CI against that SHA. The deploy job checks out the same SHA and uses the `production` environment gate. Production deployments are serialized and are not automatically cancelled mid-release.
- `npm run check:deploy -- production|preview` inspects the generated config and installed versions. It rejects environment/name mismatches, unexpected bindings including `SESSION`/`IMAGES`, preview R2/Queue resources or declared secrets, and missing production bindings/secrets. It also verifies the consumer's retry, concurrency, EU storage, CPU, and observability configuration.
- `scripts/publish-workers.mjs` uses the installed Wrangler 4.131.1 directly, checks remote production secret names before either deployment, disables automatic provisioning, deploys the consumer before the web Worker, and records each returned version immediately in the GitHub summary. The web/preview URL is recorded as well. Partial failures retain the consumer version for recovery and do not trigger an automatic rollback.
- Validation passed locally: actionlint 1.7.12; lint; Astro check; all 15 automated tests; both build configurations and all three dry runs; eight isolated-preview HTTP checks; eight Supabase auth smoke assertions. Publication tests used simulated Wrangler results; actual remote credentials, GitHub approvals, provider startup limits, and cloud publication remain unverified.
- Next: commit/push these workflows, verify the GitHub environments and resource/secret prerequisites, then manually dispatch **Deploy production** for a reviewed commit from `main`. After publication, run the first-release checks and copy the workflow's version IDs and URL into this record. Runtime CPU/memory behavior and orphaned-object/lifecycle verification remain part of first-release operations.
