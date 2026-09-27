# Private recipe collection Implementation Plan

## Overview

Deliver roadmap S-01 (`private-recipe-collection`): a signed-in user enters their own empty recipe collection using the existing email/password authentication. Anonymous visitors are redirected to sign-in; another account's identity must never appear in the response.

Source contract: `context/foundation/roadmap.md`, PRD v3 FR-001, the entry-point portion of FR-006/US-02, and Access Control. This slice does not complete FR-006 or US-02. On 2026-09-26 the user approved medium complexity, zero additional product questions, and two phases: private response/session protection, then the empty collection screen. Planning authorizes documentation only.

## Current State Analysis

- `src/middleware.ts:4` protects `/dashboard`; `:25` validates identity with `supabase.auth.getUser()` and `:33` redirects anonymous visitors to `/auth/signin`. Preserve this verified-user boundary.
- `src/lib/supabase.ts:5` creates a client per request and disables it for isolated previews or absent configuration. Cookie updates use Astro's cookie API. Its `setAll` callback at `:14` does not apply the SDK's cache headers; middleware currently supplies no explicit private-response cache policy.
- `src/pages/dashboard.astro:7` renders a demonstration dashboard with the current email and sign-out form. There is no collection UI, recipe model, recipe API, or migration.
- Successful sign-in redirects to `/` (`src/pages/api/auth/signin.ts:19`). Signup redirects to `/auth/confirm-email`; signout returns to `/`. Local signup confirmation is disabled, while deployed settings were not inspected.
- `src/components/Topbar.astro:11` links to `/dashboard` using the label “Dashboard”. The existing UI and document language are English.
- `scripts/smoke.mjs:23` drives real HTTP requests with one cookie jar. It only returns status and Location; `:66` matches redirect prefixes, so the expected `/` accepts any absolute-path redirect.
- `.github/workflows/ci.yml` already runs this smoke against a built Cloudflare Worker and local Supabase. Preview deliberately returns 503 for protected pages. CI uses Node 24; `.nvmrc` still names 22.14.0. Use the CI runtime for verification; updating runtime documentation is outside this change.

## Desired End State

- `/dashboard` remains the sole collection entry point and stays server-rendered. Successful sign-in redirects there with the existing 302 behavior.
- The document title is “Your recipes | Dishly”; the main heading is “Your recipes”. Show the verified current account email, an existing POST sign-out control, and the empty state “No recipes yet” / “Your saved recipes will appear here.”
- The Topbar collection link reads “Your recipes” and still points to `/dashboard`. Retain the English language and existing visual primitives. Use a responsive layout, semantic main/heading structure, visible keyboard focus and wrapping for long email addresses.
- No import button, filters, recipe fixtures, recipe cards, fake counts, or owner selector are shown. The collection is empty because recipe persistence is not implemented in this slice.
- Identity comes exclusively from the authenticated request. Query parameters such as `user_id` do not select an account. Requests from separate accounts render only their own email.
- All responses passing through application session middleware, except the existing operational-probe bypass, carry a Cache-Control policy containing `private` and `no-store`. This includes personalized `/`, collection HTML, auth redirects and the existing 503 branches. Existing status, Location and Set-Cookie behavior remains intact.
- Missing/invalid sessions cannot retrieve protected content. Expired access tokens may refresh through the existing SDK; absence of a valid user after validation still denies access. Signout followed by a new collection request redirects to sign-in.

### Key Discoveries:

