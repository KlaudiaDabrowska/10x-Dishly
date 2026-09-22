# Cloudflare Workers Free Diagnostic Deployment Plan

## Summary

Prepare a short diagnostic proof of concept for **Workers Free**, using two independent Workers on `workers.dev`:

- `dishly-web`: the existing Astro SSR application using Astro's supported default entrypoint.
- `dishly-pdf-worker`: a standalone diagnostic Queue consumer and DLQ cleanup handler; no PDF extraction.

Use an EU-jurisdiction R2 bucket, Cloudflare Queues, hosted Supabase in Frankfurt (`eu-central-1`), GitHub Actions with a manual production gate, and no cloud resources or secrets in PR previews.

The user confirmed the current Cloudflare account and chose Workers Free on 2026-09-22. This revision is local preparation only: no paid-plan activation, resource creation, production deployment, or workflow dispatch is authorized. Commands below are instructions for a later user-controlled setup/deployment.

### Scope and Free allowances (checked 2026-09-22)

The flow is `dishly-web → R2 → Queue → dishly-pdf-worker → R2 deletion`. The producer ignores request body bytes and stores a fixed **41-byte ASCII PDF-shaped marker**, not a parseable ebook. Its JSON message is below 1 KiB. The consumer checks size before reading the body, compares the marker, and deletes it. One message per batch and concurrency 1 keep processing small; retries remain asynchronous with a 60-second delay. No parsing, OCR, AI, recipe storage, or deliberate CPU loops are included.

