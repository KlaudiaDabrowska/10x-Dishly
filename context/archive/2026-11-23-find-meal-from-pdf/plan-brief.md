# Plan brief: Find meal from PDF

## Outcome

Authenticated users can filter their imported recipes by category, ingredient, or both, then open the existing recipe detail. The flow remains server-rendered, paginated, and RLS-protected.

## Key decisions

- Category and ingredient combine with AND.
- Only the `pomidor` family receives first-version Polish noun/adjective normalization.
- Other ingredients match exact normalized tokens.
- Every token of a multiword query must occur in one ingredient name.
- Filters submit through GET, cards stay title-only, and invalid filters return HTTP 400.
- A nested generated JSONB representation plus a GIN index backs a `SECURITY INVOKER` search RPC.

## Delivery

1. Database normalizer, generated index representation, RPC, and integration tests.
2. Typed reader/URL contract, RPC adapter, hermetic tests, and CI wiring.
3. Shared-primitives filter UI, filter-aware pagination/states, and preview coverage.
4. End-to-end smoke, owner isolation, 1,000-row performance probe, docs, and visual evidence.

## Verification focus

Positive tomato forms, negative substitutions, exact non-tomato tokens, same-ingredient multiword boundaries, AND semantics, RLS ownership, filter-preserving pagination, responsive keyboard access, and sub-second filtered reads at 1,000 recipes.
