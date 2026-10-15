# S-04 — Owner-scoped lista i szczegóły przepisów — Implementation Plan

## Overview

Rozszerzyć server-rendered dashboard o owner-scoped listę i stronę szczegółów. Zapytania wykonuje request-local, cookie-bound klient Supabase, więc RLS pozostaje ostateczną granicą własności.

## Current State Analysis

- `public.recipes` ma owner-only `SELECT` przez RLS i indeks `(owner_id, created_at DESC)`.
- `/dashboard` jest chroniony middlewarem, ale nie pobiera przepisów.
- Nie istnieje ogólny reader kolekcji ani trasa szczegółów.
- `ingredient_groups` i `instructions` są JSON-em wymagającym zawężenia przed renderowaniem.
- S-03 opublikowało w planie kontrakt trwałych braków, lecz jego migracja i implementacja nie są jeszcze zmergowane do gałęzi bazowej S-04.
- S-08 wymaga tokenów semantycznych, `Card`/`Alert`/`Button`, powierzchni `rounded-xl shadow-surface` i kontroli `min-h-11 rounded-lg`.

## Desired End State

Lista i szczegóły działają bez client-side API, nie przyjmują owner ID i nie ujawniają istnienia cudzych rekordów. Prawidłowy pusty stan występuje wyłącznie po udanym zapytaniu zwracającym pustą kolekcję; błąd bazy ma osobny destructive Alert.

### Key Discoveries:

- Przeglądarkowy `SELECT` na `recipes` jest ograniczony przez `auth.uid() = owner_id` (`supabase/migrations/20261008120000_pdf_processing.sql:226-243`).
- Istniejący read-back używa sesyjnego klienta i RLS, więc S-04 nie potrzebuje privileged readera (`src/lib/pdf-validation.ts:198-215`).
- Middleware chroni cały prefiks `/dashboard` i ustawia `private, no-store` (`src/middleware.ts:4-48`).
- Obecny zapis dopuszcza wyłącznie kompletne przepisy; trwała reprezentacja braków należy do S-03 (`src/lib/pdf-processing/service.ts:254-300`).
- Runtime UI korzysta z semantycznych ról w `src/styles/global.css`; snapshot motywu nie jest źródłem stosowanym bezpośrednio.

## Public Interfaces

- `GET /dashboard?page=<positive-integer>` — brak parametru oznacza stronę 1; rozmiar strony wynosi 24.
- `GET /dashboard/recipes/<uuid>` — renderuje własny przepis albo wspólne 404 dla braku, cudzego UUID i niepoprawnego UUID.
- Brak nowego endpointu JSON, migracji S-04 i parametru wyboru właściciela.
- Wewnętrzny reader zwraca jawne rezultaty `ok`, `not-found`/`invalid-page` i `error`; widoki nie interpretują surowych odpowiedzi Supabase.

## What We're NOT Doing

- Nie definiujemy nullable pól, sentinelów, completeness status ani omission codes należących do S-03.
- Nie wyświetlamy kategorii, porcji, przypisów ani podglądu składników na karcie listy.
- Nie dodajemy filtrów, wyszukiwania, edycji, usuwania ani dostępu do PDF.
- Nie używamy evaluation-only `get_pdf_import_recipes`.
- Nie dodajemy publicznej trasy z fixture ani produkcyjnego dark-mode toggle.

## Implementation Approach

Przepływ pozostaje serwerowy: `Astro page → cookie-bound Supabase client → RLS query → runtime mapper → Astro presentation`. Strona Astro tworzy klienta sesyjnego i przekazuje readerowi minimalny port zapytań; reader nigdy nie tworzy klienta uprzywilejowanego ani nie przyjmuje `ownerId`. Parser strony, walidator UUID i mapper danych są czystymi funkcjami. Lista i detal korzystają ze wspólnego mappera. Zapytanie listy pobiera tylko dane potrzebne karcie i paginacji; detal pobiera pełny kontrakt potrzebny do wyświetlenia. HTML jest bezpiecznie escapowany przez Astro.

## Critical Implementation Details

