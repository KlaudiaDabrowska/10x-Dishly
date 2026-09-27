# Contract Surfaces

Registry of load-bearing names and contracts that must remain consistent across the project.

- `/dashboard` is the server-rendered, protected recipe collection entry point and the destination after successful login. Missing or invalid users receive a 302 redirect to `/auth/signin`; unavailable authentication infrastructure returns 503. It currently renders the signed-in account's empty collection only; recipe persistence, import and filtering are outside this route's current scope.
- `App.Locals.user` is request-local identity populated by `supabase.auth.getUser()`. Query parameters, including `user_id`, never select the current account.
- Every response passing through session middleware carries `Cache-Control: private, no-store`, including personalized `/`, protected HTML, authentication redirects and infrastructure-unavailable responses. Preserve response status, Location, body and all session cookie updates.
- `/api/ops/deployment-probe` bypasses session handling and retains its independent bearer-token authorization and cache policy.
- These guarantees protect the collection entry point and account identity only. Future recipe persistence requires its own ownership checks and RLS rules; no recipe-row isolation is established here.
