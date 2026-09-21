---
project: Dishly
researched_at: 2026-09-20
recommended_platform: Cloudflare Workers + Queues
runner_up: Netlify + Background Functions
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3 + React 19
  runtime: Cloudflare Workers
---

## Recommendation

**Deploy on Cloudflare Workers + Queues.**

This is the only shortlisted option that preserves the repository's existing `@astrojs/cloudflare` 14 adapter and Wrangler 4 configuration while providing a managed asynchronous job primitive for PDF imports. It best matches the cost-first, single-region MVP constraints: Workers Paid starts at $5/month and includes the Queues capability needed for durable retries, while the accepted memory, CPU, and cross-provider database risks are explicitly mitigated below. The target is Workers, not a new Pages project: current Astro and Cloudflare guidance directs new full-stack Astro applications to Workers.

## Platform Comparison

`Pass` = strong, documented fit; `Partial` = usable with a material limitation or operational gap; `Fail` = unsuitable for this criterion. The qualitative criteria are supplemented by project-specific cost and migration weights.

| Platform | CLI-first | Managed/serverless | Agent-readable docs | Stable deploy API | MCP/integration | Project fit |
|---|---|---|---|---|---|---|
| Cloudflare Workers + Queues | Pass | Pass | Pass | Pass | Pass | **1st** — existing adapter, native queue, ~$5 base |
| Netlify | Pass | Pass | Pass | Pass | Pass | **2nd** — 15-minute jobs, but adapter migration and credit uncertainty |
| Render | Pass | Pass | Pass | Pass | Partial | **3rd** — strong Workflows primitive, but Node migration and higher full-stack cost |
| Vercel | Pass | Pass | Pass | Pass | Partial | 300-second Hobby ceiling has no safety margin; Queues and MCP are Beta |
| Railway | Pass | Partial | Pass | Partial | Pass | Always-on worker/queue increases cost; arbitrary rollback is dashboard-only |
| Fly.io | Pass | Partial | Pass | Pass | Partial | Flexible processes, but more lifecycle work and experimental MCP |

**Cloudflare Workers + Queues.** The CLI covers deploy, logs, secrets, queues, and rollback; documentation is available in agent-readable Markdown; the official Cloudflare MCP is available without a Beta marker. Queue consumers have a 15-minute wall-clock limit and configurable CPU up to 300 seconds on Workers Paid. The 128 MB memory ceiling is the principal technical risk. Pricing and limits: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