Fazy 1–2 mogą być implementowane równolegle z S-03 i nie dotykają współdzielonych powierzchni konfliktowych. Po Phase 2 następuje twardy checkpoint: S-03 musi być zmergowane do gałęzi bazowej, aktualna gałąź bazowa musi zostać zintegrowana z branchem S-04 przez merge albo rebase, commit zawierający S-03 musi być przodkiem S-04 `HEAD`, konflikty muszą zostać rozwiązane, a wylądowane migracja, kontrakty i testy S-03 przeczytane. Phase 3 ani Phase 4 nie mogą rozpocząć się przed przejściem tego checkpointu.

Znane integration hotspots i reguły zachowania zmian:

| Powierzchnia | Reguła rozstrzygnięcia po integracji main |
| --- | --- |
| `context/foundation/roadmap.md` | Zachować lifecycle S-03 z gałęzi bazowej i nałożyć wyłącznie lifecycle S-04. |
| `docs/reference/contract-surfaces.md` | Zachować kontrakty decyzji S-03 i dopisać kontrakty list/detail S-04. |
| `scripts/pdf-processing-db.test.mjs` | Zachować fixture i asercje S-03, następnie rozszerzyć je o owner-scoped list/detail/order. |
| `scripts/check-ui-contract.mjs` | Połączyć listy skanowanych plików; nie zastępować zakresu S-03 zakresem S-04. |
| `scripts/ui-preview.mjs` | Zachować profil i output S-03 oraz dodać oddzielny profil/output S-04. |
| `tools/ui-preview/**` | Zachować fixture i stany S-03, a fixture S-04 komponować w tym samym izolowanym harnessie bez usług produkcyjnych. |

Po rozwiązaniu konfliktów statyczny przegląd `git diff` ma potwierdzić zachowanie obu zestawów kontraktów. Żaden zabroniony proces (`Supabase`, `smoke`, `test:pdf:db`, port 4321/4322) nie może zostać uruchomiony bez osobnej, bezpośredniej zgody użytkownika. Współdzielony runtime wymaga sprawdzenia zajętości i zakończenia każdego dozwolonego procesu podglądu po weryfikacji.

## Phase 1: Kontrakt owner-scoped odczytu

### Overview

Dodać wspólny, testowalny reader kolekcji i szczegółów bez nowego API oraz bez service role.

### Changes Required:

#### 1. Reader i typy prezentacyjne

**File**: `src/lib/recipes/read.ts`

**Intent**: Zamknąć zapytania Supabase, walidację parametrów i zawężanie JSON poza widokami.

**Contract**: `PAGE_SIZE = 24`. Lista sortuje po `created_at DESC`, następnie `id ASC`, używa dokładnego count i zakresu strony. Brak `page` oznacza 1; wartość inna niż dodatnia liczba całkowita jest niepoprawna, a strona poza zakresem nie może wyglądać jak pusta kolekcja. Reader przyjmuje minimalny port zapytań utworzony z cookie-bound klienta przez Astro page; nie przyjmuje `ownerId`, a własność wynika wyłącznie z sesji i RLS. Parser `page`, walidator UUID i mapper JSON są czystymi eksportami. Detail waliduje UUID przed pojedynczym zapytaniem, a brak widocznego rekordu nie jest błędem bazy. Mapper sprawdza kształt grup składników i instrukcji; błąd zapytania pozostaje odrębny od poprawnego pustego wyniku.

#### 2. Testy readera

**File**: `scripts/recipe-read.test.mjs`

**Intent**: Pokryć logikę bez uruchamiania Supabase.

**Contract**: Testy obejmują domyślną stronę, niepoprawne parametry, zakresy 24 elementów, kolejność z remisem, stronę poza zakresem, malformed UUID kończący się przed zapytaniem, brak rekordu, błąd bazy oraz poprawny i błędny nested JSON. Błędy zapytań i zero-row są testowane przez mały fake minimalnego portu, bez importowania runtime Astro i bez uruchamiania Supabase.

### Success Criteria:

#### Automated Verification:

- Read-model unit tests pass: `node --test scripts/recipe-read.test.mjs`.
- Production build accepts the server read contracts: `npm run build`.

---

## Phase 2: Paginowana lista i szczegóły

### Overview

