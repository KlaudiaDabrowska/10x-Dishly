<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Find meal from PDF

- **Plan**: context/changes/find-meal-from-pdf/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 4 warnings, 1 observation — all fixed
- **Triage completed**: 2026-11-25

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification

- `npm run test:recipes` — PASS during this review.
- `npm run lint` — PASS during this review, including the scoped UI contract check.
- `npm run smoke:pdf-product` — PASS on 2026-11-25 after extending it with imported recipe filter → detail checks.
- `npm run test:pdf:db` — PASS (36/36) on 2026-11-25 after adding empty-token RPC coverage; five 1,000-row
  performance samples remained at 5.7, 6.0, 5.2, 5.1, and 5.2 ms.
- `npm run test:pdf:db` — PASS (37/37) on 2026-11-25 after adding RPC boundary validation; five 1,000-row
  performance samples remained at 5.7, 5.7, 4.9, 4.8, and 4.8 ms.
- `npm run test:pdf:migration` — PASS on 2026-11-25 with identical dumps, catalogs, and table rows.
- `npm run test:pdf:migration` — a review-time rerun was blocked by the execution sandbox (`spawnSync git EPERM`); the same command passed while Phase 1 was implemented.
- Phase evidence records passing `test:pdf:db` (36 tests), `test:pdf` (152 tests), smoke, Astro check/build, UI preview, capture, and five warmed 1,000-row samples of 5.0, 4.6, 5.2, 5.3, and 5.0 ms. No implementation commit followed that evidence; the later commit only updated documentation.

## Findings

### F1 — Brak dowodu testu na reprezentatywnej kolekcji z importu PDF

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/find-meal-from-pdf/plan.md:134
- **Detail**: Punkt 4.5 jest oznaczony jako wykonany, ale zapisany smoke tworzy rekord `pdf_imports` i przepisy bezpośrednio przez SQL (`scripts/smoke.mjs:60-93`, `scripts/smoke.mjs:395-400`). Sprawdza filter-to-detail i izolację właścicieli, lecz nie dowodzi kwalifikatora „na reprezentatywnej zaimportowanej kolekcji”. `visual-verification.md:34` jedynie deklaruje akceptację bez wskazania rzeczywiście zaimportowanego fixture.
- **Fix**: Wykonać filter-to-detail oraz kontrolę obcego właściciela na kolekcji utworzonej przez realny przepływ importu PDF i zapisać identyfikowalny wynik w `visual-verification.md`.
  - Strength: Domyka dokładnie ręczne kryterium 4.5 i potwierdza współpracę nowego filtra z danymi wytworzonymi przez import.
  - Tradeoff: Wymaga uruchomienia lokalnej infrastruktury i reprezentatywnego importu, zamiast szybkiego fixture SQL.
  - Confidence: HIGH — obecny smoke jawnie omija sam przepływ importu dla tych dwóch receptur.
  - Blind spot: Nie zweryfikowano, czy istnieje już zachowany lokalny import nadający się do tej kontroli.
- **Decision**: FIXED — `smoke:pdf-product` now verifies filtered dashboard → detail against a recipe persisted by the
  real product import flow; `visual-verification.md` records this evidence alongside the foreign-owner canary.

### F2 — Zapytanie bez obsługiwanych tokenów może zachowywać się jak pusty filtr

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261123210000_recipe_filtering.sql:94
- **Detail**: Niepusty parametr złożony wyłącznie z nieobsługiwanych znaków (np. `!!!`, emoji lub `é`) przechodzi walidację URL (`src/lib/recipes/read.ts:110-118`), ale normalizator SQL tworzy `query_tokens = []`. Predykat z linii 114 staje się wówczas containmentem `@> [[]]`, który może dopasować zwykłe grupy składników zamiast zwrócić brak wyników albo błąd walidacji.
- **Fix**: Odrzucać niepusty filtr bez żadnego obsługiwanego tokenu w parserze HTTP, dodać defensywny warunek w RPC i pokryć oba poziomy testami dla interpunkcji oraz nieobsługiwanego Unicode.
  - Strength: Zapewnia jednoznaczne zachowanie HTTP 400 i chroni bezpośrednie wywołanie RPC przed semantyką pustego JSONB.
  - Tradeoff: Reguła dozwolonych tokenów musi pozostać zsynchronizowana między TypeScript i SQL.
  - Confidence: HIGH — oba normalizatory i końcowy predykat są widoczne w tej samej ścieżce wykonania.
  - Blind spot: Nie wykonano w tej sesji bezpośredniego zapytania PostgreSQL pokazującego wynik `@> [[]]` na każdym kształcie danych.
