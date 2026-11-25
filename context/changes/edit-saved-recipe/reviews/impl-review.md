<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit saved recipe

- **Plan**: `context/changes/edit-saved-recipe/plan.md`
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Git scope**: `fcfe403^..f41ca03`
- **Date**: 2026-11-24
- **Verdict**: APPROVED
- **Findings**: 0 open; 2 resolved (0 critical, 1 warning, 1 observation)
- **Resolved**: 2026-11-25

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Brak zarządzania fokusem po odrzuconym zapisie

- **Severity**: WARNING
- **Impact**: MEDIUM — utrudnia odzyskanie po błędzie użytkownikom klawiatury i urządzeń mobilnych
- **Dimension**: Safety & Quality / Success Criteria
- **Location**: `src/components/recipes/RecipeEditForm.tsx:101`, `src/components/recipes/RecipeEditForm.tsx:134`
- **Detail**: Po odpowiedzi 422, 409, innym błędzie HTTP albo wyjątku formularz jedynie zmienia stan i renderuje komunikat na początku długiego formularza. Fokus pozostaje przy przycisku zapisu na dole, więc komunikat i pierwsze nieprawidłowe pole mogą pozostać poza widokiem. `role="alert"` z prymitywu wspiera ogłoszenie przez część technologii asystujących, ale nie zapewnia widocznego, przewidywalnego miejsca odzyskania. Testy w `scripts/recipe-edit-ui.test.mjs` obejmują model formularza i `beforeunload`, lecz nie tę interakcję. To osłabia odhaczone kryterium klawiatury i fokusu z `plan.md:292`.
- **Recommended fix**: Dodać fokusowalne podsumowanie błędu albo fokus na pierwszym polu z błędem po 422; dla 409/500 ustawić fokus na komunikacie. Dodać test interakcji potwierdzający docelowy fokus po odpowiedzi.
- **Decision**: FIXED — odrzucone zapisy przenoszą fokus na fokusowalne podsumowanie błędu; test regresyjny obejmuje wszystkie trzy statusy błędu i stany neutralne.

### F2 — Faza 1 nie ma odnośnika do commita w rejestrze postępu

- **Severity**: OBSERVATION
- **Impact**: LOW — wyłącznie niespójność śledzenia wdrożenia
- **Dimension**: Plan Adherence
- **Location**: `context/changes/edit-saved-recipe/plan.md:262`
- **Detail**: Konwencja w `plan.md:256` wymaga dopisania SHA po wdrożeniu kroku, natomiast ukończone pozycje 1.1–1.3 nie wskazują `3c3134c`. Implementacja i testy fazy 1 są obecne, więc nie jest to brak funkcjonalny.
- **Recommended fix**: Dopisać `— 3c3134c` do pozycji 1.1–1.3.
- **Decision**: FIXED — pozycje 1.1–1.3 wskazują commit `3c3134c`.

## Plan drift summary

- Fazy 1–4 odpowiadają zaplanowanym kontraktom danych, API, UI, testom, smoke i dokumentacji rolloutowej.
- Nie znaleziono brakujących elementów produktu ani nieuzasadnionego rozszerzenia zakresu.
- Dodatkowe moduły `src/lib/recipes/api.ts`, `src/lib/recipes/edit-form.ts`, zmiany read modelu i `plan-brief.md` są uzasadnionym podziałem odpowiedzialności w ramach planu.

## Verification evidence

- `npm run test:recipes` — PASS, 4/4 suites.
- `npm run test:security` — PASS, 2/2 suites.
- `npm run test:pdf:db` — PASS, 34/34 tests against isolated Supabase.
- `npm run lint` — PASS; Dishly UI contract passed for 10 scoped files.
- `npx --no-install astro check` — PASS, 0 errors; non-blocking existing hints only.
- `npm run check:ui-preview` — PASS after rerun outside the socket-restricted sandbox; preview source isolation, Astro check and build passed.
- `npm run capture:ui-preview:recipe-edit` — PASS, 8 states at desktop and mobile widths; regenerated artifacts were restored because capture output is not byte-stable.
- `npm run build` — PASS with local test bindings.
- `npm run smoke` — PASS against the built Worker and local Supabase, including owner edit/read-back, identical foreign/nonexistent 404 responses and no foreign mutation.
- CI invokes `test:recipes` in `.github/workflows/ci.yml`.
- Manual evidence covers the required state/viewport matrix, but does not disprove F1 because a static capture cannot verify post-submit focus movement.
- Resolution verification: the focused UI test first failed on the missing focus contract; after the fix, `npm run test:recipes`, `npm run lint`, and `npx --no-install astro check` all pass (Astro: 0 errors, existing non-blocking hints only).

## Review conclusion

Implementacja jest zgodna z planem i ma mocne zabezpieczenia własności, integralności oraz współbieżności. Oba ustalenia zostały naprawione i przegląd jest zatwierdzony.