Zastąpić placeholder rzeczywistą kolekcją i dodać chronioną trasę szczegółów.

### Changes Required:

#### 1. Dashboard i lista

**Files**: `src/pages/dashboard.astro`, `src/components/dashboard/DashboardView.astro`, `src/components/recipes/RecipeList.astro`

**Intent**: Zachować nagłówek, sign-out, import CTA i feedback, zastępując wyłącznie sekcję kolekcji.

**Contract**: `DashboardView` staje się wspólnym shellem z domyślnym slotem treści, zachowując konto, sign-out, warunkowe import CTA i feedback. Lista, detail, 404 i 500 używają tego samego shellu oraz jednoznacznej hierarchii nagłówków. Poprawny pusty wynik pokazuje komunikat, że użytkownik nie ma zapisanych przepisów. Każda karta zawiera jeden dostępny link: tytuł przepisu. Pager pozostaje zwykłymi linkami SSR i pokazuje bieżącą oraz całkowitą liczbę stron. Niepoprawna lub poza-zakresem strona zwraca 404 z linkiem do pierwszej strony. Błąd zapytania zwraca status 500 i destructive Alert z neutralnym komunikatem oraz możliwością ponownego wczytania. Widoki używają wyłącznie semantycznych tokenów oraz wspólnych prymitywów S-08.

#### 2. Trasa i widok szczegółów

**Files**: `src/pages/dashboard/recipes/[id].astro`, `src/components/recipes/RecipeDetail.astro`

**Intent**: Umożliwić czytanie własnego przepisu bez ujawniania istnienia cudzych danych.

**Contract**: Cudzy, nieistniejący i malformed identyfikator mapują do jednego wewnętrznego rezultatu `not-found` oraz zwracają ten sam status 404 i widok „Przepis niedostępny”. Malformed UUID kończy się przed query; foreign i nonexistent dają ten sam zero-row przez sesyjny klient i RLS. Widok zawiera link powrotny do `/dashboard`, lecz nie podaje przyczyny, identyfikatora ani cudzego tytułu. Błąd bazy jest osobnym `error` i zwraca 500, nigdy 404. Detail pokazuje tytuł, osobne podpisane warianty składników, instrukcje, nazwę PDF i `source_start_page`. Składniki renderują zachowane `sourceText`, dzięki czemu ilości wariantów nie są rekonstruowane ani mieszane. Instrukcje zachowują kolejność. Nie ma linku do PDF.

### Success Criteria:

#### Automated Verification:

- ESLint accepts the Phase 1–2 reader and product-view files without changing the shared UI guard: `npx eslint src/lib/recipes/read.ts scripts/recipe-read.test.mjs src/pages/dashboard.astro 'src/pages/dashboard/recipes/[id].astro' src/components/dashboard/DashboardView.astro src/components/recipes/RecipeList.astro src/components/recipes/RecipeDetail.astro`.
- Production build includes `/dashboard/recipes/[id]`: `npm run build`.

#### Manual Verification:

- Complete-recipe list, pagination, detail and 404 are accepted at desktop and mobile widths.
- Keyboard focus order and accessible link names are accepted for list, pager, back navigation and sign-out.
- A static S-08 audit confirms semantic tokens, shared primitives and control/surface scales in every new Phase 2 product view; automated guard expansion remains deferred until the post-integration Phase 4.

---

## Phase 3: Konsumpcja kontraktu S-03

### Overview

Po merge S-03 i integracji aktualnego main z S-04 dostosować reader i widoki do dokładnego, wylądowanego kontraktu brakujących pól. Sama publikacja planu lub dostępność plików w równoległym worktree nie otwiera tej fazy.

### Changes Required:

#### 1. Checkpoint merge i integracji main

**Files**: wylądowana migracja i kontrakty S-03, diff brancha S-04 po integracji main

**Intent**: Uniemożliwić integrację z projektem kontraktu albo nadpisanie zmian S-03 podczas rozwiązywania konfliktów.

