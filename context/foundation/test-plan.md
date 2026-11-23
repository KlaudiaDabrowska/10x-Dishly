# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-23

## 1. Strategy

Testy podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje rzeczywisty sygnał dla ryzyka. Nie promuj testu do e2e tylko dlatego, że e2e „wydaje się bezpieczniejsze”. Nie dodawaj modelu wizyjnego nad deterministycznym diffem wizualnym, który już wykrywa regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyko zakotwiczone w obawie zespołu ma tę samą wagę co PRD lub dane o churnie.
3. **Ryzyka są scenariuszami, nie lokalizacjami w kodzie.** Plan opisuje _co może się zepsuć_ i _dlaczego uważamy to za prawdopodobne_ — na podstawie dokumentów, wywiadu i sygnałów z repozytorium. Nie twierdzi, że zna linię odpowiedzialną za awarię. Tę wiedzę wytwarza `/10x-research` dla każdej fazy. Gdy plan i research różnią się co do miejsca awarii, research jest źródłem prawdy.

Zakres hot-spotów: `src/`, `scripts/`, `workers/pdf-consumer/`, `supabase/migrations/`.

## 2. Risk Map

| #   | Ryzyko — scenariusz awarii                                                                                                            | Impact | Likelihood | Źródło — dowód, nie kotwica                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Import zapisuje niepełny, pominięty albo błędnie rozpoznany przepis jako poprawny i komunikuje sukces.                                | High   | High       | PRD US-01 i Guardrails; interview Q1, Q3, Q4; hot-spot `src/lib/pdf-processing/` — 55 zmian/30d       |
| 2   | Timeout, utracona odpowiedź lub równoległe ponowienie importu powoduje duplikaty, częściowy zapis albo sprzeczny wynik.               | High   | High       | PRD Accepted Import Responsibilities; interview Q1, Q4; archiwalne S-02/S-03                          |
| 3   | Zalogowany użytkownik odczytuje cudzy przepis albo odczytuje lub mutuje cudzy import bądź decyzję przez bezpośredni identyfikator lub zmanipulowane żądanie. | High   | High       | PRD Access Control; roadmap S-06/S-07; interview Q1, Q3, Q4; hot-spot `src/pages/api/` — 17 zmian/30d |
| 4   | Treść PDF, dane osobowe, token albo credential providera trafiają do logów, publicznego błędu lub statusu, statycznego bundle albo odpowiedzi dla nieuprawnionego użytkownika. | High   | Medium     | PRD Privacy i Access Control; archiwalne F-01/S-02; hot-spot `src/lib/pdf-processing/`                |
| 5   | Rzeczywisty import reprezentatywnego ebooka nie dochodzi do potwierdzonego zapisu w pięć minut mimo zielonych testów niższych warstw. | High   | Medium     | PRD US-01 i NFR; interview Q4; archiwalne F-01/S-02                                                   |
| 6   | Filtrowanie pomija poprawne polskie odmiany, dopuszcza zamienniki albo łączy kategorię i składnik przez OR zamiast AND.               | Medium | High       | PRD US-02/FR-006; roadmap S-05                                                                        |

### Risk Response Guidance

