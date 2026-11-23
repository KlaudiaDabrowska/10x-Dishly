# Krytyczna poprawność importu i recovery — Implementation Plan

## Overview

Wzmocnić ochronę ryzyk #1, #2 i #5 przez pełniejszy golden oracle, brakujące kontrakty recovery, produktowe testy współbieżności, deterministyczny most HTTP oraz selektywną bramkę release acceptance. Oddzielić ukończenie implementacji tej bramki od jej wyniku dla konkretnego wydania.

## Current State Analysis

`scoreFixture()` blokuje głównie błędy kompletności i składników, podczas gdy `evaluateRecipes()` wykrywa różnice we wszystkich zatwierdzonych polach. Recovery klienta i transakcje DB są testowane oddzielnie, lecz brakuje kilku krytycznych gałęzi oraz testu spinającego klienta, endpointy produktu, finalizer i RLS read-back.

## Desired End State

- Zatwierdzone różnice w tytule, składnikach, grupach, instrukcjach, porcjach, przypisach, kategorii, `sourceCategory` i stronach blokują acceptance.
- Lost create i wyczerpany polling nie ponawiają modelu ani nie zgłaszają fałszywego sukcesu.
- Równoległe operacje produktu kończą się jednym trwałym outcome bez częściowych zapisów.
- CI sprawdza realne finalize/status/read-back bez OpenAI.
- Gotowy runner i cookbook wymuszają przed każdym wydaniem jedną udaną próbę `summer` i jedną `lunchboxy` w czasie do 300 sekund; nieudany gate blokuje wydanie, ale nie blokuje dalszego rollout'u testów.

### Key Discoveries

- Pełne porównanie pól już istnieje w `scripts/pdf-evaluate.mjs`; luka leży w polityce blokującej `scripts/pdf-acceptance.mjs`.
- Product finalize jest transakcyjny, ale legacy cancel może zwrócić outcome bez product decisions, gdy finalize wygra wyścig.
- Obecny CI uruchamia Worker i Supabase, więc nowy smoke może wykorzystać istniejące środowisko.
- Prywatny reader output umożliwia odtworzenie batchy bez ponownego parsowania PDF.
- Diagnostyka wykazała powtarzalny `count-vs-usage`; bezpieczny failure record i held reservation są prawidłowym wynikiem niezaliczonego gate'u, a nie brakiem implementacji testów.

## What We're NOT Doing

- Nie zmieniamy promptu, modelu ani reguł ekstrakcji.
- Nie dodajemy nowego test runnera, Playwrighta ani publicznej trasy testowej.
- Nie wykonujemy płatnych wywołań w CI ani na każdym PR.
- Nie edytujemy wdrożonych migracji i nie dodajemy nowej migracji.
- Nie regenerujemy ani automatycznie nie zatwierdzamy goldenów.
- Nie zmieniamy istniejącej semantyki retry providera: tylko jeden ograniczony retry 429; timeout/5xx/transport pozostają bez retry.
- Nie uznajemy nieudanego live runu za sukces release gate'u i nie wykonujemy kolejnej płatnej próby jako warunku zakończenia tej zmiany.

## Implementation Approach

Zachować istniejące warstwy testów i domknąć ich granice. Najpierw ustalić niezależny oracle, następnie pokryć hermetyczne recovery, potem realne wyścigi DB. Na tej podstawie dodać deterministyczny HTTP smoke i osobny płatny release gate. Implementacja rollout'u kończy się, gdy mechanizm gate'u, jego bezpieczna ścieżka błędu i dokumentacja są zweryfikowane; gotowość wydania pozostaje osobnym stanem wymagającym dwóch udanych rekordów live.

## Critical Implementation Details

Produktowy cancel po wykonaniu wspólnego RPC musi dla kanału `product` ponownie odczytać trwały terminalny outcome. Gdy finalize wygra wyścig, odpowiedź cancel ma zwrócić zapisane `kept`, `discarded` i `decisions`; gdy cancel wygra, wynik ma pozostać pusty i spójny. Kanał evaluation nie zmienia kontraktu.

## Phase 1: Semantyczny golden oracle

### Overview

Promować wszystkie zatwierdzone różnice semantyczne do blocking, zachowując wyłącznie jawne tolerancje zaakceptowane dla fixture.

### Changes Required

#### 1. Blocking policy

**Files:** `scripts/pdf-acceptance.mjs`, `scripts/pdf-evaluate.mjs`

**Intent:** Użyć niezależnego exact evaluator jako źródła różnic, zamiast ograniczać blocking do składników.

