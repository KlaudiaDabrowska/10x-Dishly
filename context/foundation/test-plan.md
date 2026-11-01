# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-28

## 1. Strategy

Testy podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje rzeczywisty sygnał dla ryzyka. Nie promuj testu do e2e tylko dlatego, że e2e „wydaje się bezpieczniejsze”. Nie dodawaj modelu wizyjnego nad deterministycznym diffem wizualnym, który już wykrywa regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyko zakotwiczone w obawie zespołu ma tę samą wagę co PRD lub dane o churnie.
3. **Ryzyka są scenariuszami, nie lokalizacjami w kodzie.** Plan opisuje *co może się zepsuć* i *dlaczego uważamy to za prawdopodobne* — na podstawie dokumentów, wywiadu i sygnałów z repozytorium. Nie twierdzi, że zna linię odpowiedzialną za awarię. Tę wiedzę wytwarza `/10x-research` dla każdej fazy. Gdy plan i research różnią się co do miejsca awarii, research jest źródłem prawdy.

Zakres hot-spotów: `src/`, `scripts/`, `workers/pdf-consumer/`, `supabase/migrations/`.

## 2. Risk Map

| # | Ryzyko — scenariusz awarii | Impact | Likelihood | Źródło — dowód, nie kotwica |
|---|---|---|---|---|
| 1 | Import zapisuje niepełny, pominięty albo błędnie rozpoznany przepis jako poprawny i komunikuje sukces. | High | High | PRD US-01 i Guardrails; interview Q1, Q3, Q4; hot-spot `src/lib/pdf-processing/` — 55 zmian/30d |
| 2 | Timeout, utracona odpowiedź lub równoległe ponowienie importu powoduje duplikaty, częściowy zapis albo sprzeczny wynik. | High | High | PRD Accepted Import Responsibilities; interview Q1, Q4; archiwalne S-02/S-03 |
| 3 | Zalogowany użytkownik odczytuje, edytuje lub usuwa przepis innej osoby przez bezpośredni identyfikator albo zmanipulowane żądanie. | High | High | PRD Access Control; roadmap S-06/S-07; interview Q1, Q3, Q4; hot-spot `src/pages/api/` — 17 zmian/30d |
| 4 | Treść PDF, dane osobowe, token albo credential providera trafiają do logów, błędu lub frontendu. | High | Medium | PRD Privacy i Access Control; archiwalne F-01/S-02; hot-spot `src/lib/pdf-processing/` |
| 5 | Rzeczywisty import reprezentatywnego ebooka nie dochodzi do potwierdzonego zapisu w pięć minut mimo zielonych testów niższych warstw. | High | Medium | PRD US-01 i NFR; interview Q4; archiwalne F-01/S-02 |
| 6 | Filtrowanie pomija poprawne polskie odmiany, dopuszcza zamienniki albo łączy kategorię i składnik przez OR zamiast AND. | Medium | High | PRD US-02/FR-006; roadmap S-05 |

### Risk Response Guidance

| Ryzyko | Co udowodni ochronę | Co zakwestionować | Kontekst do ustalenia przez `/10x-research` | Najtańsza warstwa | Antywzorzec |
|---|---|---|---|---|---|
| #1 | Braki, pomieszane warianty i błędne pola nie wchodzą jako poprawny zapis ani pełny sukces. | Komplet pól oznacza poprawność ekstrakcji. | Niezależny oracle, walidacja, moment zapisu. | contract + integration + acceptance | Oracle skopiowany z implementacji. |
| #2 | Retry i współbieżność dają jeden uzgodniony wynik bez częściowych zapisów. | Końcowe 200 dowodzi wykonania dokładnie raz. | Idempotency, transakcje, trwały stan, recovery. | DB integration | Mockowanie wnętrza zamiast granicy trwałości. |
| #3 | Cudzy i nieistniejący identyfikator nie pozwalają czytać ani mutować danych i niczego nie ujawniają. | Zalogowanie oznacza autoryzację zasobu. | Sesja, RLS, owner check, translacja odmowy. | DB/API integration + smoke | Testowanie tylko ukrycia elementu w UI. |
| #4 | Logi, błędy, statusy i bundle nie zawierają treści PDF, sekretów ani prywatnych payloadów. | Backend-only automatycznie wyklucza wyciek. | Granice logowania, błędów, konfiguracji i odpowiedzi. | contract + static check | Snapshot zawierający zanonimizowany sekret. |
| #5 | Reprezentatywny PDF przechodzi pełny przepływ w limicie, a awaria nie udaje sukcesu. | Testy komponentów dowodzą działania całości. | Środowisko, provider, golden set, timeout, read-back. | selective acceptance + manual smoke | Pełna macierz przeglądarek bez nowego sygnału. |
| #6 | Odmiany pasują, zamienniki nie, a oba filtry działają jako AND. | Normalizacja może bezpiecznie rozszerzać znaczenie. | Reguły językowe, dane i kontrakt filtrowania. | unit + integration | Oracle przepisany z algorytmu. |

## 3. Phased Rollout