**Contract**: S-03 jest zmergowane do docelowej gałęzi, aktualna gałąź bazowa jest zintegrowana z S-04 przez merge albo rebase, commit zawierający S-03 jest przodkiem S-04 `HEAD`, wszystkie znane hotspots są rozwiązane zgodnie z tabelą w Critical Implementation Details, a statyczny przegląd potwierdza obecność wylądowanej migracji, pól, typów, omission codes i testów S-03. Bez tego checkpointu Phase 3 i Phase 4 pozostają zablokowane.

#### 2. Integracja trwałego read modelu

**Files**: `src/lib/recipes/read.ts`, wylądowana migracja S-03, `src/lib/pdf-processing/contracts.ts`

**Intent**: Konsumować pola i semantykę S-03 bez tworzenia alternatywnego modelu.

**Contract**: Reader konsumuje dokładne pola S-03: nullable `title` i `category`, potencjalnie puste `ingredient_groups` i `instructions`, immutable `incomplete_at_import` i `import_missing_reason_codes` oraz mutable `current_missing_reason_codes`. `current_missing_reason_codes` jest jedynym źródłem aktualnych oznaczeń braków; `import_missing_reason_codes` i `incomplete_at_import` zachowują proweniencję. Każdy persisted code jest walidowany jako `OmissionCode`, a wyjaśnienie pochodzi z `PDF_OMISSION_RULES`. Reader nigdy nie syntetyzuje omission code ani wyjaśnienia z `title === null`, pustych `ingredient_groups` lub pustych `instructions`. Niezgodny albo nieznany kontrakt jest błędem mapowania, nie podstawą do inferencji. S-04 nie dodaje migracji dotyczącej nullability, completeness ani missing reasons.

#### 3. Prezentacja braków

**Files**: `src/components/recipes/RecipeList.astro`, `src/components/recipes/RecipeDetail.astro`

**Intent**: Uczynić zachowany niekompletny przepis czytelnym bez rozszerzania karty listy.

**Contract**: `null` title używa tekstu „Przepis bez tytułu” wyłącznie jako label/link UI; ten fallback nie tworzy missing reason. Lista nadal zawiera tylko tytuł albo jego prezentacyjny fallback. Detail pokazuje wyjaśnienia mapowane z `current_missing_reason_codes` przez `PDF_OMISSION_RULES` dla pól należących do zakresu S-04. Kod dotyczący pola poza zakresem widoku nie jest reinterpretowany ani tracony. Brak jest stanem neutralnym/ostrzegawczym, nie destructive error. Istniejące dane pola nadal renderują się normalnie obok jawnie oznaczonego braku.

### Success Criteria:

#### Automated Verification:

- The exact landed S-03 commit is recorded and verified as an ancestor of S-04 HEAD after integrating main.
- Recipe read tests pass against the landed S-03 persistence contract: `node --test scripts/recipe-read.test.mjs`.

#### Manual Verification:

- All known hotspots preserve both changes, and the landed S-03 migration/contracts/tests were inspected before integration work begins.
- A kept incomplete recipe is identifiable in the list and its S-03-provided missing elements are visible in detail.
- The S-04 diff is reviewed to confirm that no competing missing-field migration or persistence model was introduced.

---

## Phase 4: Kontrakty i pełna weryfikacja

### Overview

Rozszerzyć istniejące zabezpieczenia, testy oraz izolowany preview o nowe powierzchnie.

### Changes Required:

#### 1. Kontrakty i testy bezpieczeństwa

**Files**: `docs/reference/contract-surfaces.md`, `context/foundation/roadmap.md`, `.github/workflows/ci.yml`, `scripts/check-preview.mjs`, `scripts/pdf-processing-db.test.mjs`, `scripts/smoke.mjs`

**Intent**: Utrwalić routing, cache policy i owner isolation jako sprawdzalne kontrakty.