**Contract:** Blocking obejmuje tytuł, ingredient groups wraz z label/source text, instrukcje, servings, footnotes, category, sourceCategory i pages. Zachowane zostają: normalizacja whitespace, udokumentowana tolerancja household-parenthetical oraz reguła summer dopuszczająca jedną kompletną wariantę lub poprawny podzbiór odrębnych wariantów.

#### 2. Oracle regression tests

**Files:** `scripts/pdf-acceptance.test.mjs`, `scripts/pdf-evaluate.test.mjs`

**Intent:** Udowodnić, że każda biznesowo istotna mutacja łamie gate, a zaakceptowane tolerancje nadal przechodzą.

**Contract:** Każdy blokujący typ różnicy ma osobny planted mutant. Pozytywne kontrole obejmują wyłącznie zatwierdzone normalizacje i wariantowość; zmieniona instrukcja, kategoria, strona lub brak metadanych nie są już form-only success.

### Success Criteria

#### Automated Verification

- `node --test scripts/pdf-acceptance.test.mjs scripts/pdf-evaluate.test.mjs` potwierdza blocking dla każdego zatwierdzonego pola oraz pozytywne kontrole wszystkich zachowanych tolerancji.
- `npm run pdf:acceptance -- --self-test` odrzuca planted semantic differences i akceptuje partial summer variant, whitespace oraz household-parenthetical controls.
- `npm run test:pdf` przechodzi bez regresji istniejących kontraktów ekstrakcji.

#### Manual Verification

- Polityka blocking zostaje porównana z zatwierdzonymi referencjami `summer` i `lunchboxy` bez zmiany prywatnych plików lub ich hashy.

---

## Phase 2: Hermetyczne recovery klienta

### Overview

Domknąć zachowanie klienta dla utraconego create i wyczerpanego recovery po finalize.

### Changes Required

#### 1. Lost-create recovery

**Files:** `src/lib/pdf-processing/client-import.ts`, `scripts/client-import.test.mjs`

**Intent:** Uczynić istniejący cleanup testowalnym bez zmiany zachowania użytkownika.

**Contract:** Gdy create traci odpowiedź, klient wykonuje jeden status lookup. Potwierdzony `processing` jest anulowany bez batch/finalize; niepotwierdzony import zachowuje ID do następnego cleanup. W razie potrzeby logika może zostać wyodrębniona do wewnętrznego helpera.

#### 2. Exhausted finalize polling

**File:** `scripts/client-import.test.mjs`

**Intent:** Udowodnić, że brak terminalnego statusu nie staje się sukcesem.

**Contract:** Po jednej utraconej odpowiedzi finalize klient wykonuje pięć status requestów według istniejącego harmonogramu `0/250/500/1000/2000 ms`, nie ponawia finalize ani providera i zwraca `processing` sklasyfikowane jako `unconfirmed`.

### Success Criteria

#### Automated Verification

- Testy lost-create potwierdzają status+cancel bez batch/finalize oraz zachowanie niepotwierdzonego ID do cleanup.
- Test wyczerpanego pollingu potwierdza jedną próbę finalize, pięć statusów, opóźnienia `[250,500,1000,2000]`, brak kolejnego rozpoznania i wynik `unconfirmed`.
- `npm run test:pdf` przechodzi z niezmienionymi kontraktami evaluation i product UI.

---

## Phase 3: Produktowa współbieżność DB

### Overview

Udowodnić atomowość product finalizer i spójność odpowiedzi finalize/cancel z trwałym statusem.

### Changes Required

#### 1. Product race tests

**File:** `scripts/pdf-processing-db.test.mjs`

**Intent:** Pokryć produktowe odpowiedniki istniejących testów evaluation.

**Contract:** Testy wymuszają oba rozstrzygnięcia finalize–cancel oraz równoległe finalize–finalize. Terminalny stan zawiera dokładnie jeden outcome, bez duplikatów recipes lub decisions. Obie odpowiedzi są zgodne z końcowym statusem i identyfikatorami.

#### 2. Canonical product cancel outcome

**Files:** `src/lib/pdf-processing/persistence.ts`, `src/lib/pdf-processing/service.ts`

**Intent:** Naprawić rozbieżność ujawnioną czerwonym testem bez zmiany RPC lub schematu.

**Contract:** Po product cancel warstwa serwisowa odczytuje trwały owner-scoped status i zwraca canonical `ProductTerminalOutcome`. Jeśli finalize wygrał, zachowuje zapisane counts, IDs i decisions; jeśli cancel wygrał, zwraca pusty anulowany wynik. Evaluation nadal używa legacy outcome bez dodatkowego zachowania.

### Success Criteria

