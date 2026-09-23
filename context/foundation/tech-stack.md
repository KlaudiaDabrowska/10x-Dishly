---
starter_id: 10x-astro-starter
package_manager: npm
project_name: dishly
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: manual-production-deploy
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
---

## Why this stack

Dishly uses TypeScript across Astro/React UI and backend, Supabase for accounts and private recipe persistence, and the existing Cloudflare Workers deployment. GitHub Actions validates changes; production publication uses the existing manual deployment workflow.

## Accepted import architecture — 2026-09-23

Browser-local PDF text reading → authenticated backend → AI recipe extraction from text/layout/page context → backend validation → private recipe persistence. The original PDF is not uploaded to the backend, object storage, or AI provider. The browser keeps page/column context so ingredient variants and instructions are not flattened together. PDF.js is an implementation candidate, not a newly installed or locked dependency.

The backend owns credentials, request/import limits, provider calls, validation, ownership and idempotent saves. AI interprets recipes but does not write to the database. Complete recipes save automatically; detected incomplete ones require keep/discard. AI is used during import, not routine browsing or filtering.

Users keep the tab open until import completes. App-held temporary data is released after completion/failure/cancellation; the user's original file stays untouched. Already submitted provider work and confirmed writes require explicit reconciliation on interruption.

For the summer ebook, preserve four cards with three labelled ingredient-quantity variants per dish and shared instructions. Limits remain 20 MB / 100 pages. Provider/model, cost controls and data-use/retention terms are unresolved; no paid plan is selected.

## Existing infrastructure versus planned capability

The background-job hint describes the existing diagnostic Queue consumer, not a requirement to parse user PDFs in it. R2/Queues and the marker diagnostic remain installed infrastructure; this decision neither removes them nor makes them the user-import path. AI integration and recipe persistence are planned, not implemented.

This supersedes the starter assumptions of Pages, automatic production deployment on merge, no AI, and mandatory server-side PDF parsing in a queued worker. See [PRD](prd.md), [processing requirements](../deployment/pdf-processing-requirements.md) and [deployment record](../deployment/deploy-plan.md).