| Ryzyko | Co udowodni ochronę                                                                                                                                                                           | Co zakwestionować                                                                                                      | Kontekst do ustalenia przez `/10x-research`                                                                                                                           | Najtańsza warstwa                                                         | Antywzorzec                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| #1     | Braki, pomieszane warianty i każda uzgodniona różnica semantyczna względem zatwierdzonego goldenu blokują poprawny zapis i pełny sukces; zaakceptowany wynik przechodzi zapis oraz read-back. | Komplet wymaganych pól i strukturalnie poprawny kandydat oznaczają poprawność ekstrakcji.                              | Niezależny oracle z jawnym zakresem pól blokujących, granica walidacji oraz most do persystencji produktu i read-back.                                                | exact offline golden + DB/HTTP integration + selective product acceptance | Oracle skopiowany z implementacji albo różnice semantyczne jedynie raportowane.                   |
| #2     | Utracona odpowiedź, recovery klienta i równoległe operacje dają jeden trwały wynik bez duplikatów ani częściowych zapisów.                                                                    | Każdy błąd można bezpiecznie ponowić albo końcowe 200 dowodzi wykonania dokładnie raz.                                 | Rozdzielenie status recovery od ograniczonego retry providera, idempotency, transakcje i konkurencyjna finalizacja produktu.                                          | client contract + DB integration + narrow HTTP integration                | Mockowanie wnętrza zamiast granicy trwałości albo automatyczne retry wszystkich błędów providera. |
| #3     | Dla istniejących odczytów przepisów oraz operacji importu i decyzji cudzy i nieistniejący identyfikator dają nierozróżnialną odmowę, nie mutują danych i niczego nie ujawniają; recipe edit/delete wchodzą dopiero w Phase 3. | Zalogowanie oznacza autoryzację zasobu albo obecne `import-id-conflict` jest bezpiecznym oracle.                         | Sesja, RLS, owner check, brak mutacji po odmowie i nieujawniająca translacja konfliktu create import.                                                                  | DB/API integration + smoke                                                | Testowanie tylko ukrycia elementu w UI albo utrwalenie rozróżniającego 409 jako oczekiwania.      |
| #4     | Logi, publiczne błędy i statusy operacyjne, publiczne/statyczne bundle oraz odpowiedzi nieuprawnione nie zawierają treści PDF, sekretów ani prywatnych payloadów; treść właściciela w jego prywatnym UI jest dozwolona. | Backend-only automatycznie wyklucza wyciek albo każda treść widoczna we frontendzie jest wyciekiem.                     | Exact allowlisty logów, błędów, statusów i odpowiedzi, granice konfiguracji oraz planted canaries w produkcyjnym `dist/client`.                                         | contract + static check                                                   | Snapshot z zanonimizowanym sekretem albo zakaz legalnej treści w owner-authorized UI.             |
| #5     | Reprezentatywny PDF przechodzi aktualny kanał produktowy do potwierdzonego zapisu w limicie, a awaria nie udaje sukcesu.                                                                      | Historyczny sukces kanału ewaluacyjnego lub zielone testy niższych warstw dowodzą działania bieżącej ścieżki produktu. | Aktualny przepływ import API, provider, zatwierdzony golden, stan committed, read-back, brak pending, liczba zapisów, limit czasu oraz rekord rewizji i konfiguracji. | selective product acceptance + manual smoke                               | Pełna macierz przeglądarek albo kosztowny live model na każdy PR bez nowego sygnału.              |
| #6     | Odmiany pasują, zamienniki nie, a oba filtry działają jako AND.                                                                                                                               | Normalizacja może bezpiecznie rozszerzać znaczenie.                                                                    | Reguły językowe, dane i kontrakt filtrowania.                                                                                                                         | unit + integration                                                        | Oracle przepisany z algorytmu.                                                                    |

## 3. Phased Rollout

Każdy wiersz otwiera osobną zmianę. Statusy są stanem odczytywanym przez orchestrator.

| #   | Phase name                              | Goal (one line)                                                    | Risks covered         | Test types                                       | Status      | Change folder                                |
| --- | --------------------------------------- | ------------------------------------------------------------------ | --------------------- | ------------------------------------------------ | ----------- | -------------------------------------------- |
| 1   | Krytyczna poprawność importu i recovery | Udowodnić uczciwy zapis, odporność na retry i pełny przepływ.      | #1, #2, #5            | contract + DB integration + selective acceptance | complete    | testing-critical-import-correctness-recovery |
| 2   | Izolacja właścicieli i prywatność       | Zablokować IDOR na istniejących powierzchniach oraz wycieki poza prywatnym UI właściciela. | #3, #4                | DB/API integration + security contract + smoke   | complete    | testing-owner-isolation-privacy              |
| 3   | Filtrowanie i mutacje kolekcji          | Chronić filtrowanie oraz operacje edit/delete.                     | #3, #6                | unit + integration + critical-flow e2e           | not started | —                                            |
| 4   | Selektywna ocena AI i bramki jakości    | Wykrywać semantyczne błędy ekstrakcji i utrwalić minimalne bramki. | #1, #5, cross-cutting | AI-native review + acceptance gates              | not started | —                                            |

## 4. Stack

Profil testów: **meaningful** — 22 pliki `node:test` obejmują PDF, DB, deployment, UI i odczyt przepisów.

| Warstwa         | Narzędzie                                            | Wersja  | Uwagi                                                                             |
| --------------- | ---------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| unit + contract | Node.js `node:test`                                  | 24 w CI | Istniejące skrypty bez osobnego runnera.                                          |
| framework/build | Astro check/build                                    | 7.3.2   | Astro nie dostarcza własnego runnera.                                             |
| DB integration  | Supabase CLI + lokalny Postgres                      | 2.23.4  | Istniejący `test:pdf:db`; wymaga izolowanego środowiska.                          |
| e2e/smoke       | Własny HTTP smoke na zbudowanym Workerze             | repo    | Auth i owner isolation; brak Playwrighta.                                         |
| accessibility   | ESLint JSX a11y + ręczna macierz UI                  | 6.10.2  | Brak axe; nie dodawać bez dowodu dodatkowego sygnału.                             |
| AI-native       | Repozytoryjna ocena ekstrakcji — checked: 2026-10-28 | repo    | Tylko dla semantyki nieweryfikowalnej taniej; nie używać zamiast golden/contract. |