#### Automated Verification

- DB tests pokrywają product finalize–finalize oraz obie kolejności product finalize–cancel z kompletnymi decision rows.
- Każdy race kończy się jednym terminalnym outcome, bez częściowych zapisów, duplikatów ani sprzecznych odpowiedzi.
- Po zgodzie na lokalny Supabase `npm run test:pdf:db` przechodzi z poprawionym product cancel outcome.
- `npm run test:pdf`, `npm run lint` i `npx --no-install astro check` przechodzą; evaluation contract pozostaje bez zmian.

#### Manual Verification

- Diff potwierdza brak zmiany wdrożonych migracji, sygnatur RPC i retry providera.

---

## Phase 4: HTTP product bridge w CI

### Overview

Połączyć recovery klienta z prawdziwymi endpointami finalize/status, lokalną bazą i RLS read-back bez providera.

### Changes Required

#### 1. Dedicated HTTP harness

**Files:** `scripts/pdf-product-http.mjs`, `scripts/pdf-product-http.test.mjs`

**Intent:** Zapewnić wąski, deterministyczny test brakującej granicy integracyjnej.

**Contract:** Harness tworzy disposable ownera i cookie session, przygotowuje import i batch przez deterministyczny service seam, wywołuje prawdziwy `POST /api/imports/:id/finalize`, symuluje utraconą odpowiedź, a recovery prowadzi przez prawdziwy `GET /api/imports/:id`. Wymaga `committed`, `readBack=true`, `pending=0`, jednego owner-visible recipe, braku duplikatu i braku drugiego recognition. Cleanup działa także po błędzie.

#### 2. Command and CI wiring

**Files:** `package.json`, `.github/workflows/ci.yml`

**Intent:** Uruchamiać bridge w istniejącym jobie `smoke` bez nowego środowiska.

**Contract:** Dodać `smoke:pdf-product`. CI przekazuje lokalny `SUPABASE_SECRET_KEY`, wykorzystuje już uruchomiony Worker i Supabase oraz uruchamia nową komendę w tym samym kroku lifecycle. `OPENAI_API_KEY`, prywatne fixture i płatne wywołania nie są wymagane.

### Success Criteria

#### Automated Verification

- Hermetyczne testy harnessu potwierdzają lost-response injection, cleanup i brak wycieku prywatnego payloadu do stdout.
- Po zgodzie na lokalny Supabase/port `npm run smoke:pdf-product` potwierdza realne finalize, status recovery i owner-scoped read-back bez providera.
- CI `smoke` uruchamia auth smoke oraz product HTTP bridge na jednym Workerze i zatrzymuje procesy także po błędzie.
- `npm run test:pdf`, `npm run lint` i `npm run build` przechodzą z nowym commandem.

#### Manual Verification

- Lokalny log smoke’a zawiera wyłącznie identyfikatory i stałe kody; nie zawiera tekstu PDF, przepisu, credentials ani provider response.

---

## Phase 5: Release acceptance harness i cookbook

### Overview

Dodać gotową do użycia bramkę pełnej ścieżki produktu, bezpiecznie utrwalić jej niepowodzenia i zapisać wzorce testowe fazy rolloutowej. Wynik gate'u dla konkretnego wydania pozostaje niezależny od ukończenia implementacji harnessu.

### Changes Required

#### 1. Product acceptance runner

**Files:** `scripts/pdf-product-acceptance.mjs`, `scripts/pdf-product-acceptance.test.mjs`, `package.json`

**Intent:** Umożliwić kontrolowane uruchomienie aktualnego kanału produktu na zatwierdzonych ebookach oraz zapisać odtwarzalny dowód sukcesu albo bezpieczny dowód niepowodzenia.

**Contract:** `pdf:product-acceptance` ma tryb preflight/self-test oraz live. Live używa prywatnych reader artifacts do utworzenia batchy, wywołuje aktualne `/api/imports/**` na czystym disposable ownerze i wykonuje dokładnie jedną próbę `summer` oraz jedną `lunchboxy`.

Każdy success record zawiera HEAD/dirty state, code/config digest, fixture/reference/reader hashes, import i owner IDs, `committed`, `readBack=true`, `pending=0`, saved/existing counts, owner-scoped persisted count, semantic blocking result, elapsed time, token/cost totals i brak unresolved holds. Failure record zachowuje wyłącznie allowlistowany kod, correlation ID, bezpieczny read-back ledgera i prawdziwy status cleanupu. Artefakty są exclusive-create, tryb `0600`, pod `evaluation/validate-pdf-processing/local/product-acceptance/`; stdout pozostaje sanitizowany.