- **Decision**: FIXED — the HTTP parser rejects non-empty values without a supported token, the RPC containment branch
  refuses an empty token array, and TypeScript/real-DB tests cover punctuation, emoji, and unsupported Unicode.

### F3 — Publiczne RPC nie egzekwuje limitu wejścia z kontraktu aplikacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261123210000_recipe_filtering.sql:65
- **Detail**: Limit 500 znaków i allowlista kategorii istnieją wyłącznie w Astro (`src/lib/recipes/read.ts:102-118`). Rola `authenticated` ma bezpośredni `EXECUTE` na RPC, więc klient z własnym JWT może ominąć dashboard i zlecić normalizację, globalny regexp oraz agregację dla bardzo dużego tekstu. Inne RPC w repo egzekwują limity także na granicy bazy.
- **Fix**: Dodać w RPC walidację kategorii i długości znormalizowanego składnika przed tokenizacją oraz real-DB test bezpośredniego wywołania z 501+ znakami.
  - Strength: Wymusza kontrakt na rzeczywistej granicy zaufania i ogranicza koszt wejścia niezależnie od klienta.
  - Tradeoff: Wymaga ustalenia stabilnego zachowania błędu RPC i jego mapowania, jeśli aplikacja kiedykolwiek ominie parser.
  - Confidence: HIGH — grant dla `authenticated` jest jawny, a w funkcji nie ma żadnego guardu wejścia.
  - Blind spot: Limity rozmiaru żądania w PostgREST mogą częściowo ograniczać nadużycie, ale nie zastępują domenowego limitu 500 znaków.
- **Decision**: FIXED — `search_recipes` validates the category allowlist and normalized 500-character ingredient
  boundary before tokenization, raises SQLSTATE `22023`, and the real-DB suite covers invalid and boundary inputs.

### F4 — Test grantów nie obejmuje odmowy dla `service_role`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/pdf-processing-db.test.mjs:1615
- **Detail**: Migracja jawnie odbiera `EXECUTE` roli `service_role` (`supabase/migrations/20261123210000_recipe_filtering.sql:121`), ale suite dowodzi tylko sukcesu `authenticated` i odmowy klientowi publicznemu. Plan wymaga pokrycia grantów, więc regresja rozszerzająca uprawnienia `service_role` nie zostałaby wykryta.
- **Fix**: Dodać bezpośrednią asercję, że klient `service_role` nie może wywołać `search_recipes`.
- **Decision**: FIXED — the real-DB grant test now requires `search_recipes` to reject both the public client and the
  `service_role` client; the 37-test database suite passes.

### F5 — Jawnie udokumentowana granica `ketchup` nie ma fixture regresyjnego

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/pdf-processing-db.test.mjs:1595
- **Detail**: Kontrakt wymienia `passata` i `ketchup` jako negatywne substytucje pomidora. Test realnej bazy pokrywa `passata`, ale nie `ketchup`. Implementacja obecnie zachowuje `ketchup` jako exact token, jednak ta konkretna granica nie ma zabezpieczenia regresyjnego.
- **Fix**: Dodać fixture `ketchup` do istniejącego testu negatywnych substytucji i potwierdzić, że zapytanie `pomidor` go nie zwraca.
- **Decision**: FIXED — the real-DB tomato substitution test now includes a `ketchup` recipe and still requires the
  `pomidor` query to return only the approved tomato-family match.

## Triage summary

- **Fixed**: F1, F2, F3, F4, F5
- **Skipped**: none
- **Accepted without fix**: none
