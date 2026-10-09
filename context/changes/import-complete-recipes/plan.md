# Import Complete Recipes Implementation Plan

## Overview

Udostępnić sprawdzony przepływ importu PDF zwykłym zalogowanym użytkownikom. Produkt otrzyma osobną stronę, polskie komunikaty i własny kanał API, a ekran F-01 zachowa allowlistę, metryki i run record.

## Current State Analysis

Pipeline lokalnego odczytu, AI, walidacji, deduplikacji i atomowego zapisu jest kompletny. Obecne API i UI są jednak ograniczone flagą eksperymentalną oraz allowlistą ewaluatorów, a każdy import obciąża także jednorazowy budżet F-01.

## Desired End State

Zalogowany użytkownik rozpoczyna import na `/dashboard/import`, obserwuje polskie etapy przetwarzania i otrzymuje potwierdzony wynik. Kompletne przepisy zapisują się automatycznie; niekompletne pozostają niezapisane i widoczne do końca bieżącej sesji importu. Pełny sukces wraca na dashboard, a F-01 działa nadal jako oddzielne narzędzie ewaluacyjne.

### Key Discoveries:

- `src/lib/pdf-validation.ts:30` łączy dostęp do API z eksperymentem i allowlistą.
- `src/components/pdf-processing/PdfValidationPanel.tsx:311` łączy orkiestrację importu z benchmarkowym UI.
- `supabase/migrations/20261008120000_pdf_processing.sql:355` przypisuje każdy import do limitów per-import, miesięcznego i F-01.
- Model `recipes`, RLS, finalizacja, deduplikacja i kontrakty kandydatów są gotowe do ponownego użycia.

## What We're NOT Doing

- Keep/discard dla niekompletnych przepisów, lista i filtrowanie kolekcji, edycja, usuwanie ani zmiana kategorii.
- OCR, przechowywanie ebooków lub działanie w tle po zamknięciu karty.
- Zmiana modelu AI, promptu, limitów ekstrakcji albo kryteriów kompletności.
- Deklarowanie wsparcia importu w Firefoxie lub na telefonach.

## Implementation Approach

Produkt dostanie osobne API `/api/imports/**`, które współdzieli handlery i serwis z `/api/pdf-validation/imports/**`, ale wiąże import z serwerowo wybranym kanałem `product`. Kanał steruje autoryzacją i budżetem. W przeglądarce wspólny kontroler zachowa dotychczasowy przepływ i lifecycle, a dwa cienkie panele dostarczą osobne UI produktowe i ewaluacyjne.

## Critical Implementation Details

Flaga produktu blokuje wyłącznie tworzenie nowych importów. Import już utworzony musi pozostać możliwy do dokończenia, sprawdzenia lub anulowania, aby nie pozostawić nieuzgodnionego stanu i kosztów. Przekierowanie następuje tylko po `committed`, `readBack=true`, `pending=0` i wyniku zawierającym co najmniej jeden nowy lub istniejący przepis.

## Phase 1: Produktowy kanał backendu

### Overview

Wprowadzić zaufane rozróżnienie produktu i ewaluacji, osobną flagę oraz prawidłowe zakresy budżetowe.

### Changes Required:

#### 1. Kanał importu i budżety

**File**: `supabase/migrations/20261009120000_product_pdf_import.sql`

**Intent**: Trwale odróżnić import produktowy od ewaluacyjnego i przypisać im właściwe budżety.

**Contract**: `pdf_imports` otrzymuje niezmienny kanał `product | evaluation`; istniejące rekordy stają się `evaluation`. Produkt obciąża `import:<id>` i `month:<YYYY-MM>`, a ewaluacja dodatkowo `f01`.

#### 2. Współdzielone API i dostępność

**File**: `src/lib/pdf-validation.ts`, `src/pages/api/imports/**`, `src/pages/api/pdf-validation/imports/**`

**Intent**: Zapewnić produktowe API dla każdego zalogowanego użytkownika bez naruszania F-01.

**Contract**: Oba drzewa tras zachowują create, batch, finalize, status i cancel oraz te same kształty danych. `PDF_IMPORT_ENABLED=true` pozwala tworzyć produktowe importy poza preview; F-01 nadal wymaga swojej flagi i allowlisty. Mutacje pozostają same-origin, owner-scoped i bounded.

#### 3. Konfiguracja i logowanie

**File**: `astro.config.mjs`, `.env.example`, `scripts/check-deploy-config.mjs`, `scripts/deploy-config.test.mjs`

**Intent**: Dodać fail-closed rollout produktu i zachować beztreściową diagnostykę.

**Contract**: `PDF_IMPORT_ENABLED` jest opcjonalną serwerową zmienną środowiskową; preview nie otrzymuje sekretów produkcyjnych. Log błędu zawiera kanał, stały kod i identyfikator trasy, bez treści użytkownika.