Każdy wiersz otwiera osobną zmianę. Statusy są stanem odczytywanym przez orchestrator.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Krytyczna poprawność importu i recovery | Udowodnić uczciwy zapis, odporność na retry i pełny przepływ. | #1, #2, #5 | contract + DB integration + selective acceptance | change opened | testing-critical-import-correctness-recovery |
| 2 | Izolacja właścicieli i prywatność | Zablokować IDOR oraz wycieki treści i sekretów. | #3, #4 | DB/API integration + security contract + smoke | not started | — |
| 3 | Filtrowanie i mutacje kolekcji | Chronić filtrowanie oraz operacje edit/delete. | #3, #6 | unit + integration + critical-flow e2e | not started | — |
| 4 | Selektywna ocena AI i bramki jakości | Wykrywać semantyczne błędy ekstrakcji i utrwalić minimalne bramki. | #1, #5, cross-cutting | AI-native review + acceptance gates | not started | — |

## 4. Stack

Profil testów: **meaningful** — 22 pliki `node:test` obejmują PDF, DB, deployment, UI i odczyt przepisów.

| Warstwa | Narzędzie | Wersja | Uwagi |
|---|---|---|---|
| unit + contract | Node.js `node:test` | 24 w CI | Istniejące skrypty bez osobnego runnera. |
| framework/build | Astro check/build | 7.3.2 | Astro nie dostarcza własnego runnera. |
| DB integration | Supabase CLI + lokalny Postgres | 2.23.4 | Istniejący `test:pdf:db`; wymaga izolowanego środowiska. |
| e2e/smoke | Własny HTTP smoke na zbudowanym Workerze | repo | Auth i owner isolation; brak Playwrighta. |
| accessibility | ESLint JSX a11y + ręczna macierz UI | 6.10.2 | Brak axe; nie dodawać bez dowodu dodatkowego sygnału. |
| AI-native | Repozytoryjna ocena ekstrakcji — checked: 2026-10-28 | repo | Tylko dla semantyki nieweryfikowalnej taniej; nie używać zamiast golden/contract. |

**Stack grounding tools (current session):**
- Docs: Context7 — sprawdzono aktualne zalecenia testowe Astro; checked: 2026-10-28.
- Search: Exa.ai/web search dostępne, lecz zbędne wobec oficjalnej dokumentacji; checked: 2026-10-28.
- Runtime/browser: brak Playwright/browser MCP; nie użyto; checked: 2026-10-28.
- Provider/platform: brak właściwego GitHub/Cloudflare/Supabase MCP; nie użyto; checked: 2026-10-28.

## 5. Quality Gates

| Bramka | Gdzie | Wymagana? | Co wykrywa |
|---|---|---|---|
| lint + typecheck | lokalnie + CI `validate` | required | Drift składni, typów i kontraktu UI. |
| unit + contract | lokalnie + CI `validate` | required | Regresje PDF, deploymentu i logiki. |
| DB integration | lokalnie + CI `smoke` | required | Transakcje, RLS, idempotency. |
| auth/owner smoke | CI `smoke` | required | Zepsuty przepływ sesji i izolacji. |
| reprezentatywny import acceptance | środowisko kontrolowane | required after §3 Phase 1 | Pełny przepływ, koszt, czas i uczciwy wynik. |
| krytyczne filtrowanie/mutacje e2e | CI/pre-prod | required after §3 Phase 3 | Integrację S-05–S-07. |
| selektywna ocena AI | kontrolowana ewaluacja | required after §3 Phase 4 | Błędy semantyczne poza deterministycznym kontraktem. |

## 6. Cookbook Patterns

### 6.1 Test kontraktu importu i recovery

TBD — see §3 Phase 1 for niepełny import, retry, współbieżność i potwierdzony zapis.

### 6.2 Test integracyjny DB/API

TBD — see §3 Phase 2 for owner isolation, RLS i nieujawniające odmowy.

### 6.3 Test filtrowania lub mutacji przepisu

TBD — see §3 Phase 3 for polskie odmiany, AND oraz edit/delete.

### 6.4 Test krytycznego przepływu

TBD — see §3 Phase 1 and Phase 3 for representative import and collection flow.

### 6.5 Selektywna ocena wyniku AI

TBD — see §3 Phase 4 for semantic extraction review and when not to use it.

### 6.6 Per-rollout-phase notes

TBD — każda ukończona faza dopisuje 2–3 linie o wzorcu, lokalizacji i komendzie.

## 7. What We Deliberately Don't Test

- **Snapshot każdej strony i drobnej zmiany wizualnej** — ma niski sygnał i wysoki koszt utrzymania. Wróć do tematu tylko dla krytycznej powierzchni bez tańszego deterministycznego sygnału. (Źródło: interview Q5.)
- **Kod generowany i proste komponenty bez logiki** — generator lub test wyższej warstwy jest wystarczającym oracle. Oceń ponownie, gdy pojawi się własna logika. (Źródło: interview Q5.)
- **Pełna macierz przeglądarek i urządzeń dla ekranów diagnostycznych** — mały zasięg nie uzasadnia kosztu. Oceń ponownie, gdy ekran stanie się produkcyjnym krytycznym przepływem. (Źródło: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-28
- Stack versions last verified: 2026-10-28
- AI-native tool references last verified: 2026-10-28

Uruchom `/10x-test-plan --refresh`, gdy:

- pojawi się nowe ryzyko z top 3 w roadmapie lub archiwum,
- data `checked:` narzędzia przekroczy trzy miesiące,
- zmieni się framework albo runner,
- §7 przestanie odpowiadać uzgodnionemu negative space.