**Stack grounding tools (current session):**

- Docs: Context7 — sprawdzono aktualne zalecenia testowe Astro; checked: 2026-10-28.
- Search: Exa.ai/web search dostępne, lecz zbędne wobec oficjalnej dokumentacji; checked: 2026-10-28.
- Runtime/browser: brak Playwright/browser MCP; nie użyto; checked: 2026-10-28.
- Provider/platform: brak właściwego GitHub/Cloudflare/Supabase MCP; nie użyto; checked: 2026-10-28.

## 5. Quality Gates

| Bramka                            | Gdzie                                                             | Wymagana?                 | Co wykrywa                                                                          |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| lint + typecheck                  | lokalnie + CI `validate`                                          | required                  | Drift składni, typów i kontraktu UI.                                                |
| unit + contract                   | lokalnie + CI `validate`                                          | required                  | Regresje PDF, deploymentu i logiki.                                                 |
| DB integration                    | lokalnie + CI `smoke`                                             | required                  | Transakcje, RLS, idempotency.                                                       |
| auth/owner smoke                  | CI `smoke`                                                        | required                  | Zepsuty przepływ sesji i izolacji.                                                  |
| reprezentatywny import acceptance | środowisko kontrolowane, przed każdym wydaniem (nie na każdym PR) | required before release; currently blocked | Pełny przepływ produktu, koszt, czas i uczciwy wynik dla `summer` oraz `lunchboxy`. |
| krytyczne filtrowanie/mutacje e2e | CI/pre-prod                                                       | required after §3 Phase 3 | Integrację S-05–S-07.                                                               |
| selektywna ocena AI               | kontrolowana ewaluacja                                            | required after §3 Phase 4 | Błędy semantyczne poza deterministycznym kontraktem.                                |

## 6. Cookbook Patterns

### 6.1 Test kontraktu importu i recovery

Warstwy mają różne oracles: `scripts/client-import.test.mjs` chroni status recovery po utraconej odpowiedzi, `scripts/pdf-processing-db.test.mjs` chroni atomowość i współbieżność, a `scripts/pdf-product-http.test.mjs` wraz z `npm run smoke:pdf-product` sprawdza rzeczywisty finalize/status/read-back bez providera. Recovery HTTP odpytuje trwały status i nie uruchamia ponownie rozpoznania. Retry providera pozostaje osobnym, ograniczonym wyjątkiem wyłącznie dla potwierdzonego 429; timeout, 5xx i transport error nie są automatycznie ponawiane.

Referencyjna bramka kontraktowa: `npm run test:pdf`. Integracja DB/HTTP wymaga lokalnego Supabase i Workera; uruchomienie środowiska oraz portów musi być jawnie zatwierdzone, gdy narzędzie o to prosi.

### 6.2 Test integracyjny DB/API

Rollout izolacji właścicieli i prywatności składa się z czterech uzupełniających
się warstw. Każda ma osobny oracle i żadnej nie zastępuj testem UI ani mockiem
niższej granicy:

1. **Hermetyczne allowlisty — `npm run test:security`.** Sadź unikalny prywatny
   sentinel w wiadomości, kodzie, przyczynie i payloadzie zależności. Wymagaj
   exact body oraz exact keys dla publicznych błędów, logów, statusów i decyzji.
   Nieznane wartości muszą przejść do stałego publicznego kodu, a błąd testu może
   podać kategorię lub ścieżkę, nigdy wartość sentinela. Ta warstwa chroni też
   stałe copy auth i ignorowanie nieznanego `?error=`.
2. **Realna baza — `npm run test:pdf:db`.** Użyj prawdziwych migracji, constraintów,
   RLS i aktywnych RPC. Udowodnij, że dwóch ownerów może użyć tego samego publicznego
   UUID, własny replay jest idempotentny, a foreign i nonexistent nie odczytują ani
   nie mutują importu, decyzji lub przepisu. Brak mutacji sprawdzaj owner-scoped
   read-backiem; stub klienta nie jest oracle dla własności, constraintów ani race.
3. **Zbudowany Worker — `npm run smoke`.** Uruchom produkcyjny build z lokalnym
   Supabase i dwiema niezależnymi sesjami. Dla istniejących odczytów przepisów oraz
   statusu i reprezentatywnej mutacji importu wymagaj tej samej odpowiedzi dla
   foreign i nonexistent, w tym exact status/body oraz `private, no-store`.
   Sprawdź brak efektów ubocznych i niezależny create wspólnego publicznego UUID.
   W CI ta warstwa pozostaje w jobie `smoke`; nie przenoś jej do hermetycznego
   testu, który ominąłby session guard i rzeczywiste RPC.