### Success Criteria:

#### Automated Verification:

- Migracja i testy DB potwierdzają niezmienność kanału oraz poprawne zakresy budżetowe produktu i ewaluacji.
- Testy autoryzacji potwierdzają dostęp zwykłego użytkownika do produktu, zachowanie allowlisty F-01 i izolację właścicieli.
- Testy konfiguracji potwierdzają fail-closed `PDF_IMPORT_ENABLED` i brak sekretów produkcyjnych w preview.

#### Manual Verification:

- Przy wyłączonej fladze nie można rozpocząć nowego importu, a istniejący import nadal można bezpiecznie zakończyć lub anulować.

---

## Phase 2: Wspólny klient i produktowy UX

### Overview

Wydzielić wspólną orkiestrację i zbudować polski ekran importu bez diagnostyki F-01.

### Changes Required:

#### 1. Kontroler importu

**File**: `src/lib/pdf-processing/client-import.ts`, `src/components/pdf-processing/PdfValidationPanel.tsx`

**Intent**: Zachować jeden przebieg read → create → batch → finalize → recovery → cancel bez kopiowania logiki.

**Contract**: Kontroler przyjmuje bazową trasę API i publikuje etapy, postęp, kandydatów, wynik oraz wewnętrzny kod błędu. Zachowuje zwalnianie tekstu, lost-response recovery, best-effort cancellation i brak trwałego magazynu. Panel F-01 zachowuje metryki i run record.

#### 2. Produktowy ekran importu

**File**: `src/components/pdf-processing/RecipeImportPanel.tsx`, `src/pages/dashboard/import.astro`

**Intent**: Udostępnić prosty polski przepływ dla użytkownika końcowego.

**Contract**: Strona pokazuje limity, lokalny odczyt, przetwarzanie przez OpenAI, wybór pliku, anulowanie i trzy etapy. Nie pokazuje ID, czasu, fingerprintu, kodów ani run record. Znane błędy otrzymują polski tekst i kolejny krok.

#### 3. Zakończenia importu

**File**: `src/components/pdf-processing/RecipeImportPanel.tsx`

**Intent**: Jednoznacznie obsłużyć sukces, pending, brak wyników i brak read-back.

**Contract**: Potwierdzony wynik bez pending przekierowuje do `/dashboard?import=<id>`. Pending pozostaje na stronie wraz z brakami. `0/0/0` jest błędem rozpoznania. `readBack=false`, anulowanie i pełna porażka nie deklarują sukcesu.

### Success Criteria:

#### Automated Verification:

- Testy kontrolera obejmują sukces, utraconą odpowiedź finalize, anulowanie, pending, `0/0/0` i niepotwierdzony read-back.
- Testy mapowania błędów pokrywają wszystkie znane klasy błędów bez wyświetlania kodów.
- Build, Astro check i lint przechodzą dla obu paneli.

#### Manual Verification:

- Produktowy import w desktopowym Chrome pokazuje polskie etapy i nie ujawnia diagnostyki F-01.
- Wynik z niekompletnymi przepisami pozostaje na stronie, pokazuje braki i nie zapisuje tych kandydatów.

---

## Phase 3: Dashboard, regresja i rollout

### Overview

Połączyć import z dashboardem, zamknąć regresję i przygotować bezpieczny rollout.

### Changes Required:

#### 1. Wejście i potwierdzony wynik

**File**: `src/pages/dashboard.astro`, `src/components/pdf-processing/ImportOutcomeBanner.tsx`

**Intent**: Zapewnić widoczny punkt wejścia i potwierdzony komunikat po przekierowaniu.

**Contract**: CTA jest widoczne tylko przy dostępnej funkcji. Dashboard przyjmuje wyłącznie UUID `import`, pobiera owner-scoped status, pokazuje polskie liczniki i usuwa parametr z widocznego URL. Nieprawidłowy lub cudzy identyfikator nie ujawnia danych.

#### 2. Kontrakty i rollout

**File**: `docs/reference/contract-surfaces.md`, `context/foundation/roadmap.md`

**Intent**: Udokumentować nowe wejście i zachować odwracalny rollout.

**Contract**: Migracja jest wdrażana przed kodem, kod startuje z flagą wyłączoną, a aktywacja następuje tylko w produkcji. Rollback wyłącza tworzenie nowych importów, zachowując przepisy i księgę kosztów.

### Success Criteria:

#### Automated Verification:

- `npm run test:pdf` przechodzi bez regresji ekstrakcji, walidacji i finalizacji.
- `npm run test:pdf:db` potwierdza atomowość, deduplikację, RLS, kanały i budżety.
- `npm run test:deploy-config`, `npx astro check`, `npm run lint` i `npm run build` przechodzą.
- Test kontraktu dashboardu potwierdza owner-scoped banner i brak zaufania do parametrów licznikowych.

