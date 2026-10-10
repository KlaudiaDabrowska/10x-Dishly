# Contract Surfaces

Registry of load-bearing names and contracts that must remain consistent across the project.

- `/dashboard` is the server-rendered, protected recipe collection entry point and the destination after successful login and a confirmed product import. Missing or invalid users receive a 302 redirect to `/auth/signin`; unavailable authentication infrastructure returns 503. The PDF import CTA appears only when `PDF_IMPORT_ENABLED=true` and the required production infrastructure is configured outside preview.
- `/dashboard?import=<uuid>` accepts only a UUID, removes `import` from the visible URL and fetches `/api/imports/<uuid>` before displaying saved and already-existing counts. The API status is owner-scoped; URL-supplied counters, invalid IDs and another owner's IDs never populate the banner.
- Product PDF rollout applies `20261009120000_product_pdf_import.sql` before application code, deploys the code with `PDF_IMPORT_ENABLED` absent or `false`, verifies F-01 and owner-scoped status, then enables the flag only in production. Rollback disables the flag, which blocks new imports while existing imports can finish or be cancelled and saved recipes and cost-ledger entries remain intact.
- `App.Locals.user` is request-local identity populated by `supabase.auth.getUser()`. Query parameters, including `user_id`, never select the current account.
- Every response passing through session middleware carries `Cache-Control: private, no-store`, including personalized `/`, protected HTML, authentication redirects and infrastructure-unavailable responses. Preserve response status, Location, body and all session cookie updates.
- `/api/ops/deployment-probe` bypasses session handling and retains its independent bearer-token authorization and cache policy.
- Recipe and import reads are owner-scoped by RLS and authenticated import status APIs. Future collection listing and filtering must preserve those ownership checks.