**Contract**: Registry zachowuje kontrakty S-03 i dopisuje listę, `page`, wspólne detail 404 oraz zakaz owner ID z wejścia. Roadmap zachowuje lifecycle S-03 i aktualizuje wyłącznie lifecycle S-04. Credentialless preview obejmuje przykładowy detail i nadal oczekuje fail-closed 503. DB coverage zachowuje fixture/asercje S-03 oraz obejmuje własną listę, własny detail, pusty wynik dla cudzego ID i deterministyczną kolejność. Smoke używa dwóch kont i lokalnego test-only admin seeda do utworzenia różnych recipe fixtures; sekret jest dostępny wyłącznie procesowi testowemu, nigdy aplikacji ani endpointowi produkcyjnemu, a fixture i konta są usuwane w `finally`. Smoke sprawdza własną listę/detail, brak przecieku cudzego tytułu oraz wspólny status i marker widoku 404 dla foreign, nonexistent i malformed ID, bez ujawnienia identyfikatora, tytułu lub przyczyny. Stare asercje placeholdera zostają zastąpione rzeczywistym pustym stanem.

#### 2. UI guard i preview

**Files**: `scripts/check-ui-contract.mjs`, `scripts/ui-preview.mjs`, `tools/ui-preview/src/pages/index.astro`

**Intent**: Objąć nowe widoki kontraktem S-08 i deterministycznymi fixture bez publicznej trasy.

**Contract**: Po integracji main guard łączy zakres plików S-03 i wszystkie nowe pliki produktowe S-04. Preview zachowuje fixture/stany S-03 i dodaje syntetyczne widoki S-04: empty, populated page, pagination, complete detail, 404, read error i kept-incomplete detail. Wspólny capture runner zachowuje profil/output S-03, otrzymuje oddzielny profil S-04 i zapisuje go wyłącznie do `context/changes/browse-and-read-recipes/evidence/`. Macierz obejmuje 1440×900 i 390×844. Loading i disabled są oznaczone N/A dla server-rendered list/detail; hover, focus-visible, empty, error, populated, 404 i missing-field mają dowody. Uruchomienie preview na porcie 4322 wymaga osobnej zgody użytkownika.

#### 3. Dokumentacja wizualna

**File**: `context/changes/browse-and-read-recipes/visual-verification.md`

**Intent**: Zapisać viewport/state matrix, wyniki kontroli klawiatury oraz ograniczenia dowodów.

**Contract**: Dokument nie uznaje wygenerowania screenshotów za akceptację wizualną i rozróżnia fixture od prawdziwego owner-scoped odczytu.

### Success Criteria:

#### Automated Verification:

- Final lint, UI guard and production build pass: `npm run lint && npm run build`.
- After explicit user approval, owner-isolation DB checks pass: `npm run test:pdf:db`.
- After explicit user approval, authenticated HTTP smoke passes: `npm run smoke`.
- After explicit user approval, credentialless preview build and `node scripts/check-preview.mjs` pass on port 4321 and the process is stopped.
- After explicit user approval, isolated preview checks and S-04 captures pass without leaving port 4322 active.

#### Manual Verification:

- The S-04 desktop/mobile screenshot matrix is accepted for complete, empty, error, 404 and kept-incomplete states.
- Import feedback, sign-out, responsive shell and S-08 focus treatment show no accepted regression.

## Testing Strategy

### Unit Tests:

- Parametr strony, zakresy 24 rekordów i tie-break `id ASC`.
- UUID, not-found i błąd zapytania.
- Poprawny oraz malformed nested JSON.
- Fallback „Przepis bez tytułu”.
- Adapter dokładnego kontraktu S-03.

### Integration Tests:

- RLS zwraca tylko własne rekordy.
- Foreign, nonexistent i malformed ID zwracają ten sam status i neutralny widok 404; tylko malformed kończy się przed query.
- Dwa konta nie widzą wzajemnie tytułów ani szczegółów.
- Kept-incomplete rekord z S-03 renderuje jawne braki.

### Manual Testing Steps:

1. Zweryfikować empty, 24-elementową pierwszą stronę i przejście między stronami.
2. Otworzyć kompletny detail i sprawdzić warianty bez mieszania ilości.
3. Sprawdzić 404 dla malformed, nonexistent i foreign ID.
4. Sprawdzić focus, nazwy linków i brak overflow na 390×844.
5. Po integracji S-03 sprawdzić przepis bez tytułu, składników lub instrukcji.

## Performance Considerations

Lista pobiera projekcję potrzebną karcie i maksymalnie 24 rekordy; detail pobiera jeden rekord. Istniejący indeks owner/created wspiera główny kierunek sortowania. Nowy indeks nie jest dodawany bez pomiaru wskazującego problem.