#### 2. Release policy and cookbook

**File:** `context/foundation/test-plan.md`

**Intent:** Uczynić gate i wzorce trwałą częścią procesu jakości.

**Contract:** §5 opisuje product acceptance jako obowiązkową bramkę przed każdym wydaniem, nie jako gate każdego PR. §6.1, §6.4 i §6.6 dokumentują referencyjne testy, warstwy, komendy, wymagane approval, różnicę między status recovery i retry providera oraz niezależność statusów rollout i release readiness. Wiersz rollout Phase 1 przechodzi na `complete` po zweryfikowaniu implementacji wszystkich warstw; wydanie pozostaje `blocked`, dopóki nie istnieją dwa rzeczywiste, zaliczone rekordy live.

### Success Criteria

#### Automated Verification

- Self-tests product acceptance odrzucają brak fixture, niezgodne hashe, dirty/mismatched revision, niepełny outcome, brak read-back, pending decisions, błędne counts, semantic mismatch, czas ponad 300 sekund i unreconciled cost.
- Preflight jawnie potwierdza dostępność obu prywatnych fixture, referencji, reader artifacts, lokalnego środowiska i budżetu przed wywołaniem providera.
- Mismatch zapisuje prywatny, sanitizowany failure record, pozostawia niepewną rezerwację held i zatrzymuje run przed drugim fixture bez automatycznego retry lub reconciliation.
- `npm run test:pdf`, `npm run lint` i `npx --no-install astro check` przechodzą, a `test-plan.md` dokumentuje niezależne statusy rollout i release readiness.

#### Manual Verification

- Użytkownik potwierdza, że ukończenie rollout'u nie autoryzuje wydania ani kolejnej płatnej próby; release pozostaje zablokowany do dwóch zaliczonych rekordów live.
- Kontrola istniejących failure artifacts potwierdza prywatne uprawnienia, kompletność allowlistowanego evidence i brak treści PDF, credentials lub provider response poza ignorowanym katalogiem prywatnym.

## Testing Strategy

### Unit Tests

- Mutacja każdego pola zatwierdzonego goldenu.
- Pozytywne kontrole wariantów i normalizacji.
- Lost create, cleanup ID i wyczerpany finalize polling.
- Walidacja argumentów, rekordów i failure codes nowych harnessów.

### Integration Tests

- Product finalize–finalize i oba rozstrzygnięcia finalize–cancel.
- Realny finalize/status/read-back przez Worker i lokalny Supabase.
- Hermetyczna ścieżka nieudanego product acceptance oraz osobna, ręcznie zatwierdzana próba `summer` i `lunchboxy` przed wydaniem.

### Manual Testing Steps

1. Zatwierdzić uruchomienie lokalnego Supabase/Workera i sprawdzić product HTTP smoke.
2. Przed wydaniem uruchomić product acceptance preflight.
3. Przy nieudanym gate sprawdzić sanitizowane podsumowanie i pozostawić release jako `blocked` bez automatycznego ponowienia.
4. Dopiero przed wydaniem zatwierdzić świeży koszt dwóch importów, wykonać live gate i sprawdzić prywatne artefakty.

## Performance Considerations

- Każdy reprezentatywny import musi zakończyć się w 300 sekund.
- CI nie wykonuje modelu ani nie używa prywatnych fixture.
- Polling recovery zachowuje obecny ograniczony harmonogram.
- Płatny gate wykonuje dokładnie dwa importy na wydanie.

## Migration Notes

Brak migracji. Nie edytować istniejących plików SQL. Ewentualna poprawka race znajduje się w warstwie persistence/service i zachowuje sygnatury RPC oraz dane historyczne.

## Public Interfaces and Commands

- Nowy command `npm run smoke:pdf-product`.
- Nowy command `npm run pdf:product-acceptance` z trybami self-test/preflight/live.
- Brak nowych tras HTTP i zmian istniejących response shapes.
- Wewnętrzny product cancel zwraca canonical terminal outcome zgodny z trwałym statusem.

## References

- `context/changes/testing-critical-import-correctness-recovery/research.md`
- `context/foundation/test-plan.md`
- `scripts/pdf-acceptance.mjs:124-164`
- `scripts/pdf-evaluate.mjs:20-183`
- `src/lib/pdf-processing/client-import.ts:310-447,613-675`
- `src/lib/pdf-processing/persistence.ts:119-136,217-241`
- `scripts/pdf-processing-db.test.mjs:1203-1377`
- `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:447-573`
- `.github/workflows/ci.yml:60-78`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Semantyczny golden oracle

#### Automated

