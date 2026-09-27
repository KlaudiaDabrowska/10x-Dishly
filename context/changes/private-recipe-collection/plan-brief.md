# Private recipe collection — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Deliver roadmap S-01 (`private-recipe-collection`): the first private Dishly screen after login, with a clear empty collection. It establishes the authenticated entry point for later import and recipe browsing.

## Starting Point

Email/password authentication, a protected `/dashboard`, Supabase session validation and Worker-based HTTP smoke tests already exist. The dashboard is a demonstration page; login currently returns to `/`, and explicit private-response cache headers are missing.

## Desired End State

Successful login opens `/dashboard`, titled “Your recipes | Dishly”, with the current account email and signout. The page shows “Your recipes”, “No recipes yet” and “Your saved recipes will appear here.” Separate accounts remain isolated, anonymous requests redirect to sign-in, and session-dependent responses are private/non-cacheable.

## Key Decisions Made

| Decision       | Choice                                                                         | Why                                                                                           | Source                               |
| -------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| Scope          | Private empty entry point only                                                 | Recipe persistence and operations belong to later slices.                                     | Roadmap S-01                         |
| Route          | Keep `/dashboard`; successful login redirects there                            | Reuses existing protection and avoids a route migration.                                      | Code research; approved plan outline |
| Authentication | Keep `getUser()` and the existing email/password flow                          | Identity is validated on the server already.                                                  | Code research; PRD                   |
| Cache          | Enforce private/no-store on the middleware session branch, including redirects | The homepage is also personalized; cookies and content must not be reused across accounts.    | Code research; Supabase guidance     |
| UI             | Existing English language/styles; empty state and signout only                 | Keeps the agreed first slice small and avoids nonfunctional import controls.                  | Approved plan outline                |
| Verification   | Extend existing HTTP smoke; manual browser gate                                | Built Worker plus local Supabase provides meaningful auth evidence without another framework. | Existing CI                          |
| Structure      | Two phases; medium complexity; zero further product questions                  | Upstream documents settle product scope.                                                      | User approval, 2026-09-26            |

## Scope

**In scope:** private-response cache policy, separate-account tests, malformed-session denial, preserved refresh/logout behavior, empty collection, direct login destination, navigation label, responsive/keyboard checks and a concise contract registry update.

**Out of scope:** PDF/AI work, recipe schema/RLS/APIs, sample recipes, filters, import controls, auth redesign, translations, landing-page redesign, infrastructure changes and deployment. This slice does not complete FR-006 or US-02, or prove isolation of future stored recipe rows.

## Architecture / Approach

Request → existing Supabase-backed middleware → verified `locals.user` → server-rendered collection. Middleware adds a private/no-store policy to its session-handling responses while preserving redirects and cookies. The operational probe retains its separate bypass. No database migration, client island, new library or client-helper signature change is needed.

## Phases at a Glance

| Phase                                                     | What it delivers                                                                                | Key risk                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Protect private responses and verify session isolation | Cache policy, separate-account/invalid-session smoke, preview regression and identity contracts | Dropping cookies or missing early redirects while setting headers    |
| 2. Deliver the empty private collection                   | Collection UI, direct login destination, navigation and completed-flow checks                   | Passing a status-only test while showing the wrong screen or account |

**Prerequisites:** Node 24 as used by CI, Docker/local Supabase, local Worker and disposable local test accounts. Existing CI provides the setup; credentialless preview cannot validate authenticated success. No F-01 AI decision is needed.

**Estimated effort:** approximately 2 focused implementation sessions plus manual browser verification, assuming local infrastructure is available. This is an unmeasured planning estimate for this slice, not a revised whole-MVP schedule.

## Open Risks & Assumptions

- Hosted email-confirmation and cache rules were not inspected; local smoke uses confirmation-disabled Supabase. Deployment and hosted configuration changes are outside this plan.
- Response-header changes must preserve every Set-Cookie value. Include an explicit local refresh-then-signout manual check; an expired access token may legitimately refresh.
- HTTP tests do not establish keyboard/mobile usability or browser-history behavior; both phases retain manual gates.
- A preview build replaces normal build output. Rebuild normally before authenticated testing. Node 24 is the verification baseline despite the older `.nvmrc` entry.

## Success Criteria (Summary)

- Registration/login reaches the private empty collection; navigation, current email and signout work in Chrome and Firefox at desktop/mobile widths.
- Independent accounts never receive each other's identity; missing/malformed sessions and signed-out requests cannot retrieve private content; session-dependent responses carry private/no-store.
- Static checks, real local Worker/Supabase smoke, isolated-preview checks and existing diagnostic/configuration tests pass. All implementation checks start pending.

## References

- [Roadmap](../../foundation/roadmap.md), [PRD v3](../../foundation/prd.md), [tech stack](../../foundation/tech-stack.md).
- `src/middleware.ts`, `src/pages/dashboard.astro`, `src/pages/api/auth/signin.ts`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`.
- [Supabase SSR cache guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide#can-i-use-server-side-rendering-with-a-cdn-or-cache).