## Migration Notes

- S-04 nie zawiera migracji bazy.
- Integracja przyjmuje migrację i rollout należące do S-03 dopiero po merge S-03 i integracji aktualnego main z S-04.
- Wycofanie S-04 usuwa routing/prezentację bez modyfikowania zapisanych przepisów.
- Jeżeli S-03 nie jest zmergowane albo aktualny main nie jest zintegrowany z S-04, można ukończyć fazy 1–2, ale nie wolno rozpoczynać faz 3–4 ani oznaczać całego S-04 jako zakończonego.

## References

- Related research: `context/changes/browse-and-read-recipes/research.md`
- Roadmap: `context/foundation/roadmap.md`
- UI contract: `context/archive/2026-10-12-unify-dashboard-design-system/theme-contract.md`
- Contract registry: `docs/reference/contract-surfaces.md`
- S-03 plan before merge: `/home/klaudia/Pulpit/10xdevs-resolve-incomplete-recipes/context/changes/resolve-incomplete-recipes/plan.md`; after merge use the repository-local S-03 change artifacts and landed migration as the source of truth

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Kontrakt owner-scoped odczytu

#### Automated

- [x] 1.1 Read-model unit tests pass: `node --test scripts/recipe-read.test.mjs`. — 4c9cb09
- [x] 1.2 Production build accepts the server read contracts: `npm run build`. — 4c9cb09

### Phase 2: Paginowana lista i szczegóły

#### Automated

- [x] 2.1 ESLint accepts the Phase 1–2 reader and product-view files without changing the shared UI guard: `npx eslint src/lib/recipes/read.ts scripts/recipe-read.test.mjs src/pages/dashboard.astro 'src/pages/dashboard/recipes/[id].astro' src/components/dashboard/DashboardView.astro src/components/recipes/RecipeList.astro src/components/recipes/RecipeDetail.astro`. — 2fb7372
- [x] 2.2 Production build includes `/dashboard/recipes/[id]`: `npm run build`. — 2fb7372

#### Manual

- [x] 2.3 Complete-recipe list, pagination, detail and 404 are accepted at desktop and mobile widths. — 2fb7372
- [x] 2.4 Keyboard focus order and accessible link names are accepted for list, pager, back navigation and sign-out. — 2fb7372
- [x] 2.5 A static S-08 audit confirms semantic tokens, shared primitives and control/surface scales in every new Phase 2 product view; automated guard expansion remains deferred until the post-integration Phase 4. — 2fb7372

### Phase 3: Konsumpcja kontraktu S-03

#### Automated

- [x] 3.1 The exact landed S-03 commit is recorded and verified as an ancestor of S-04 HEAD after integrating main.
- [x] 3.2 Recipe read tests pass against the landed S-03 persistence contract: `node --test scripts/recipe-read.test.mjs`.

#### Manual

- [x] 3.3 All known hotspots preserve both changes, and the landed S-03 migration/contracts/tests were inspected before integration work begins.
- [x] 3.4 A kept incomplete recipe is identifiable in the list and its S-03-provided missing elements are visible in detail.
- [x] 3.5 The S-04 diff is reviewed to confirm that no competing missing-field migration or persistence model was introduced.

### Phase 4: Kontrakty i pełna weryfikacja

#### Automated

- [ ] 4.1 Final lint, UI guard and production build pass: `npm run lint && npm run build`.
- [ ] 4.2 After explicit user approval, owner-isolation DB checks pass: `npm run test:pdf:db`.
- [ ] 4.3 After explicit user approval, authenticated HTTP smoke passes: `npm run smoke`.
- [ ] 4.4 After explicit user approval, credentialless preview build and `node scripts/check-preview.mjs` pass on port 4321 and the process is stopped.
- [ ] 4.5 After explicit user approval, isolated preview checks and S-04 captures pass without leaving port 4322 active.

#### Manual

- [ ] 4.6 The S-04 desktop/mobile screenshot matrix is accepted for complete, empty, error, 404 and kept-incomplete states.
- [ ] 4.7 Import feedback, sign-out, responsive shell and S-08 focus treatment show no accepted regression.