| Service | Free allowance / diagnostic constraint |
|---|---|
| Workers | 100,000 requests/day, 10 ms CPU per invocation, 128 MB memory; no `limits.cpu_ms` override in either Worker. |
| Queues | 10,000 operations/day across the account; 24-hour retention on Free. A normal small message uses write/read/delete operations; retries and DLQ delivery use more. |
| R2 Standard | Included monthly usage: 10 GB-month, 1 million Class A operations, 10 million Class B operations. Keep the bucket private and Standard; do not select Infrequent Access. |
| Workers Logs | 200,000 events/day with three-day retention on Free; keep full sampling for this low-volume diagnostic. |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Queues Free availability](https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/), [Queues pricing/retention](https://developers.cloudflare.com/queues/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

**Workers Free is not a guarantee of zero total charges.** R2 activation is a separate subscription checkout with free included usage and usage-based billing beyond it. No R2 activation is performed here. If you do not want to accept R2 billing terms, keep using local emulation; a real R2-backed cloud flow cannot run without R2 activation. Do not treat usage notifications as a hard spending cap. See [R2 setup](https://developers.cloudflare.com/r2/get-started/).

Run a few manual probes (start with one, then at most ten per verification session); do not load-test or expose the bearer token. This is an operating convention, not an enforced account quota. Other applications share the account allowances. The producer normally performs one R2 write and one Queue send; the consumer performs one R2 read and one deletion. Public unauthenticated requests still consume Worker resources even though they cannot enqueue jobs.

CPU time excludes waiting for I/O. `duration_ms` in application logs is elapsed wall time, **not CPU time**. Local Miniflare/Wrangler tests do not enforce Cloudflare production CPU limits, and Astro request initialization has overhead: record the web and consumer CPU metrics after an explicitly approved cloud test. Do not claim compliance from a fast local test alone. No custom limit should be set to `10` either; custom CPU settings are not the Free-plan mechanism ([Wrangler limits](https://developers.cloudflare.com/workers/wrangler/configuration/#limits)).

### Real PDF processing is a separate release

The 100-page/20-MB input and five-minute import requirements remain in the PRD. They are **not tested or satisfied by this diagnostic**. The required runtime decision, benchmarks, import protocol, persistence, and cleanup changes are documented separately in [production PDF processing requirements](pdf-processing-requirements.md). No Workers Paid upgrade is scheduled by this plan.

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
  - CPU limit: omit `limits.cpu_ms`; inherit Workers Free limits
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

1. In account `534880b32f50805c58732f581e29cc56`, confirm **Workers Free** and set up a `workers.dev` subdomain in Workers & Pages. Do not upgrade to Workers Paid. Separately decide whether to activate R2 under its billing terms; without that activation, stop at local testing.
2. Create a Supabase project in the specific Frankfurt `eu-central-1` region—not the broad “Europe” grouping, which may include non-EU locations ([Supabase regions](https://supabase.com/docs/guides/platform/regions)).
3. Only after your separate R2 activation decision, create the resources yourself in Cloudflare (or run the following pinned-local CLI commands). No resources are created by this task or by CI auto-provisioning:
   - `npx --no-install wrangler r2 bucket create dishly-pdf-imports-eu --jurisdiction eu` — private, Standard storage; leave public `r2.dev` access disabled.
   - `npx --no-install wrangler queues create dishly-pdf-imports`
   - `npx --no-install wrangler queues create dishly-pdf-imports-dlq`
   - Leave the Free retention setting at 24 hours on both queues. Do not use the Paid four-day default or request longer retention. The consumer deployment attaches both queues; do not create an HTTP pull consumer or attach another Worker.
4. Add a lifecycle rule limited to the diagnostic prefix: `npx --no-install wrangler r2 bucket lifecycle add dishly-pdf-imports-eu diagnostic-expiry deployment-probes/ --expire-days 1 --jurisdiction eu`. Confirm it in the R2 dashboard. Expiry can lag and must not replace immediate application cleanup.
5. Bootstrap `dishly-web` manually in Workers & Pages with a minimal placeholder returning HTTP 503, no bindings, and no diagnostic endpoint. This resolves the first-deploy secret preflight: the release workflow requires an existing Worker with secrets, so it cannot create its own initial shell. A suitable dashboard script is `export default { fetch() { return new Response("Not deployed", { status: 503 }); } };`. Keep default CPU settings. Obtain its `workers.dev` URL, then:
   - set that URL as Supabase Auth `SITE_URL`;
   - allow only that production URL and local development URLs;
   - do not whitelist wildcard preview URLs;
   - install `SUPABASE_URL`, `SUPABASE_KEY` (the hosted Supabase publishable key), and `DEPLOY_PROBE_TOKEN` under `dishly-web → Settings → Variables and Secrets` as encrypted secrets. Generate the probe token in a password manager (for example, 32 random bytes encoded as 64 hex characters; maximum 256 characters). Do not add these to the consumer or previews. Supabase is retained for existing app/auth checks; the probe itself bypasses Supabase.
6. Create a custom Cloudflare CI API token scoped to this account for Worker publication and Queue consumer updates: **Workers Scripts: Edit** and **Queues: Edit** (API permission names `Workers Scripts Write` and `Queues Write`). Select only this account in Account Resources; apply narrower Worker/resource scope if available. Do not grant billing, DNS/zone routing, or general account administration. R2 operations at runtime use bindings, not S3 keys; bucket creation/lifecycle administration remains a separate human setup operation. See [Worker permissions](https://developers.cloudflare.com/workers/authorization/) and [Queue consumer API](https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/create/).
7. Store only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in a GitHub `production` environment. Do not copy Supabase application secrets into GitHub.
8. In GitHub repository **Settings → Environments → production**, add required reviewers and restrict deployment branches to `main`. If you are the only reviewer, leave “Prevent self-review” disabled so the manual workflow can be approved by you; otherwise designate another reviewer. The environment name `production` denotes the destination, not a paid Cloudflare plan. Enable Actions for the repository. Reviewer/branch protection must be configured in GitHub ([environment gates](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)).
9. Optional for PR uploads, create a separate GitHub `preview` environment with its own `CLOUDFLARE_ACCOUNT_ID` and Worker-publication token (no Queue permissions needed). Do not put application secrets there or reuse production environment secrets. Same-repository PRs may upload; forks and Dependabot run validation only. If preview credentials are absent, the upload job fails explicitly after validation; this does not block a manual release run on `main`. Confirm `dishly-web-preview` has no application secrets; version uploads preserve existing remote secrets.
10. After reviewing and committing the Free-plan changes, push them, wait for CI, then choose **Actions → Deploy production → Run workflow**, branch `main`, and the exact full commit SHA. Review/approve the environment gate. The workflow deploys the consumer first and the web Worker second. These publication steps are deferred, not executed by this task. Save both version IDs and the URL from its summary.

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
- Check `401` for a missing/incorrect bearer token, then send one body-free authenticated POST. Supply the token through a local environment variable without printing it. Example: `curl --fail-with-body -X POST "$DISHLY_URL/api/ops/deployment-probe" -H "Content-Type: application/json" -H "Authorization: Bearer $DEPLOY_PROBE_TOKEN"`. Expect `202` and only `jobId`/`status` in the body. Never use a real PDF for this step.
- Use `npx --no-install wrangler tail --name dishly-web --format json` and `npx --no-install wrangler tail --config workers/pdf-consumer/wrangler.jsonc --format json`. Match `probe_queued` and `probe_processed` by `job_id`; require `success` and `object_deleted: true`. In R2, confirm `deployment-probes/<jobId>.pdf` is absent and no backlog remains in either queue. Do not infer success solely from the `202` response.
- Inspect Cloudflare's actual CPU metrics/outcomes for both Workers, including cold invocations. Stop if either reports exceeded CPU/memory or repeated retries; optimize the diagnostic first, without upgrading the plan. Save evidence within the three-day Free log-retention window.
- Exercise retryable failure, duplicate delivery, terminal malformed-content handling, and DLQ cleanup through `npm run test:deployment` locally. No production failure-injection endpoint is included. Any later live failure drill must be separately approved and use only synthetic data; do not break storage permissions or enable a paid service to force failure.
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
  - repeated memory/CPU exhaustion: stop probes and inspect CPU metrics; this diagnostic must not trigger a paid-plan or Render activation. Future extraction runtime choices are in the separate production requirements document.
  - auth redirect failures: verify exact Supabase `SITE_URL`, HTTPS scheme, and `workers.dev` hostname.
  - unknown partial deployment: compare recorded version IDs, stop the producer first, and restore the last known compatible web/consumer pair.
- Keep native Workers Logs for the diagnostic; Free retention is three days, so deployment evidence and version IDs belong in the repository artifact ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).

## Assumptions

- This release proves Cloudflare integration and deployment; it does not implement recipe extraction, import tables, user-facing upload UI, or recipe persistence.
- The probe endpoint is retained as a protected deployment diagnostic until the real import endpoint replaces it.
- Production publication, secret rotation, queue purge, resource deletion, and database changes remain human-approved operations.
- A custom domain and authenticated cloud previews are deferred until the `workers.dev` deployment is stable.

## Deployment Record

- Status: phases 0–3 were pushed and passed hosted CI before the Free revision. The Free diagnostic revision below is prepared locally and must be committed/pushed before any later release. Production remains undeployed; account/resource and GitHub setup are still required.
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

- Added `workers/pdf-consumer/` with a standalone entrypoint, Wrangler configuration, and generated runtime/binding types (`npm run types:consumer`). Both the normal queue and DLQ have batch size/concurrency 1, three retries, and a 60-second retry delay. The original paid CPU override was removed in the Free-plan revision below; observability uses full sampling.
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

### Phase 4 — First-release preflight

Checked on 2026-09-22:

- Pushed completed implementation commits through `e150f3f7e8f44fa661ddc0326fe4682f49627202` to `KlaudiaDabrowska/10x-Dishly`, branch `main`.
- Hosted [CI run 35744086189](https://github.com/KlaudiaDabrowska/10x-Dishly/actions/runs/35744086189) passed for that commit: validation in 1m00s, Supabase auth smoke in 1m53s. Preview upload was correctly skipped for a push event.
- GitHub API access has repository admin permissions. Environment listing is empty; `production` lookup returns 404. Repository-level Actions secret listing is also empty. Configure the environments and scoped credentials described in human setup gates before dispatching production.
- In the currently authenticated Cloudflare account `534880b32f50805c58732f581e29cc56`, `dishly-web` is not found, queue listing is empty, and R2 lifecycle lookup fails with provider code `10042` (R2 must be enabled in the dashboard).
- The user subsequently confirmed this is the correct Cloudflare account and requested the Free-plan diagnostic revision below. The missing resources/environments still require the separate human setup above. No production dispatch, Worker publication, resource creation, or secret mutation was performed.

### Workers Free revision — 2026-09-22

- Removed the consumer's `300000` ms CPU setting. The deployment guard now requires absence of a custom CPU limit on both Workers and retains batch size/concurrency 1, three retries, 60-second retry delay, EU R2 binding, and full diagnostic log sampling.
- Kept the fixed 41-byte marker and sub-1-KiB message. Added bounded authorization hashing (token at most 256 characters and exact header length) and message-field length checks. Regression tests verify request upload bytes are ignored and oversized objects are deleted as terminal failures without reading their body.
- Separated real extraction requirements into `context/deployment/pdf-processing-requirements.md` and marked the foundation research's paid-runtime recommendation as future extraction scope.
- Local results: lint passed; Astro check passed (40 files, zero errors/warnings/hints); 12 probe tests and seven configuration/publication tests passed. Regenerating consumer binding types required no generated-file changes.
- Production and isolated-preview builds/config checks and web, consumer, and preview dry runs passed. Eight preview HTTP assertions passed, including `503 infrastructure_unavailable` for the probe.
- Both Workers ran together with `wrangler dev --local` and isolated local persistence. Wrong token returned `401`; the synthetic token returned `202`; the queue consumer logged `success`, `object_deleted: true`, attempt 1 for the same job ID. The application elapsed duration is not a CPU measurement. No Supabase credentials were supplied to this local diagnostic runtime.
- Local servers were stopped and normal production build output restored. Expected warnings remain for absent local probe credentials, intentionally absent preview R2, and unset sitemap site. No remote metrics, resource state, Free CPU enforcement, billing settings, or hosted auth were revalidated in this revision.
- No paid plan was enabled, no cloud resources were created, no production deployment/workflow was run, and no commit/push was performed for this revision. The earlier hosted CI result applies to the earlier commit only.