4. **Statyczna granica klienta — `npm run build && npm run check:client-privacy`.**
   Skanuj rekurencyjnie wszystkie bajty dokładnie w katalogu wskazanym przez
   wygenerowane `assets.directory` jako `dist/client`. Skaner ma własny test z
   zasianymi canary dla sekretu, treści PDF, prywatnego payloadu i nazw prywatnych
   zmiennych. Zielony skan innego katalogu nie jest dowodem. Ta bramka działa po
   produkcyjnym buildzie w jobie `validate`.

Zakaz wycieku nie obejmuje legalnej treści widocznej uwierzytelnionemu właścicielowi
w jego prywatnym UI; takie odpowiedzi nadal muszą być owner-scoped i mieć
`Cache-Control: private, no-store`. Obejmuje logi, publiczne błędy i statusy,
statyczny bundle oraz odpowiedzi dla nieuprawnionego użytkownika. Recipe
edit/delete pozostają poza tym rolloutem i wchodzą dopiero w §3 Phase 3, gdy te
powierzchnie istnieją.

### 6.3 Test filtrowania lub mutacji przepisu

TBD — see §3 Phase 3 for polskie odmiany, AND oraz edit/delete.

### 6.4 Test krytycznego przepływu

Przed każdym wydaniem uruchom selektywny gate produktu na czystych, disposable ownerach: najpierw `npm run pdf:product-acceptance -- --preflight --revision <pełny-SHA>`, następnie — dopiero po zatwierdzeniu kosztu z preflight — `npm run pdf:product-acceptance -- --live --revision <pełny-SHA> --approved-max-nano-usd <wartość-z-preflight>`. Gate wykonuje dokładnie po jednej próbie `summer` i `lunchboxy`, wymaga committed/read-back, braku pending decisions, zgodnych counts i goldenu, czasu do 300 sekund oraz pełnego reconciliation kosztu. Mismatch lub held reservation pozostawia gate czerwony i blokuje wydanie; nie ponawiaj płatnej próby bez świeżego preflightu, nowej zgody kosztowej i nowego dowodu uzasadniającego próbę. Nie uruchamiaj go na każdym PR ani w CI.

### 6.5 Selektywna ocena wyniku AI

TBD — see §3 Phase 4 for semantic extraction review and when not to use it.

### 6.6 Per-rollout-phase notes

Rollout Phase 1 rozdziela sygnał na: exact golden (`scripts/pdf-acceptance*.mjs`), hermetyczne recovery klienta, realne race DB, deterministyczny most HTTP oraz płatny release gate (`scripts/pdf-product-acceptance*.mjs`). Tanie warstwy działają w CI; prywatne fixture i płatny provider pozostają wyłącznie w kontrolowanym środowisku lokalnym.

Status rollout opisuje wdrożenie ochrony testowej, a release readiness opisuje wynik gate'u dla konkretnego wydania. Rollout Phase 1 może przejść z `implementing` na `complete` po zweryfikowaniu harnessu, bezpiecznej ścieżki błędu, pełnych lokalnych bramek i cookbooka. Release pozostaje `blocked` do czasu zapisania dwóch rzeczywistych, zaliczonych recordów live i zatwierdzenia ich sanitizowanego podsumowania; ukończony rollout, zielony self-test ani preflight nie autoryzują wydania.

Rollout Phase 2 jest `complete`: cały plan `testing-owner-isolation-privacy`,
łącznie z ręcznym odczytem pierwszego runu PR, został zaliczony. Run GitHub Actions
`45190387946` pokazał osobne zielone kroki security contract, client privacy i owner
smoke, a skan pełnych logów nie znalazł zasianych prywatnych sentinelów.

## 7. What We Deliberately Don't Test

- **Snapshot każdej strony i drobnej zmiany wizualnej** — ma niski sygnał i wysoki koszt utrzymania. Wróć do tematu tylko dla krytycznej powierzchni bez tańszego deterministycznego sygnału. (Źródło: interview Q5.)
- **Kod generowany i proste komponenty bez logiki** — generator lub test wyższej warstwy jest wystarczającym oracle. Oceń ponownie, gdy pojawi się własna logika. (Źródło: interview Q5.)
- **Pełna macierz przeglądarek i urządzeń dla ekranów diagnostycznych** — mały zasięg nie uzasadnia kosztu. Oceń ponownie, gdy ekran stanie się produkcyjnym krytycznym przepływem. (Źródło: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-23
- Stack versions last verified: 2026-10-28
- AI-native tool references last verified: 2026-10-28

Uruchom `/10x-test-plan --refresh`, gdy:

- pojawi się nowe ryzyko z top 3 w roadmapie lub archiwum,
- data `checked:` narzędzia przekroczy trzy miesiące,
- zmieni się framework albo runner,
- §7 przestanie odpowiadać uzgodnionemu negative space.