#### Manual Verification:

- Reprezentatywne ebooki dają oczekiwane wyniki w desktopowym Chrome w czasie poniżej 300 sekund.
- Pełny sukces przekierowuje na dashboard; ponowny import pokazuje liczbę już zapisanych bez duplikacji.
- Limity, błąd dostawcy, anulowanie, retry i drugi właściciel nie powodują częściowych ani cudzych zapisów.

## Testing Strategy

### Unit Tests:

- Dostępność produktu i ewaluacji, polskie mapowanie błędów oraz decyzje o przekierowaniu.
- Kontroler klienta: postęp, recovery, cancel, pending i lifecycle pamięci.

### Integration Tests:

- Kanał importu jest niezmienny, owner-scoped i przypisany do właściwych budżetów.
- Nowe API zachowuje atomowość, deduplikację, status recovery i RLS istniejącego pipeline'u.

### Manual Testing Steps:

1. Sprawdzić flagę wyłączoną oraz zachowanie już rozpoczętego importu.
2. Zaimportować zaakceptowane fixture'y w desktopowym Chrome i potwierdzić sukces/pending.
3. Sprawdzić limit pliku, timeout/provider failure, cancel, retry, ponowny import i drugiego właściciela.

## Performance Considerations

Import musi pozostać poniżej 300 sekund end-to-end dla zaakceptowanych fixture'ów. Wspólny kontroler nie może kopiować pełnego tekstu ponad konieczne tablice istniejącego pipeline'u.

## Migration Notes

Nowa migracja działa po skonsolidowanej migracji `20261008120000_pdf_processing.sql`. Istniejące importy otrzymują kanał `evaluation`; tabela `recipes` i tożsamość zapisanych przepisów nie zmieniają się.

## References

- `context/foundation/prd.md`
- `context/foundation/roadmap.md`
- `context/archive/2026-09-28-validate-pdf-processing/evaluation.md`
- `src/lib/pdf-validation.ts:30`
- `src/components/pdf-processing/PdfValidationPanel.tsx:311`
- `supabase/migrations/20261008120000_pdf_processing.sql:355`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Produktowy kanał backendu

#### Automated

- [ ] 1.1 Migracja i testy DB potwierdzają niezmienność kanału oraz poprawne zakresy budżetowe produktu i ewaluacji.
- [ ] 1.2 Testy autoryzacji potwierdzają dostęp zwykłego użytkownika do produktu, zachowanie allowlisty F-01 i izolację właścicieli.
- [ ] 1.3 Testy konfiguracji potwierdzają fail-closed `PDF_IMPORT_ENABLED` i brak sekretów produkcyjnych w preview.

#### Manual

- [ ] 1.4 Przy wyłączonej fladze nie można rozpocząć nowego importu, a istniejący import nadal można bezpiecznie zakończyć lub anulować.

### Phase 2: Wspólny klient i produktowy UX

#### Automated

- [ ] 2.1 Testy kontrolera obejmują sukces, utraconą odpowiedź finalize, anulowanie, pending, `0/0/0` i niepotwierdzony read-back.
- [ ] 2.2 Testy mapowania błędów pokrywają wszystkie znane klasy błędów bez wyświetlania kodów.
- [ ] 2.3 Build, Astro check i lint przechodzą dla obu paneli.

#### Manual

- [ ] 2.4 Produktowy import w desktopowym Chrome pokazuje polskie etapy i nie ujawnia diagnostyki F-01.
- [ ] 2.5 Wynik z niekompletnymi przepisami pozostaje na stronie, pokazuje braki i nie zapisuje tych kandydatów.

### Phase 3: Dashboard, regresja i rollout

#### Automated

- [ ] 3.1 `npm run test:pdf` przechodzi bez regresji ekstrakcji, walidacji i finalizacji.
- [ ] 3.2 `npm run test:pdf:db` potwierdza atomowość, deduplikację, RLS, kanały i budżety.
- [ ] 3.3 `npm run test:deploy-config`, `npx astro check`, `npm run lint` i `npm run build` przechodzą.
- [ ] 3.4 Test kontraktu dashboardu potwierdza owner-scoped banner i brak zaufania do parametrów licznikowych.

#### Manual

- [ ] 3.5 Reprezentatywne ebooki dają oczekiwane wyniki w desktopowym Chrome w czasie poniżej 300 sekund.
- [ ] 3.6 Pełny sukces przekierowuje na dashboard; ponowny import pokazuje liczbę już zapisanych bez duplikacji.
- [ ] 3.7 Limity, błąd dostawcy, anulowanie, retry i drugi właściciel nie powodują częściowych ani cudzych zapisów.