- The roadmap explicitly defers protection of recipe operations to the slices that introduce them (`context/foundation/roadmap.md`, S-01 Risk). No database table is needed merely to display this entry point.
- Public `/` also renders account-specific content through Topbar, so a policy limited to `/dashboard` would miss an existing personalized response.
- The installed SDK supplies cache headers when refreshing cookies (`node_modules/@supabase/ssr/src/cookies.ts:645`). A middleware-level `private, no-store` policy covers both refreshed sessions and ordinary personalized responses without redesigning the client helper. See the [Supabase SSR cache guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide#can-i-use-server-side-rendering-with-a-cdn-or-cache).
- Existing smoke/CI infrastructure is sufficient for HTTP and account-isolation checks; there is no browser automation framework to reuse. Browser usability remains an explicit manual gate.

## What We're NOT Doing

- PDF selection, reading, AI integration, recipe persistence, migrations, RLS, import results or recipe browsing/filtering/editing/deletion.
- A collection table, public/owner-addressed collection URLs, a recipe API, an in-memory recipe store or demo data.
- Rebuilding authentication, adding OAuth/password recovery/callback routes, changing email confirmation settings, changing signout scope, or refactoring all clients into a shared request service.
- A landing-page redesign, translation of auth forms, a new design system, client-side collection state or a new testing framework.
- Deployment, infrastructure changes, new paid services, changes to the diagnostic probe, or declaring future recipe-row privacy verified.

## Implementation Approach

Keep the existing route and server-authenticated identity. First establish a response cache policy and strengthen the current HTTP smoke test while the dashboard is unchanged. Then replace its contents with the empty collection, connect successful login and navigation, and extend the same tests to verify the finished user flow.

Apply the cache policy centrally in middleware to every response in its session-handling branch, including early returns, instead of wiring SDK callback headers separately into each auth endpoint. Keep the operational probe's existing independent branch untouched. No dependency or client-helper signature change is required.

Record the new route, identity and cache invariants in `docs/reference/contract-surfaces.md` as part of implementation. The plan's Progress below is the only execution checklist.

## Critical Implementation Details

### Response lifecycle

The cache policy must survive both early middleware redirects and responses returned by `next()`. Preserve all existing response headers and Astro-managed Set-Cookie values; creating a fresh response without them can silently break login, refresh or signout. Test the built Worker, not only the source or development server.

### Verification environment

`build:preview` replaces the built output with an intentionally credentialless preview. Stop its server and rebuild the normal application before authenticated smoke testing; a preview 503 is expected and is not evidence that authentication works. Use disposable local accounts and local Supabase configuration following the existing CI smoke job.

## Phase 1: Protect private responses and verify session isolation

### Overview

Preserve the existing authentication flow while making private responses explicitly non-cacheable and exercising account isolation through real HTTP requests.

### Changes Required:

#### 1. Middleware response policy

**File**: `src/middleware.ts`

**Intent**: Prevent storage and reuse of session-dependent responses, including the existing personalized homepage and redirects. Preserve identity validation and existing failure behavior.

**Contract**: All responses from the session-handling branch have Cache-Control directives `private` and `no-store`, including successful HTML, auth redirects and infrastructure-unavailable 503s. Keep `getUser()`, request-local `locals.user`, protected-route matching, 302 sign-in redirects and the operational-probe bypass. Preserve Location, status, body and cookie updates. Do not serve protected markup when user validation fails.

#### 2. HTTP session and cache assertions

**File**: `scripts/smoke.mjs`

**Intent**: Turn the current status-only smoke into evidence that distinct sessions remain separate and protected responses are not cacheable.

**Contract**: Keep `BASE_URL`, `npm run smoke`, dependency-free Node execution and nonzero exit on failure. Support an independent cookie jar per actor; return body, status, Location and selected cache headers to assertions. Compare redirect pathnames exactly and inspect error query parameters explicitly. Create two unique local accounts, preserve each response's cookie updates, and interleave A/B requests. Verify each account sees its own email and never the other's, including `/dashboard?user_id=<other-account-email>` and the personalized homepage. The query is merely an untrusted ownership hint, not a supported account identifier. Anonymous, malformed-session and signed-out requests must redirect without account content. Check private/no-store directives on HTML, signup/signin/signout redirects and failed-login responses. Keep all existing auth scenarios and their phase-1 destinations. Do not print passwords, tokens, cookies or complete response bodies.

#### 3. Credentialless preview regression

**File**: `scripts/check-preview.mjs`

**Intent**: Prove the response policy does not turn an isolated preview into an authenticated or falsely successful collection.

**Contract**: Retain the exact current status and JSON expectations, especially `/dashboard` and auth APIs returning 503 with `infrastructure_unavailable`. Add private/no-store assertions for the non-probe application responses. Leave the operational-probe expectation and its separate policy unchanged.

#### 4. Session contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Document the identity source and response-cache boundary that later recipe work must preserve.

**Contract**: Add concise entries for `/dashboard`, `App.Locals.user` populated via `getUser()`, the session-handling response cache policy and the probe exemption. Explicitly distinguish this entry-point guarantee from future recipe ownership/RLS rules.

### Success Criteria:

#### Automated Verification:

- Static checks pass on Node 24: `npx --no-install astro sync`, `npm run lint`, and `npx --no-install astro check`.
- The normal Worker build succeeds, and `BASE_URL=http://localhost:4321 npm run smoke` passes the existing auth flow plus separate-account, ownership-hint, malformed-session and cache assertions against local Supabase.
- The preview build succeeds, and `BASE_URL=http://localhost:4321 node scripts/check-preview.mjs` passes unchanged status/body expectations plus application cache assertions against that preview Worker.
- Existing diagnostic and deployment-contract tests pass: `npm run test:deployment` and `npm run test:deploy-config`.

#### Manual Verification:

- Two separate browser sessions retain their own email across reloads; signout followed by direct dashboard navigation denies access, and browser Back/reload does not restore a usable signed-in screen.
- In a disposable local session, force SDK refresh by making its stored expiry metadata stale while retaining valid tokens; dashboard access renews cookies, and subsequent signout plus a new dashboard request still denies access.

**Implementation Note**: After automated checks pass, obtain the user's confirmation of these manual results before moving to phase 2. Record evidence and commit references only through the implementation workflow.

---

## Phase 2: Deliver the empty private collection

### Overview

Make the protected entry point useful as the first Dishly screen and connect it directly to successful login, with clear empty-state feedback.

### Changes Required:

#### 1. Collection page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the starter dashboard with the user's private empty collection using the existing Layout and Tailwind styles.

**Contract**: SSR `/dashboard` retains its middleware protection. Render the specified title, “Your recipes” heading, verified email and “No recipes yet” / “Your saved recipes will appear here.” text. Preserve POST `/api/auth/signout` and its “Sign out” control. Provide semantic main content, responsive sizing, email wrapping and visible focus. Render no import/filter/recipe controls, fixtures or shared user state; no client island or database access is needed.

#### 2. Successful login destination

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Take the user straight to their collection after successful login.

**Contract**: Change only the successful redirect target to `/dashboard`, keeping the existing 302 behavior, form field names, SDK call, failure redirects and cookie handling. Signup/confirmation and signout destinations remain unchanged.

#### 3. Collection navigation label

**File**: `src/components/Topbar.astro`

**Intent**: Make the existing collection link recognizable from the homepage.

**Contract**: Replace “Dashboard” with “Your recipes” while preserving `/dashboard`, current-user email and existing signed-in/signed-out branches.

#### 4. Completed-flow verification and route contract

**Files**: `scripts/smoke.mjs`, `docs/reference/contract-surfaces.md`

**Intent**: Verify and document direct entry into the actual collection instead of the demonstration page.

**Contract**: Update successful-signin expectation to the exact `/dashboard` pathname. Assert collection title/heading, empty-state messages, current email and signout form for both users; assert the homepage's renamed collection link. Repeat the signed-out denial and private-cache checks from phase 1. Preserve signup and error cases. Update the route registry with successful login's destination and the empty-only scope. CI already invokes the script and requires no new job.

### Success Criteria:

#### Automated Verification:

- Static checks pass on Node 24: `npx --no-install astro sync`, `npm run lint`, and `npx --no-install astro check`.
- The normal Worker build succeeds, and `BASE_URL=http://localhost:4321 npm run smoke` passes direct login-to-collection, exact redirects, English empty-state content, navigation, separate-account isolation, signout and cache checks against local Supabase.
- The preview build and `BASE_URL=http://localhost:4321 node scripts/check-preview.mjs` retain the protected-page 503 contract; `npm run test:deployment` and `npm run test:deploy-config` still pass.

#### Manual Verification:

- In Chrome and Firefox at desktop and mobile widths, registration followed by login reaches the collection; its empty state, current email and signout are clear, keyboard-accessible and free of horizontal overflow, including a long email address.
- On the completed screen, reload preserves the account, two independent sessions show only their own identity, and signout followed by Back/reload or direct `/dashboard` access cannot retrieve private collection content.

**Implementation Note**: After automated checks pass, obtain the user's confirmation of the manual results before marking this phase complete. Product implementation, commits and deployment are not performed by this planning task.

---

## Testing Strategy

### Unit Tests:

No new unit-test framework or source-text assertion tests are needed. The meaningful boundary is HTTP responses from the built Worker with real local Supabase auth. Retain the existing Node diagnostic/configuration tests as regressions.

### Integration Tests:

Extend the existing smoke rather than creating a parallel runner. Use separate mutable cookie jars for A, B and an invalid-session case, with an anonymous request carrying no cookies. Derive session-cookie names from actual local login responses; damage a copied session cookie without leaking its contents. Request actor A's page, then B's, then A's again; additionally pass the other email as an ignored `user_id` hint. This demonstrates request isolation without creating an owner-selection API. Compare exact redirect paths; query-based errors should assert the expected route and a nonempty `error` parameter.

Assert `private` and `no-store` as directives, allowing additional stricter directives. Preserve and consume all Set-Cookie values. Tests must fail on mismatched identities/content and never treat a 200 demonstration page or a redirect prefix alone as success. These checks do not prove recipe-row isolation because no recipe rows exist.

Use Node 24, Docker, local Supabase and the local Worker. Follow `.github/workflows/ci.yml`'s smoke setup: start Supabase, configure only local test secrets, run `npm run build`, start `npm run preview:worker -- --port 4321`, wait with `node scripts/wait-for-server.mjs`, then run smoke. For preview assertions, stop the previous server, run `npm run build:preview`, start its Worker and run the preview check. Restore a normal build before another auth run. Do not point signup smoke at a shared or production environment. Existing CI remains the complete deployment validation path.

### Manual Testing Steps:

1. Register locally and follow the existing confirmation/sign-in path; then sign in with valid credentials. Check wrong-password feedback separately.
2. Use two isolated browser profiles with accounts A and B. Reload each protected screen and verify its own email only.
3. In one disposable local profile, use browser cookie tools to alter only the SDK session's stored expiry metadata to a past value, preserving token values and chunk encoding. Request `/dashboard` and verify replacement cookies and successful rendering, then sign out and verify denial on the next request. This exercises SDK refresh; it does not claim a server-signed JWT actually expired. Do not export cookie contents into test notes. If the storage format cannot be safely edited, wait for natural local token expiry instead.
4. Log out, use browser Back and reload, and navigate directly to `/dashboard`. Confirm the server redirects to sign-in and private content is not usable. Record any browser history snapshot behavior separately from a fresh server response.
5. After phase 2, check the exact empty-state content, homepage navigation and keyboard focus in current Chrome and Firefox, at a narrow mobile viewport and desktop width. Test a long email and confirm there is no horizontal overflow.

## Performance Considerations

Keep the existing server-rendered page and auth validation; add no recipe queries, API calls, React hydration or new data caches. The conservative non-cacheable policy also covers the personalized homepage. Filtering/import performance targets belong to later slices and cannot be measured with an empty collection.

## Migration Notes

No data migration, schema change, new secret or route migration is required. `/dashboard` remains stable, and the existing manual publication workflow applies when deployment is separately requested. Roll back the collection UI/login destination together if needed; preserve the privacy policy unless a verified replacement is supplied. Keep unrelated working-tree changes, including the pre-existing `AGENTS.md` edit, intact.

## References

- `context/changes/private-recipe-collection/change.md` — stable change identity.
- `context/foundation/roadmap.md` — S-01 outcome and boundaries; F-01 is independent.
- `context/foundation/prd.md` — v3 FR-001, FR-006, US-02 and Access Control.
- `context/foundation/tech-stack.md` — existing Workers/Supabase architecture and manual publication.
- `context/foundation/shape-notes.md` — Chrome/Firefox, mobile/desktop requirements; later PRD decisions take precedence.
- `context/foundation/lessons.md` and `docs/reference/contract-surfaces.md` — currently placeholders.
- `src/middleware.ts:4`, `src/lib/supabase.ts:5`, `src/env.d.ts:3` — existing identity/session boundary.
- `src/pages/dashboard.astro:7`, `src/pages/api/auth/signin.ts:19`, `src/components/Topbar.astro:11` — UI and routing changes.
- `scripts/smoke.mjs:23`, `scripts/check-preview.mjs:5`, `.github/workflows/ci.yml:59` — HTTP verification and local setup.
- `supabase/config.toml:209` — local email confirmation is disabled; hosted settings are not established by this plan.
- [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide#can-i-use-server-side-rendering-with-a-cdn-or-cache) — private/no-store guidance, consulted 2026-09-26.

## Progress

> Convention: pending rows become done during implementation. Append a closing commit SHA when work lands; do not rename step titles.

### Phase 1: Protect private responses and verify session isolation

#### Automated

- [x] 1.1 Static checks pass on Node 24: `npx --no-install astro sync`, `npm run lint`, and `npx --no-install astro check`. — df3440d
- [x] 1.2 The normal Worker build succeeds, and `BASE_URL=http://localhost:4321 npm run smoke` passes the existing auth flow plus separate-account, ownership-hint, malformed-session and cache assertions against local Supabase. — df3440d
- [x] 1.3 The preview build succeeds, and `BASE_URL=http://localhost:4321 node scripts/check-preview.mjs` passes unchanged status/body expectations plus application cache assertions against that preview Worker. — df3440d
- [x] 1.4 Existing diagnostic and deployment-contract tests pass: `npm run test:deployment` and `npm run test:deploy-config`. — df3440d

#### Manual

- [x] 1.5 Two separate browser sessions retain their own email across reloads; signout followed by direct dashboard navigation denies access, and browser Back/reload does not restore a usable signed-in screen. — df3440d
- [x] 1.6 In a disposable local session, force SDK refresh by making its stored expiry metadata stale while retaining valid tokens; dashboard access renews cookies, and subsequent signout plus a new dashboard request still denies access. — df3440d

### Phase 2: Deliver the empty private collection

#### Automated

- [x] 2.1 Static checks pass on Node 24: `npx --no-install astro sync`, `npm run lint`, and `npx --no-install astro check`.
- [x] 2.2 The normal Worker build succeeds, and `BASE_URL=http://localhost:4321 npm run smoke` passes direct login-to-collection, exact redirects, English empty-state content, navigation, separate-account isolation, signout and cache checks against local Supabase.
- [x] 2.3 The preview build and `BASE_URL=http://localhost:4321 node scripts/check-preview.mjs` retain the protected-page 503 contract; `npm run test:deployment` and `npm run test:deploy-config` still pass.

#### Manual

- [x] 2.4 In Chrome and Firefox at desktop and mobile widths, registration followed by login reaches the collection; its empty state, current email and signout are clear, keyboard-accessible and free of horizontal overflow, including a long email address.
- [x] 2.5 On the completed screen, reload preserves the account, two independent sessions show only their own identity, and signout followed by Back/reload or direct `/dashboard` access cannot retrieve private collection content.
