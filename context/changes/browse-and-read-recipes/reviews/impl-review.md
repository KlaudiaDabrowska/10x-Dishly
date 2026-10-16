<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-04 — Owner-scoped lista i szczegóły przepisów

- **Plan**: `context/changes/browse-and-read-recipes/plan.md`
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — Poza-zakresowa strona może zwrócić 500 zamiast 404

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `src/lib/recipes/supabase-read.ts:12`, `src/lib/recipes/read.ts:247`
- **Detail**: Lista wysyła jeden ranged request z `count: "exact"`. PostgREST zwraca HTTP 416 / `PGRST103` dla niespełnialnego zakresu z exact count, a klient Supabase zachowuje tę odpowiedź jako niepusty `error`. Reader mapuje każdy błąd na `status: "error"` zanim dochodzi do obliczenia `totalPages`, więc realne `/dashboard?page=2` przy pustej kolekcji lub jednej pełnej stronie może zwrócić 500 zamiast planowanego collection 404. Test readera używa fake portu z `error: null`, dlatego nie odtwarza produkcyjnej semantyki. Zachowanie `PGRST103` potwierdzają [oficjalna tabela błędów PostgREST](https://docs.postgrest.org/en/v16/references/errors.html) i [przypadek exact-count poza zakresem w repozytorium PostgREST](https://github.com/PostgREST/postgrest/issues/2470).
- **Fix A ⭐ Recommended**: Nadać portowi typowany wynik `range-not-satisfiable` dla zweryfikowanego `PGRST103`, mapować go na `invalid-page` i dodać test adaptera/readera.
  - Strength: Zachowuje pojedyncze zapytanie, exact count i obecną granicę adaptera; naprawia dokładnie kontrakt 404.
  - Tradeoff: Reader/adapter świadomie zależy od stabilnego kodu błędu PostgREST.
  - Confidence: HIGH — zakres jest wcześniej walidowany, a `PGRST103` jest udokumentowanym kodem 416.
  - Blind spot: Bez zatwierdzonego runtime rerun nie potwierdzono treści błędu na lokalnej wersji PostgREST tego projektu.
- **Fix B**: Najpierw pobrać exact count, odrzucić poza-zakresową stronę, a dopiero potem wykonać ranged fetch bez exact count.
  - Strength: Nie interpretuje kodu błędu serwera i zna `totalPages` przed pobraniem strony.
  - Tradeoff: Dodaje drugie zapytanie oraz okno niespójności przy równoległej zmianie kolekcji.
  - Confidence: MEDIUM — poprawia 404, ale komplikuje i osłabia atomowość obecnego odczytu.
  - Blind spot: Wymaga decyzji o zachowaniu przy zmianie count między zapytaniami.
- **Decision**: FIXED via Fix A — typed `range-not-satisfiable` mapping with adapter/reader regression coverage.

### F2 — Smoke może przypadkowo mutować zdalną aplikację

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/smoke.mjs:7`
- **Detail**: Skrypt wymaga lokalnego `SUPABASE_DB_URL`, ale nie waliduje `BASE_URL`. Błędne `BASE_URL=https://…` wysłałoby signup/signin/signout do zdalnej aplikacji, podczas gdy seed i cleanup działałyby wyłącznie na lokalnej bazie. Dwa zdalne konta mogłyby pozostać po teście.
- **Fix**: Parsować `BASE_URL` przed pierwszym requestem i wymagać protokołu `http:` oraz hosta `127.0.0.1` albo `localhost` (z komunikatem local-test-only).
- **Decision**: FIXED — `BASE_URL` is restricted to local HTTP hosts with process-level regression coverage.

### F3 — Reader akceptuje niespójnie skróconą stronę

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/recipes/read.ts:256`
- **Detail**: Przy exact count reader odrzuca nadmiar rekordów i pusty wynik, lecz akceptuje dowolny niepusty wynik krótszy niż `expectedMaximum`, np. `count = 24` i jeden rekord. To osłabia deklarowany fail-closed, walidowany port i może pokazać niepełną stronę jako sukces.
- **Fix**: Po obsłużeniu `PGRST103` wymagać `response.data.length === expectedMaximum` oraz dodać przypadek niespójnego `count`/`data.length` do testu readera.
- **Decision**: PENDING

## Verification evidence

- `git merge-base --is-ancestor 856012a HEAD` — PASS.
- `node --test scripts/recipe-read.test.mjs` — PASS, 1/1 suite.
- Phase 1–2 scoped ESLint command — PASS.
- `npm run lint` — PASS; UI contract covers 10 files.
- `npm run build` — PASS; Wrangler emitted a non-fatal sandbox log-path warning, while Astro and PDF reader builds completed.
- Phase 4 runtime checks 4.2–4.5 were not rerun during review because they require new explicit approval. Their implementation-run evidence remains recorded in commit `4609906`, the plan checklist, and `context/changes/browse-and-read-recipes/evidence/`.
- Manual acceptance is recorded in `context/changes/browse-and-read-recipes/visual-verification.md`.
- F1 triage verification: reader test, scoped ESLint, and production build — PASS.
- F2 triage verification: local URL guard test, scoped ESLint, and diff check — PASS.