**Netlify.** Astro SSR and 15-minute Background Functions are supported, and the platform has excellent CLI, API, Markdown documentation, and an official MCP server. It requires replacing the Cloudflare adapter and configuration. The credit model makes compute-heavy import costs less predictable, while plain Background Functions offer a less explicit durable-workflow model than Cloudflare Queues. Sources: [Astro on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/astro/), [Background Functions](https://docs.netlify.com/build/functions/background-functions/), [credit pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

**Render.** Render Workflows, GA as checked on 2026-09-20, supplies managed queuing, retries, and scale-to-zero task execution with ample duration for five-minute imports. The MCP cannot yet create Workflows or Background Workers, and rollback is API/dashboard based rather than a dedicated CLI command. Hosting the app there requires replacing the Cloudflare adapter with `@astrojs/node`; conventional web, worker, queue, and database services can also exceed the MVP budget. Sources: [Workflows](https://render.com/docs/workflows), [Workflow limits](https://render.com/docs/workflows-limits), [Astro deployment](https://render.com/docs/deploy-astro), [MCP limitations](https://render.com/docs/mcp-server).

**Vercel.** Astro SSR is supported after an adapter migration. A Hobby function may run for at most 300 seconds, exactly the import requirement and therefore without a safe margin. Vercel Queues and the official Vercel MCP are **Beta** as checked on 2026-09-20. Sources: [function duration](https://vercel.com/docs/functions/configuring-functions/duration), [Queues](https://vercel.com/docs/queues), [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp).

**Railway.** Persistent Node services make the job technically straightforward, with strong CLI, API, readable docs, and official MCP. A polling worker normally prevents serverless sleep, however, and Redis/Postgres templates add compute and operational responsibility. Railway's Postgres template is user-operated rather than a fully managed equivalent to Supabase. Arbitrary rollback remains dashboard-only. Sources: [Astro guide](https://docs.railway.com/guides/astro), [pricing](https://docs.railway.com/pricing/plans), [MCP](https://docs.railway.com/ai/mcp-server).

**Fly.io.** Machines are a good execution environment for persistent or long-running workers, but the project would need a Node adapter, container setup, and careful autostop configuration. Managed Postgres starts far above the budget for this MVP, and `fly mcp server` is **experimental** as checked on 2026-09-20. Sources: [Astro deployment](https://docs.astro.build/en/guides/deploy/flyio/), [pricing](https://fly.io/docs/about/pricing/), [MCP server](https://fly.io/docs/mcp/flyctl-server/).

### Shortlisted Platforms

#### 1. Cloudflare Workers + Queues (Recommended)

It retains the already-installed runtime and deployment tooling, offers a durable managed queue, and has the lowest predictable base cost. Its limits are acceptable only after a representative 100-page PDF proves that extraction stays below 128 MB and comfortably below 300 CPU-seconds.

#### 2. Netlify + Background Functions

Netlify's 15-minute Background Functions provide more duration headroom and its agent-facing tooling scores strongly. It loses to Cloudflare because migration work adds delivery risk within the three-week schedule and its credit consumption is less predictable for PDF processing.

#### 3. Render + Workflows

Render provides the most forgiving managed job execution of the shortlist and is the preferred fallback if the Cloudflare proof of concept fails. It ranks third because moving the full app requires a Node runtime migration and a conventional multi-service setup can cost materially more.

## Anti-Bias Cross-Check: Cloudflare Workers + Queues

### Devil's Advocate — Weaknesses

1. A Queue Consumer has 128 MB of memory; a 20 MB PDF can expand into a much larger in-memory document representation and terminate the Worker.
2. The configurable 300-second CPU maximum equals the product's absolute import limit, leaving no safety margin for difficult PDFs, retries, or serialization.
3. CPU-heavy extraction is not viable on the Free plan's invocation CPU allowance, so the $5 Workers Paid plan is a real minimum rather than an optional upgrade.
4. PostgreSQL remains in Supabase. Cross-provider latency or transient network failures can leave partial writes unless the import transaction and retry design are explicit.
5. `wrangler rollback` restores Worker code but does not reverse database migrations, Queue/R2 state, or incompatible binding changes.

### Pre-Mortem — How This Could Fail

Six months after launch, Cloudflare proved to be the wrong choice because the team treated the five-minute CPU limit as five safe minutes for every PDF. Some books expanded beyond 128 MB during parsing, while others approached the CPU ceiling and were repeatedly terminated. The queue correctly retried them, but the import was not idempotent, so partially written recipes became duplicates. The temporary-file cleanup policy was also coupled to the first attempt rather than final job state: some PDFs disappeared before a retry could read them, while dead-lettered files remained longer than the privacy promise allowed. Writes to external Supabase were not atomic across a complete import, and intermittent network failures produced half-saved collections. Costs remained low, but diagnosis was slow because logs from the web Worker, queue consumer, storage, and Supabase lacked a shared import identifier. The team eventually moved extraction to a larger-memory Node worker, leaving two deployment platforms and more operational work than the original recommendation had anticipated. A representative load test and explicit job-state model would have exposed these constraints before platform commitment.

### Unknown Unknowns

- Queue messages are limited to 128 KB, so a PDF must be stored temporarily and the message must carry only an import ID and object key.
- Queue delivery can be retried; every import and recipe write must be idempotent rather than assuming exactly-once execution.
- Immediate PDF deletion must mean deletion after terminal success or terminal failure, including DLQ handling—not after the first processing attempt.
- Astro 7 with `@astrojs/cloudflare` 14 uses the Workers path already represented by `wrangler.jsonc`; older Pages tutorials describe a superseded workflow for this repository.
- Adding a queue consumer beside Astro's generated entrypoint must be proven against the pinned adapter before relying on a custom entrypoint or export pattern.

## Operational Story

- **Preview deploys**: pull requests produce isolated preview Workers through the CI workflow; previews use non-production Supabase credentials and must not process real user PDFs. If previews are publicly reachable, protect them with Cloudflare Access. Fork PRs do not receive repository secrets and therefore run validation only.
- **Secrets**: production secrets live in Cloudflare Workers Secrets and CI deployment credentials live in GitHub Actions Secrets; Supabase service credentials are never committed or placed in `wrangler.jsonc`. Use `npx wrangler secret put NAME` for rotation, deploy consumers, verify, then revoke the old credential. Human approval is required for production-secret rotation.
- **Rollback**: list versions and run `npx wrangler rollback [VERSION_ID]`; code activation is normally immediate. Rollback does not reverse database migrations, queued messages, object state, or binding changes, so schema changes require a separately reviewed forward-fix or compatible migration plan. See [Cloudflare rollback behavior](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
- **Approval**: the agent may build, run tests, deploy previews, inspect logs, and prepare a production deployment. A human approves production publication, primary-secret rotation, destructive queue purge, database migration, database deletion, and project deletion.
- **Logs**: use `npx wrangler tail` for read-only live Worker logs and Cloudflare's dashboard/API for retained observability. Every web request and queue attempt logs the same `import_id`; Supabase logs are queried separately using that identifier.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| PDF parsing exceeds 128 MB Worker memory | Devil's advocate | M | H | Before implementation commitment, load-test a representative 100-page/20 MB PDF; if it fails, move only extraction to Render Workflows. |
| Extraction reaches the 300-second CPU ceiling | Devil's advocate | M | H | Benchmark with at least 20 diverse ebooks and require p95 CPU below 240 seconds to preserve a 20% margin. |
| Duplicate or partial recipes after queue retry | Pre-mortem | M | H | Assign immutable `import_id` and deterministic recipe keys; use database uniqueness constraints and transactional finalization. |
| PDF deleted too early or retained after failure | Unknown unknowns | M | H | Model queued, processing, retry, terminal-success, and terminal-failure states; delete only in terminal cleanup and monitor the DLQ. |
| Supabase network failure causes partial import | Devil's advocate | M | H | Stage rows by `import_id`, use transactions where possible, and expose results only after an atomic completed-state update. |
| Rollback cannot undo data/schema changes | Research finding | M | H | Keep schema changes backward-compatible across two app versions and use reviewed forward migrations. |
| Logs cannot correlate distributed stages | Pre-mortem | M | M | Propagate and log `import_id`, attempt number, object key, and terminal state across Worker, Queue, storage, and database. |
| Queue integration conflicts with Astro-generated entrypoint | Unknown unknowns | M | H | Build a small queue-consumer proof of concept on Astro 7.3 / adapter 14.3 / Wrangler 4.131 before feature implementation. |
| Workers costs exceed the $5 base through CPU usage | Research finding | L | M | Add usage alerts and record CPU time per import; reassess after the first 100 representative imports. |
| Preview environment accesses production data | Research finding | L | H | Use separate preview credentials/data and withhold secrets from untrusted fork builds. |

## Getting Started

1. Keep the existing Astro 7.3, `@astrojs/cloudflare` 14.3, and Wrangler 4.131 configuration; do not add a Pages project or reinstall the adapter. Confirm the current application with `npm run build` and `npx wrangler deploy --dry-run`.
2. Create a minimal Queue producer/consumer proof of concept using the pinned Wrangler version. Pass only `{ import_id, object_key }`, not PDF bytes, and confirm the consumer coexists with Astro's generated Worker entrypoint. Use [Cloudflare Queues configuration](https://developers.cloudflare.com/queues/configuration/configure-queues/).
3. Run representative extraction benchmarks locally and in the deployed consumer, including a 100-page/20 MB file. Record peak memory, CPU time, retry behavior, and require CPU headroom below the 300-second maximum.
4. Store PDFs temporarily in a private object store, create explicit terminal cleanup and DLQ handling, and configure production Supabase values with `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` rather than plaintext configuration.
5. Deploy with `npm run build` followed by `npx wrangler deploy`; verify the health route, enqueue an import, observe it using `npx wrangler tail`, confirm idempotent retry, and confirm PDF deletion after both terminal success and terminal failure. Current Astro workflow: [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) and [Cloudflare Astro guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/).

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