- [x] 1.1 `node --test scripts/pdf-acceptance.test.mjs scripts/pdf-evaluate.test.mjs` potwierdza blocking dla każdego zatwierdzonego pola oraz pozytywne kontrole wszystkich zachowanych tolerancji. — 24bc5ff
- [x] 1.2 `npm run pdf:acceptance -- --self-test` odrzuca planted semantic differences i akceptuje partial summer variant, whitespace oraz household-parenthetical controls. — 24bc5ff
- [x] 1.3 `npm run test:pdf` przechodzi bez regresji istniejących kontraktów ekstrakcji. — 24bc5ff

#### Manual

- [x] 1.4 Polityka blocking zostaje porównana z zatwierdzonymi referencjami `summer` i `lunchboxy` bez zmiany prywatnych plików lub ich hashy. — 24bc5ff

### Phase 2: Hermetyczne recovery klienta

#### Automated

- [x] 2.1 Testy lost-create potwierdzają status+cancel bez batch/finalize oraz zachowanie niepotwierdzonego ID do cleanup. — bca1447
- [x] 2.2 Test wyczerpanego pollingu potwierdza jedną próbę finalize, pięć statusów, opóźnienia `[250,500,1000,2000]`, brak kolejnego rozpoznania i wynik `unconfirmed`. — bca1447
- [x] 2.3 `npm run test:pdf` przechodzi z niezmienionymi kontraktami evaluation i product UI. — bca1447

### Phase 3: Produktowa współbieżność DB

#### Automated

- [x] 3.1 DB tests pokrywają product finalize–finalize oraz obie kolejności product finalize–cancel z kompletnymi decision rows. — a0e2177
- [x] 3.2 Każdy race kończy się jednym terminalnym outcome, bez częściowych zapisów, duplikatów ani sprzecznych odpowiedzi. — a0e2177
- [x] 3.3 Po zgodzie na lokalny Supabase `npm run test:pdf:db` przechodzi z poprawionym product cancel outcome. — a0e2177
- [x] 3.4 `npm run test:pdf`, `npm run lint` i `npx --no-install astro check` przechodzą; evaluation contract pozostaje bez zmian. — a0e2177

#### Manual

- [x] 3.5 Diff potwierdza brak zmiany wdrożonych migracji, sygnatur RPC i retry providera. — a0e2177

### Phase 4: HTTP product bridge w CI

#### Automated

- [x] 4.1 Hermetyczne testy harnessu potwierdzają lost-response injection, cleanup i brak wycieku prywatnego payloadu do stdout. — c570958
- [x] 4.2 Po zgodzie na lokalny Supabase/port `npm run smoke:pdf-product` potwierdza realne finalize, status recovery i owner-scoped read-back bez providera. — c570958
- [x] 4.3 CI `smoke` uruchamia auth smoke oraz product HTTP bridge na jednym Workerze i zatrzymuje procesy także po błędzie. — c570958
- [x] 4.4 `npm run test:pdf`, `npm run lint` i `npm run build` przechodzą z nowym commandem. — c570958

#### Manual

- [x] 4.5 Lokalny log smoke’a zawiera wyłącznie identyfikatory i stałe kody; nie zawiera tekstu PDF, przepisu, credentials ani provider response. — c570958

### Phase 5: Release acceptance harness i cookbook

#### Automated

- [x] 5.1 Self-tests product acceptance odrzucają brak fixture, niezgodne hashe, dirty/mismatched revision, niepełny outcome, brak read-back, pending decisions, błędne counts, semantic mismatch, czas ponad 300 sekund i unreconciled cost.
- [x] 5.2 Preflight jawnie potwierdza dostępność obu prywatnych fixture, referencji, reader artifacts, lokalnego środowiska i budżetu przed wywołaniem providera.
- [x] 5.3 Mismatch zapisuje prywatny, sanitizowany failure record, pozostawia niepewną rezerwację held i zatrzymuje run przed drugim fixture bez automatycznego retry lub reconciliation.
- [x] 5.4 `npm run test:pdf`, `npm run lint` i `npx --no-install astro check` przechodzą, a `test-plan.md` dokumentuje niezależne statusy rollout i release readiness.

#### Manual

- [x] 5.5 Użytkownik potwierdza, że ukończenie rollout'u nie autoryzuje wydania ani kolejnej płatnej próby; release pozostaje zablokowany do dwóch zaliczonych rekordów live.
- [x] 5.6 Kontrola istniejących failure artifacts potwierdza prywatne uprawnienia, kompletność allowlistowanego evidence i brak treści PDF, credentials lub provider response poza ignorowanym katalogiem prywatnym.
