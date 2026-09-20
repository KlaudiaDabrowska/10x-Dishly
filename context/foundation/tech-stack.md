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

## Why this stack

Dishly is a small, three-week, after-hours web MVP that benefits from one typed language across the UI, API, and extraction pipeline. The 10x Astro Starter is the recommended JavaScript/TypeScript web starter and supplies React, PostgreSQL, private-account authentication, and a convention-based Cloudflare deployment path. GitHub Actions will automatically deploy changes merged to `main`. Because PDF extraction may run for up to five minutes, it must execute as a separate TypeScript background worker or queued job rather than inside a Cloudflare request handler; this is additional setup beyond the starter's first-class capabilities.
