<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Private recipe collection

- **Plan**: [plan.md](../plan.md)
- **Brief**: [plan-brief.md](../plan-brief.md)
- **Mode**: Deep
- **Date**: 2026-09-26
- **Reviewed revision**: `686fb39` (plan introduced in `afdb1c9`)
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 7/7 modified paths verified, 3/3 identity/session symbols verified, brief and plan consistent. Both phases map to the single canonical Progress section; all 11 success criteria match their Automated/Manual Progress rows exactly, all remain unchecked, and there are no execution checkboxes outside Progress.

Verified paths: `src/middleware.ts`, `scripts/smoke.mjs`, `scripts/check-preview.mjs`, `docs/reference/contract-surfaces.md`, `src/pages/dashboard.astro`, `src/pages/api/auth/signin.ts`, and `src/components/Topbar.astro`.

Verified identity/session symbols: `PROTECTED_ROUTES`, `supabase.auth.getUser()` and `context.locals.user`. Build/smoke commands and isolated-preview behavior also match the existing configuration. Lessons and the contract registry contain no additional rules or registered surfaces.

## Findings

None. No plan edits or triage are required before phase 1.

## Deep Verification Evidence

One independent read-only reviewer verified the risky framework/SDK claims and searched affected callers. The primary review checked document consistency, scope against S-01/PRD, file contracts, UI/routing and verification coverage.

- **Response policy and cookies:** `src/middleware.ts:8` contains the independent probe branch, `:19` the early 503 and `:33` the anonymous redirect. Astro awaits application middleware and then attaches accumulated cookies (`node_modules/astro/dist/core/middleware/astro-middleware.js:40`; `node_modules/astro/dist/core/app/prepare-response.js:3`). The planned cache policy is feasible without a Supabase helper signature change, provided status, Location and cookie handling remain intact as specified.
- **Refresh test:** the installed SDK checks serialized `expires_at` in `__loadSession()` and calls `_callRefreshToken()` (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:3069`, `:3114`). `getUser()` reaches that path (`:3255`), and SSR writes refreshed cookies on `TOKEN_REFRESHED` (`node_modules/@supabase/ssr/src/createServerClient.ts:198`). Making only stored expiry metadata stale can exercise refresh; the plan correctly distinguishes this from expiring a signed JWT.
- **Existing verification infrastructure:** `.github/workflows/ci.yml:46` supplies Node 24, local Supabase and a built Worker for `npm run smoke`; `supabase/config.toml:209` disables local email confirmation. Extending the existing HTTP runner to two actors requires no new framework or recipe schema.
- **Routing and affected callers:** successful sign-in currently redirects to `/` (`src/pages/api/auth/signin.ts:19`); Topbar and smoke reference the protected dashboard (`src/components/Topbar.astro:10`, `scripts/smoke.mjs:40`). These are covered by the plan. The preview checker already covers `/dashboard`; no route migration or additional CI job is required.
- **Scope and promises:** S-01 establishes an empty authenticated entry point. The plan explicitly defers persisted recipe ownership/RLS, import and browsing to later slices, and does not claim full FR-006/US-02 completion. Each promised change has a file contract and verification criteria.

## Verification Boundaries

This was a document/source review with a mechanical Progress check, not execution of the future implementation. No application build, live Supabase/Worker request, browser test or production configuration check was performed. Runtime and manual criteria remain pending.

The planned refresh-then-signout sequence is valid. It does not separately exercise a signout request that itself triggers refresh in middleware; separate middleware/endpoint clients reading original cookies are a pre-existing potential concern, not a demonstrated defect or a reason to mandate an auth refactor here. A failure observed during implementation must be investigated rather than waived.

## Next Step

Run `/10x-implement private-recipe-collection phase 1`. This review does not authorize deployment or mark any implementation criterion complete.
