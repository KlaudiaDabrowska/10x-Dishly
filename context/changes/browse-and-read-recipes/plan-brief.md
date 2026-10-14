# S-04 — Owner-scoped lista i szczegóły przepisów — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Zalogowany użytkownik przegląda własne zapisane przepisy i otwiera szczegóły zawierające tytuł, warianty składników, instrukcje oraz nazwę PDF i początkowy numer strony. Bezpośredni adres przepisu również respektuje własność.

## Starting Point

Tabela `recipes`, RLS, chroniony dashboard i system UI S-08 już istnieją. Dashboard nadal pokazuje placeholder, a obecny model zapisuje tylko kompletne przepisy. S-03 opublikowało plan trwałego kontraktu przepisów zachowanych mimo braków, lecz jego migracja i implementacja oczekują na merge.

## Desired End State

`/dashboard` pokazuje rzeczywisty pusty stan albo 24 owner-scoped przepisy na stronę. `/dashboard/recipes/[id]` pokazuje treść własnego przepisu, a cudzy i nieistniejący identyfikator dają ten sam widok oraz status 404. Przepisy zachowane przez S-03 są obsługiwane bez konkurencyjnego modelu danych.

## Key Decisions Made

| Decyzja | Wybór | Powód | Źródło |
| --- | --- | --- | --- |
| Odczyt | Sesyjny klient Supabase + RLS, bez owner ID z wejścia | Zachowuje istniejącą granicę prywatności | Research |
| Kolejność | `created_at DESC`, remis `id ASC` | Pokazuje świeże importy i determinizuje remisy | Plan |
| Paginacja | SSR, 24 pozycje, parametr `page` | Ogranicza odpowiedź i działa bez JavaScriptu | Plan |
| Karta | Wyłącznie tytuł | Utrzymuje prostą listę | Plan |
| Brak tytułu | „Przepis bez tytułu” tylko w prezentacji | Nie tworzy danych zastępczych | Plan |
| Szczegóły źródła | Nazwa PDF i `source_start_page` | Spełnia FR-007 bez dodatkowego formatera | Plan |
| Trasa | `/dashboard/recipes/[id]` | Dziedziczy ochronę prefiksu dashboardu | Research / Plan |
| Brak dostępu | Wspólny widok/status 404 | Nie ujawnia istnienia cudzego przepisu | Research / Plan |
| Brakujące pola | Kontrakt S-03 konsumowany w osobnej fazie | S-03 pozostaje właścicielem modelu | Użytkownik / Plan |
| Semantyka braków | Wyłącznie `current_missing_reason_codes`; bez inferencji z null/pustych kolekcji | Nie tworzy konkurencyjnego modelu S-04 | S-03 / Review |
| UI | Semantyczne tokeny i komponenty S-08 | Zachowuje istniejący system wizualny | S-08 |

## Scope

**In scope:**

- Lista, paginacja, rzeczywisty pusty stan, szczegóły i błędy odczytu.
- Owner-scoped direct access, wspólne 404 i prywatna polityka cache.
- Dostępność, responsywność, UI S-08 i integracja z brakami S-03.

**Out of scope:**

- Filtrowanie S-05, edycja S-06 i usuwanie S-07.
- Biblioteka PDF, link do pliku i przechowywanie PDF.
- Nowy model braków, endpoint API, service-role reader, dark-mode toggle i publiczna fixture route.

## Architecture / Approach

Przepływ pozostaje serwerowy: Astro page → cookie-bound Supabase client → RLS query → runtime mapper → Astro presentation. Astro page tworzy klienta, a testowalny reader przyjmuje minimalny port zapytań. Lista, detail, 404 i 500 współdzielą shell dashboardu oraz walidowany read model. Faza integracyjna przyjmuje dokładne pola i omission codes S-03, nie dodając własnej migracji ani semantyki braków.

## Phases at a Glance

| Faza | Rezultat | Główne ryzyko |
| --- | --- | --- |
| 1. Kontrakt odczytu | Wspólny, walidowany read model listy i detalu | Błędne traktowanie RLS lub JSON |
| 2. Lista i szczegóły | Paginowany dashboard, detail i 404 zgodne z S-08 | Regresja istniejącego dashboardu |
| 3. Integracja S-03 | Po merge/rebase obsługa zachowanych niekompletnych przepisów | Naruszenie semantyki wylądowanego kontraktu |
| 4. Weryfikacja | Po merge/rebase testy bezpieczeństwa i zaakceptowana macierz wizualna | Konflikty współdzielonych plików i runtime |

**Prerequisites:** ukończone S-02 i S-08. Fazy 1–2 mogą działać równolegle z S-03. Fazy 3–4 wymagają merge S-03 do gałęzi bazowej, rebase S-04 oraz przeglądu rozwiązanych konfliktów.
**Estimated effort:** cztery weryfikowane fazy; bez estymacji kalendarzowej.

## Open Risks & Assumptions

- S-04 może ukończyć fazy 1–2 niezależnie. Nie wolno rozpocząć faz 3–4 przed merge S-03 i rebase S-04.
- Znane hotspots to `roadmap.md`, `contract-surfaces.md`, `pdf-processing-db.test.mjs`, `check-ui-contract.mjs`, `ui-preview.mjs` i `tools/ui-preview/**`; po rebase zmiany obu zakresów muszą zostać zachowane.
- `current_missing_reason_codes` jest jedynym źródłem aktualnych oznaczeń braków; null i puste kolekcje nie tworzą omission semantics.
- Foreign, nonexistent i malformed recipe ID mają identyczny neutralny status oraz widok 404; malformed kończy się przed query.
- S-04 nie uruchamia Supabase, smoke, `test:pdf:db` ani procesów 4321/4322 bez osobnej zgody.
- Server-rendered lista/detail nie mają lokalnego loading ani disabled; te stany są dokumentowane jako N/A.
- Istniejący indeks wspiera główny kierunek sortowania; nowy indeks powstaje tylko po pomiarze wskazującym problem.

## Success Criteria (Summary)

- Użytkownik widzi wyłącznie własne przepisy i czyta ich podstawową treść oraz źródło.
- Lista, paginacja, błędy i 404 są dostępne i responsywne zgodnie z S-08.
- Kept-incomplete recipe korzysta z kontraktu S-03, bez konkurencyjnej migracji lub modelu S-04.
- Post-rebase review potwierdza zachowanie kontraktów i fixture obu zmian na współdzielonych powierzchniach.
