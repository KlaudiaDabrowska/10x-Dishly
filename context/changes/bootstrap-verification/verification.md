---
bootstrapped_at: 2026-09-20T11:43:35Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: dishly
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: dishly
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
---
```

## Why this stack

Dishly is a small, three-week, after-hours web MVP that benefits from one typed language across the UI, API, and extraction pipeline. The 10x Astro Starter is the recommended JavaScript/TypeScript web starter and supplies React, PostgreSQL, private-account authentication, and a convention-based Cloudflare deployment path. GitHub Actions will automatically deploy changes merged to `main`. Because PDF extraction may run for up to five minutes, it must execute as a separate TypeScript background worker or queued job rather than inside a Cloudflare request handler; this is additional setup beyond the starter's first-class capabilities.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | Starter is cloned directly; no create-package could be derived from the command. |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed 2026-09-12T21:16:08Z | fresh | From the starter card's documentation URL. |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 30618
**Conflicts (.scaffold siblings)**: `AGENTS.md.scaffold`
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

The cloned starter's `.git/` directory was removed before merging. The existing root `AGENTS.md` was preserved.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | false |
| has_background_jobs | true |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
