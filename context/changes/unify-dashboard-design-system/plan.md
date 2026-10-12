# Design system i dashboard Dishly — Implementation Plan

## Overview

S-08 porządkuje istniejący system UI i stosuje motyw cagops do `/dashboard`, wraz z komunikatem wyniku importu. Zakres i cztery fazy zatwierdzono 2026-10-12. Plan opiera się na `research.md`, nie otwiera ponownie ustaleń S-02 i nie implementuje listy przepisów z S-04.

## Current State Analysis

`src/styles/global.css:6` i `:41` zawierają wartości jasne/ciemne, a `:75` publikuje role przez `@theme inline`. `components.json:8` wskazuje ten plik i lokalne komponenty. Dashboard pomija ten kontrakt: skan wykazał 17 wystąpień kolorów palety w 9 liniach, banner 6 w 4 liniach; oba pliki nie importują bazowych komponentów UI. Istniejący Button ma warianty, focus i disabled (`src/components/ui/button.tsx:7`), ale dashboard sam styluje przycisk i link.

Placeholder jest bezwarunkowy (`src/pages/dashboard.astro:48`), więc po udanym imporcie może przeczyć bannerowi. Początkowy stan bannera i brak potwierdzenia są reprezentowane przez null (`ImportOutcomeBanner.tsx:11`, `:27`). Helper celowo odrzuca niepotwierdzone wyniki; nie wolno interpretować null jako porażki importu (`src/lib/pdf-processing/dashboard-import.ts:43`).

Tokeny i Button mają odbiorców poza dashboardem: formularze konta oraz produktowy i diagnostyczny import. Wspólne zmiany wymagają sprawdzenia regresji, nie redesignu tych ekranów. Repo ma ESLint, lint-staged, testy kontraktów i smoke, ale w zbadanej konfiguracji nie ma runnera screenshotów. Lokalnie dostępny jest Google Chrome; dowody wizualne nie wymagają instalowania Playwrighta.

## Desired End State

Dashboard używa semantycznych tokenów cagops, wspólnych kontrolek i powierzchni, czytelnej hierarchii oraz polskich tekstów. Zmiana rozmiaru ekranu i obsługa klawiaturą nie ukrywają akcji ani tożsamości użytkownika. Wygląd jest udokumentowany screenshotami i macierzą siedmiu stanów.

Uzgodnione teksty i zachowania:

| Element                              | Kontrakt                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Tytuł dokumentu / h1                 | `Twoje przepisy \| Dishly` / `Twoje przepisy`                                                   |
| Tożsamość / wylogowanie              | `Zalogowano jako` + aktualny email / `Wyloguj się`                                              |
| Główna akcja                         | `Importuj przepisy z PDF`; obecna tylko przy dostępnej funkcji                                  |
| Placeholder                          | `Twoja kolekcja przepisów` oraz `Przeglądanie zapisanych przepisów będzie dostępne wkrótce.`    |
| Trwający odczyt potwierdzenia        | `Sprawdzanie wyniku importu…`                                                                   |
| Potwierdzony wynik                   | Dotychczasowe `Import zakończony`, liczby nowych i już zapisanych przepisów z zaufanego helpera |
| Brak potwierdzenia dla poprawnego ID | `Nie udało się potwierdzić wyniku importu.`; bez twierdzenia, że import się nie udał            |
| Brak / błędny identyfikator          | Brak bannera i żądania wyniku; istniejące usuwanie parametru import pozostaje                   |

### Key Discoveries:

- Wylogowanie to natywny POST; link importu to nawigacja, nie akcja React (`dashboard.astro:25`, `:39`).
- `bg-cosmic` ma siedmiu odbiorców; przeniesienie dashboardu na role nie wymaga modyfikowania starego gradientu (`research.md`, Shared-change regression surface).
- Odpowiedź 503 JSON przy braku konfiguracji jest sprawdzana przez `scripts/check-preview.mjs:24`; jej zmiana nie jest częścią S-08.
- Motyw zawiera słabsze pary tekst/tło. Obliczenie kontrastu sRGB na surowych wartościach daje ok. 1,91:1 dla ciemnego muted-foreground/muted i 3,91:1 dla jasnego accent-foreground/accent. Plan określa korekty poniżej; screenshot nie zastępuje pomiaru kontrastu.

## What We're NOT Doing

- Lista, filtrowanie, szczegóły i odczyt liczby przepisów: C3 w tej części pozostaje odłożone do S-04.
- Modyfikacja helpera walidacji wyników importu, endpointów, zapisu, kosztów AI i rozpoznawania PDF.
- Rozróżnianie przyczyn null, ponawianie importu lub automatyczne ponawianie odczytu; ta część C4 jest odłożona.
- Zmiana operacyjnego 503 JSON, middleware lub zasad izolacji użytkowników; ta część C4 jest odłożona.
- Przełącznik motywu, wykrywanie preferencji systemowych, zapisywanie motywu użytkownika.
- Redesign logowania, strony importu, narzędzia diagnostycznego lub strony głównej; pełna lokalizacja aplikacji.
- Nowy katalog komponentów, Storybook, runner screenshotów ani nowy framework testowy.
- Publikacja aplikacji, ponowny płatny import dla screenshotów, rozszerzenie deklarowanego wsparcia importu na telefon/Firefox.

## Implementation Approach

Kolejność: komponenty i środowisko → tokeny → dashboard → stany i zabezpieczenie spójności. Jedno źródło wartości to global CSS; `theme-source.json` pozostaje niezmienionym zapisem motywu, a `theme-contract.md` opisze zastosowane role, korekty i konwencje. C1 obsługują fazy 2–3, C2 fazy 1 i 3, C3 faza 3, C4 faza 4 z powyższymi odroczeniami, C5 fazy 1 i 4.

Dashboard pozostaje renderowany na serwerze. Wydzielony `DashboardView.astro` przyjmuje email i dostępność importu, a slot feedback mieści dotychczasową wyspę React. Reużywa stylów Button przez `buttonVariants`, lokalnego Card i prezentacyjnego feedbacku. Interaktywność pozostaje w istniejącym bannerze; nie hydratować całego dashboardu.

Stanowisko wizualne będzie oddzielnym, lokalnym projektem Astro w `tools/ui-preview/`, uruchamianym przez `npm run dev:ui`. Importuje te same komponenty i global CSS, używa fikcyjnej tożsamości i deterministycznych danych; nie jest trasą produkcyjnej aplikacji. Nie importuje middleware, klientów Supabase ani modułów importu. W kontrolkach prezentacyjnych przechwytuje akcje, aby nie uruchamiać wylogowania lub importu. Prawdziwą autoryzację sprawdza smoke i przeglądarka na lokalnej aplikacji.

## Critical Implementation Details

### Granica prezentacji i danych

Wydzielenie widoku nie przenosi sprawdzania uprawnień do klienta. Helper nadal zwraca wyłącznie potwierdzone liczniki albo null. Banner rozróżnia lokalnie pending, confirmed i unavailable, ale unavailable nie ujawnia przyczyny odmowy ani informacji o właścicielu. Cleanup efektu nadal przerywa żądanie i zapobiega aktualizacji po odmontowaniu.

### Tokeny i wynikowy CSS

Nie twórz samoodwołań typu `--font-sans: var(--font-sans)`. Dla rodzin fontów i złożonych cieni użyj odrębnych nazw źródłowych i mapowania na przestrzenie nazw Tailwind. Surowe parametry cienia z tweakcn nie stają się automatycznie gotową klasą shadow; kontrakt musi złożyć je w poprawną wartość CSS. Focus ma pełne krycie tokenu ring i widoczny odstęp od kontrolki; samo odziedziczone ring/50 nie jest dowodem kontrastu.

## Phase 1: Komponenty i środowisko weryfikacji

### Overview

Przygotować minimalne współdzielone elementy i powtarzalny podgląd bez zmiany zachowania produkcyjnego dashboardu.

### Changes Required:

#### 1. Lokalne komponenty bazowe

**File**: `src/components/ui/card.tsx`, `src/components/ui/alert.tsx`, `src/components/ui/button.tsx`, `components.json`, `package.json`, lockfile

**Intent**: Wykorzystać istniejący Button i dodać brakujące powierzchnie oficjalną ścieżką shadcn.

**Contract**: Dodać Card i Alert przez `npx shadcn@latest add card alert` w istniejącym projekcie, bez `init` i nadpisywania Button/tokenów. Przejrzeć wygenerowany diff i utrzymać konfigurację new-york. Alert musi umożliwiać odpowiednią rolę status/alert; w potwierdzeniu używamy spokojnego statusu. Wygenerowane komponenty pozostają czytelnymi plikami w repo.

#### 2. Font i lokalny podgląd

**File**: `src/assets/fonts/`, `src/styles/fonts.css`, `tools/ui-preview/astro.config.mjs`, `tools/ui-preview/src/pages/index.astro`, `package.json`, `context/changes/unify-dashboard-design-system/visual-verification.md`

**Intent**: Zapewnić Montserrat i możliwość obejrzenia stanów bez usług zewnętrznych.

**Contract**: Przechowywać lokalne pliki Montserrat z legalnego źródła wraz z licencją i adresem pochodzenia, obejmujące polskie znaki i używane wagi 400–700. Zadeklarować font-face z font-display swap; nie dodawać zależności runtime ani żądań Google Fonts w przeglądarce. Podgląd używa istniejących integracji Astro/React/Tailwind, aliasu do głównego `src` i jawnego źródła klas komponentów; nie dziedziczy adaptera i sekretów produkcyjnego configu. Skrypt `dev:ui` uruchamia go lokalnie. Zapisać instrukcję podglądu, screenshotów 1440×900 i 390×844 oraz początkową macierz dowodów.

### Success Criteria:

#### Automated Verification:

- `npx --no-install astro check` i `npm run lint` przechodzą po dodaniu komponentów; diff nie zawiera ponownej inicjalizacji shadcn ani nadpisania tokenów.
- `npm run dev:ui` serwuje lokalny podgląd, a jego konfiguracja i graf importów nie korzystają z produkcyjnych sekretów, middleware ani klientów danych.

#### Manual Verification:

- Podgląd Card, Alert i istniejącego Button ma screenshoty desktop/mobile; font Montserrat wyświetla polskie znaki, a Network nie pokazuje zewnętrznych żądań fontów.

**Implementation Note**: Zapisać dowody i wynik skanu klas; ręczną akceptację wizualną odnotować przed zamknięciem fazy.

## Phase 2: Tokeny motywu cagops

### Overview

Włączyć wartości wybranego motywu do istniejących ról i określić spójne konwencje.

### Changes Required:

#### 1. Motyw, kontrast i skale

**File**: `src/styles/global.css`, `src/styles/fonts.css`, `src/components/ui/button.tsx`, `context/changes/unify-dashboard-design-system/theme-contract.md`

**Intent**: Zastąpić wartości startera motywem cagops, zachowując jedno źródło prawdy i czytelność.

**Contract**: Mapować obie gałęzie `theme-source.json` na `:root` i `.dark`, opublikować role przez `@theme inline`. Zostawić produkcyjny wybór wariantu jasnego; ciemny sprawdzać w podglądzie. Zachować oryginalny snapshot i komentarz z pochodzeniem przy bloku tokenów. Użyć `destructive-foreground` w Button zamiast sztywnego białego i pełnego ring dla focus. Nie zmieniać `bg-cosmic` ani nadpisywać lokalnych stylów innych ekranów.

Konkretny kontrakt:

- Podstawowy akcent `#B94E3A`, jasne tło `#FDFBF9`, radius `0.5rem`, baza odstępów `0.25rem`; pozostałe wartości źródłowe według snapshotu poza jawnymi korektami.
- Jasne `accent-foreground`: `#A6402F` zamiast `#B94E3A` (ok. 4,85:1 na `#F4E0D6`). Ciemne `muted-foreground`: `#9AAEBB` zamiast `#3F5A6A` (ok. 6,06:1 na `#232C42`, 7,15:1 na `#1A2026`). Powiązane jasne sidebar-accent-foreground stosuje tę samą korektę, aby nie tworzyć sprzecznych odpowiedników.
- Tekst podstawowy używa Montserrat; rodziny serif/mono zapisujemy jako role źródłowe, bez pobierania nieużywanego JetBrains Mono. Tracking zgodny ze snapshotem; nie nadpisywać spacingu arbitralnymi wartościami w widoku.
- Kontener dashboardu max-w-4xl, marginesy px-4/sm:px-6 i py-8/sm:py-12; odstęp sekcji 8, wewnętrzny 4–6; tytuł text-3xl/sm:text-4xl, nagłówek sekcji text-xl, tekst text-sm/sm:text-base. Są to uzgodnione klasy skali, nie nowe literalne wymiary.
- Powierzchnie rounded-xl, kontrolki rounded-lg, akcje minimum min-h-11; radius obu opiera się na istniejącym mapowaniu tokenu. Do powierzchni użyć semantycznego shadow-surface z parametrów tweakcn dla danego wariantu; istniejące cienie Button utrzymać w spójnej skali opisanej w theme-contract.
- Potwierdzenie używa neutralnych card/foreground i ikony z tekstem zamiast dokładania zielonej palety success. Stan niedostępnego potwierdzenia pozostaje neutralny; destructive służy faktycznym błędom, nie domniemanej porażce importu.

#### 2. Sprawdzenie wartości

**File**: `scripts/ui-theme.test.mjs`, `tools/ui-preview/src/pages/index.astro`, `context/changes/unify-dashboard-design-system/theme-contract.md`

**Intent**: Chronić czytelność rzeczywiście używanych zestawień i uwidocznić wpływ tokenów na komponenty.

**Contract**: Użyć istniejącego node:test do kontroli kontrastu wartości wynikowego kontraktu: minimum 4,5:1 dla zwykłego tekstu oraz 3:1 dla wskaźników focus względem sąsiadujących powierzchni. Sprawdzić pary foreground/background, card, muted, primary, secondary, accent i destructive użyte w podglądzie w obu wariantach, wraz z hover. Test czyta zastosowane wartości, nie niezależną kopię palety. W razie kolejnej kolizji korygować semantyczną parę w tokenach, dokumentując różnicę względem źródła.

### Success Criteria:

#### Automated Verification:

- `node --test scripts/ui-theme.test.mjs`, `npm run lint`, `npx --no-install astro check` i `npm run build` przechodzą; wynikowy CSS ma poprawne mapowania fontów i cienia bez cykli zmiennych.
- Snapshot `theme-source.json` pozostaje niezmieniony, a theme-contract dokumentuje źródło, korekty kontrastu i reguły typografii, odstępów, radius oraz cieni.

#### Manual Verification:

- Screenshoty podglądu w obu wariantach i obu szerokościach pokazują czytelne komponenty; focus jest widoczny, font załadowany, a layout nie przepełnia ekranu.
- Kontrola formularzy konta oraz produktowego i diagnostycznego importu nie wykazuje utraty czytelności lub zachowania wspólnych przycisków; nie rozszerzono ich redesignu.

**Implementation Note**: Po zmianie tokenów zapisać screenshoty i skan; wynik dotychczasowego dashboardu może nadal zawierać stare klasy aż do fazy 3.

## Phase 3: Dashboard oparty na wspólnym kontrakcie

### Overview

Zastosować system na jednym widoku i usunąć nieprawdziwe twierdzenie o pustej kolekcji.

### Changes Required:

#### 1. Wspólny widok i polskie teksty

**File**: `src/pages/dashboard.astro`, `src/components/dashboard/DashboardView.astro`, `src/layouts/Layout.astro`, `tools/ui-preview/src/pages/index.astro`, `scripts/smoke.mjs`

**Intent**: Udostępnić ten sam układ produkcyjnej stronie i lokalnemu podglądowi; ujednolicić język dashboardu.

**Contract**: Route zachowuje obecne odczyty Astro.locals, productImportAvailable i dashboardImportId. DashboardView przyjmuje email, importAvailable i slot feedback; nie pobiera danych. Natywny button POST i link korzystają z buttonVariants; placeholder z Card. Layout dostaje opcjonalny lang z domyślnym en, dashboard podaje pl i polski tytuł. Pozostałe strony nie są lokalizowane. Użyć dokładnych tekstów Desired End State. Zachować łamanie długiego emaila, heading hierarchy i aria-labelledby. Smoke zmienia oczekiwania dashboardu oraz sprawdzanie braku jego prywatnego markup; angielskie testy nawigacji strony głównej pozostają.

#### 2. Prezentacja wyniku

**File**: `src/components/pdf-processing/ImportOutcomeBanner.tsx`, `src/components/dashboard/ImportOutcomeFeedback.tsx`, `tools/ui-preview/src/pages/index.astro`

**Intent**: Reużywać prezentacji wyniku bez przenoszenia importu do warstwy widoku.

**Contract**: Czysty komponent feedbacku przyjmuje stan prezentacji i zweryfikowane liczniki; nie wykonuje fetch ani nawigacji. W tej fazie dotychczasowy sukces używa Alert i tokenów, zachowując role=status, aria-live=polite oraz dekoracyjną ikonę aria-hidden. Podgląd wykorzystuje ten sam komponent. Pozostałe stany zostają podłączone w fazie 4.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx --no-install astro check`, `npm run build` i `node --test scripts/dashboard-import.test.mjs` przechodzą; helper importu i middleware nie są zmienione.
- `BASE_URL=http://localhost:4321 npm run smoke` na lokalnej aplikacji z Supabase przechodzi z polskim dashboardem, natywnym POST, izolacją kont i zachowanymi oczekiwaniami strony głównej.

#### Manual Verification:

- Dashboard i jego wspólny podgląd mają screenshoty 1440×900 oraz 390×844; widoczne są polskie teksty, neutralny placeholder, poprawnie łamany długi email i warianty z dostępnym/niedostępnym importem.
- Skan dashboardu, DashboardView i feedbacku nie wykazuje lokalnych kolorów palety, funkcji kolorów ani arbitralnych wymiarów; klawiatura obsługuje wylogowanie i link importu z widocznym focusem.

**Implementation Note**: Ocenić screenshoty dashboardu przed zamknięciem fazy; sukces bannera nie może współistnieć z twierdzeniem o pustej kolekcji.

## Phase 4: Stany, dowody i zabezpieczenie spójności

### Overview

Domknąć stany feedbacku i pozostawić zasady, które utrzymają spójność przy realizacji S-04.

### Changes Required:

#### 1. Cykl potwierdzenia i macierz stanów

**File**: `src/components/pdf-processing/ImportOutcomeBanner.tsx`, `src/components/dashboard/ImportOutcomeFeedback.tsx`, `tools/ui-preview/src/pages/index.astro`, `context/changes/unify-dashboard-design-system/visual-verification.md`

**Intent**: Pokazać trwający odczyt i uczciwy wynik braku potwierdzenia bez zmiany znaczenia danych.

**Contract**: Poprawne importId uruchamia pending → confirmed albo unavailable według wyniku istniejącego helpera. Brak/błędne ID nie pokazuje błędu i nie uruchamia fetch; usuwanie parametru URL pozostaje. Przy zmianie ID zresetować lokalną prezentację i nie pokazać starego wyniku; cleanup abort pozostaje. Tekst unavailable jest dokładnie uzgodniony. Kontener zarezerwuje wspólne minimum miejsca dla stanów feedbacku, używając tokenu, a przy długim tekście może rosnąć bez przycinania. Loading uwzględnia prefers-reduced-motion.

Macierz końcowa:

| Stan          | Dowód                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| default       | Ten sam DashboardView, z/bez CTA, długi email; jasny i ciemny wariant w podglądzie                                                      |
| hover         | Rzeczywiste najechanie na obie kontrolki, sprawdzone kolory/kontrast                                                                    |
| focus-visible | Przejście Tab/Shift+Tab, pełny ring, dostępne nazwy                                                                                     |
| disabled      | Natywny disabled Button w podglądzie; produkcyjne linki N/A — brak interakcji pending dla nawigacji                                     |
| error         | Destructive Alert w podglądzie jako kontrakt komponentu; brak potwierdzenia w produkcji jest neutralnym unavailable, nie błędem importu |
| empty         | Uzgodniony neutralny placeholder; rzeczywista pustość kolekcji N/A do S-04                                                              |
| loading       | Odczyt potwierdzenia dla poprawnego ID, bez wstawiania niezarezerwowanej sekcji po sukcesie                                             |

Stany confirmed i unavailable są dodatkowymi przykładami feedbacku. Symulacja błędu w podglądzie nie dodaje fikcyjnego błędu produktowego.

#### 2. Reguły, kontrola i dowody regresji

**File**: `scripts/check-ui-contract.mjs`, `package.json`, `AGENTS.md`, `context/changes/unify-dashboard-design-system/visual-verification.md`, `context/changes/unify-dashboard-design-system/screenshots/`

**Intent**: Włączyć kontrolę kontraktu do istniejącego lint/CI i udostępnić przyszłym agentom zasady oraz wizualne dowody.

**Contract**: `npm run check:ui` skanuje jawny zbiór oczyszczonych plików dashboardu i feedbacku według wzorca 10x-ui; wyklucza źródło tokenów, legacy views i bazowe komponenty biblioteki. `npm run lint` uruchamia ESLint oraz ten check, więc istniejące CI go egzekwuje. Check zgłasza plik/linię i kończy się błędem przy naruszeniu. W AGENTS poza blokiem CLI wpisać źródło tokenów, komponenty, reużycie przed tworzeniem, dodawanie brakujących przez shadcn, zakaz kolorów literalnych/arbitralnych wartości w widokach, konwencje skali i miejsce podglądu/dowodów. Screenshoty mają fikcyjne dane i opis wariantu, viewportu, stanu oraz ocenionych różnic. Nie aktualizować dowodów wyłącznie dla zielonego checka.

### Success Criteria:

#### Automated Verification:

- `npm run check:ui` i `npm run lint` przechodzą; kontrolowane wstrzyknięcie zakazanej klasy do oczyszczonego pliku powoduje błąd checka, a przywrócenie pliku ponownie daje sukces.
- `node --test scripts/ui-theme.test.mjs`, `npm run test:pdf`, `npx --no-install astro check` i `npm run build` przechodzą; zmienione kontrakty tekstu nie osłabiają kontroli prywatności.
- Lokalny smoke oraz `scripts/check-preview.mjs` na buildzie preview przechodzą zgodnie z istniejącą sekwencją CI; nieskonfigurowany dashboard nadal zwraca 503 JSON i private/no-store.

#### Manual Verification:

- Macierz siedmiu stanów oraz confirmed/unavailable ma screenshoty desktop/mobile w obu wariantach, uzasadnienia N/A i ocenę kontrastu/focus; rzeczywisty dashboard sprawdzono w wariancie jasnym po zalogowaniu.
- Kontrolowane odpowiedzi odczytu obejmują opóźniony sukces, null, błędny i brakujący ID oraz przerwane żądanie; UI nie twierdzi, że import się nie udał, nie pokazuje starego wyniku i nie zmienia walidacji liczb.
- Regresja konta i obu widoków importu jest oceniona, zasady AGENTS są poza blokiem CLI, a `/10x-impl-review unify-dashboard-design-system` rozlicza C1–C5 i jawne odroczenia.

**Implementation Note**: Nie oznaczać ręcznych kryteriów jako ukończonych na podstawie samych testów. Brak działającego środowiska lub screenshotu pozostawia odpowiedni punkt otwarty z konkretnym powodem.

## Testing Strategy

### Unit Tests:

- Istniejące testy dashboard-import zachowują warunki UUID, cleanup URL i akceptacji zaufanych wyników.
- Nowy test kontrastu sprawdza realne pary ról; nie dodawać testów powtarzających tekst każdej klasy.
- Skuteczność guardu zweryfikować kontrolowanym naruszeniem i przywróceniem pliku, bez osobnego frameworka.

### Integration Tests:

- Smoke na lokalnym Supabase sprawdza logowanie, obie tożsamości, zmienione teksty dashboardu, POST signout i cache. Aktualizować również negatywne asercje prywatnego markup.
- Preview check utrzymuje fail-closed 503. Nie uruchamiać go przeciw produkcji.
- Cykl feedbacku obejrzeć w przeglądarce z kontrolowaną odpowiedzią istniejącego GET: bez prawdziwego importu, bez zmian backendu lub obejścia auth. Podgląd daje deterministyczne stany komponentu, ale nie zastępuje tej kontroli integracji.

### Manual Testing Steps:

1. Uruchomić lokalny podgląd i aplikację z konfiguracją testową; używać fikcyjnych danych w zapisanych screenshotach.
2. Po każdej fazie wizualnej zapisać screenshoty desktop/mobile oraz wynik skanu; po tokenach porównać oba warianty.
3. Na dashboardzie sprawdzić długi email, tab order, wylogowanie, zwykły link importu i jego nieobecność przy wyłączonej funkcji.
4. Zweryfikować pending → confirmed/unavailable, cleanup URL i reload bez bannera; błędny ID nie generuje żądania.
5. Porównać punktowe regresje współdzielonych komponentów, uzupełnić macierz i przeprowadzić review.

## Performance Considerations

Bez nowego zapytania o kolekcję, pollingu i hydratacji całego dashboardu. Font jest lokalny z swap i ograniczonym zakresem wag; nie pobierać nieużywanych rodzin. Podgląd nie wchodzi do buildu aplikacji. Rezerwacja miejsca feedbacku ogranicza przesunięcia, lecz nie może przycinać tekstu przy powiększeniu.

## Migration Notes

Brak migracji danych i nowych sekretów. Zwykły build oraz dotychczasowy proces wdrożenia wystarczą po osobnej decyzji o publikacji. Wycofanie dotyczy komponentów/tokenów/tekstów razem z odpowiadającymi testami, bez cofania danych i polityki dostępu. Koordynować wspólne pliki z S-03. S-04 zaczyna implementację nowych widoków po ukończeniu kontraktu S-08.

## References

- `research.md`, `change.md`, `theme-source.json`; roadmap S-08.
- `src/pages/dashboard.astro:14`, `src/components/ui/button.tsx:7`, `src/lib/pdf-processing/dashboard-import.ts:31`, `scripts/smoke.mjs:77`, `scripts/check-preview.mjs:24`.
- Motyw: https://tweakcn.com/themes/cmnjexv1n000304jse9nq2jra — wartości zapisane 2026-10-12.
- Context7, sprawdzone 2026-10-12: [Tailwind theme i inline](https://tailwindcss.com/docs/theme), [Astro framework components](https://docs.astro.build/en/guides/framework-components/), [shadcn CLI](https://ui.shadcn.com/docs/cli). Komponenty React bez client dyrektywy renderują się statycznie; obecne warianty Button pozwalają zachować natywne elementy Astro.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Komponenty i środowisko weryfikacji

#### Automated

- [ ] 1.1 `npx --no-install astro check` i `npm run lint` przechodzą po dodaniu komponentów; diff nie zawiera ponownej inicjalizacji shadcn ani nadpisania tokenów.
- [ ] 1.2 `npm run dev:ui` serwuje lokalny podgląd, a jego konfiguracja i graf importów nie korzystają z produkcyjnych sekretów, middleware ani klientów danych.

#### Manual

- [ ] 1.3 Podgląd Card, Alert i istniejącego Button ma screenshoty desktop/mobile; font Montserrat wyświetla polskie znaki, a Network nie pokazuje zewnętrznych żądań fontów.

### Phase 2: Tokeny motywu cagops

#### Automated

- [ ] 2.1 `node --test scripts/ui-theme.test.mjs`, `npm run lint`, `npx --no-install astro check` i `npm run build` przechodzą; wynikowy CSS ma poprawne mapowania fontów i cienia bez cykli zmiennych.
- [ ] 2.2 Snapshot `theme-source.json` pozostaje niezmieniony, a theme-contract dokumentuje źródło, korekty kontrastu i reguły typografii, odstępów, radius oraz cieni.

#### Manual

- [ ] 2.3 Screenshoty podglądu w obu wariantach i obu szerokościach pokazują czytelne komponenty; focus jest widoczny, font załadowany, a layout nie przepełnia ekranu.
- [ ] 2.4 Kontrola formularzy konta oraz produktowego i diagnostycznego importu nie wykazuje utraty czytelności lub zachowania wspólnych przycisków; nie rozszerzono ich redesignu.

### Phase 3: Dashboard oparty na wspólnym kontrakcie

#### Automated

- [ ] 3.1 `npm run lint`, `npx --no-install astro check`, `npm run build` i `node --test scripts/dashboard-import.test.mjs` przechodzą; helper importu i middleware nie są zmienione.
- [ ] 3.2 `BASE_URL=http://localhost:4321 npm run smoke` na lokalnej aplikacji z Supabase przechodzi z polskim dashboardem, natywnym POST, izolacją kont i zachowanymi oczekiwaniami strony głównej.

#### Manual

- [ ] 3.3 Dashboard i jego wspólny podgląd mają screenshoty 1440×900 oraz 390×844; widoczne są polskie teksty, neutralny placeholder, poprawnie łamany długi email i warianty z dostępnym/niedostępnym importem.
- [ ] 3.4 Skan dashboardu, DashboardView i feedbacku nie wykazuje lokalnych kolorów palety, funkcji kolorów ani arbitralnych wymiarów; klawiatura obsługuje wylogowanie i link importu z widocznym focusem.

### Phase 4: Stany, dowody i zabezpieczenie spójności

#### Automated

- [ ] 4.1 `npm run check:ui` i `npm run lint` przechodzą; kontrolowane wstrzyknięcie zakazanej klasy do oczyszczonego pliku powoduje błąd checka, a przywrócenie pliku ponownie daje sukces.
- [ ] 4.2 `node --test scripts/ui-theme.test.mjs`, `npm run test:pdf`, `npx --no-install astro check` i `npm run build` przechodzą; zmienione kontrakty tekstu nie osłabiają kontroli prywatności.
- [ ] 4.3 Lokalny smoke oraz `scripts/check-preview.mjs` na buildzie preview przechodzą zgodnie z istniejącą sekwencją CI; nieskonfigurowany dashboard nadal zwraca 503 JSON i private/no-store.

#### Manual

- [ ] 4.4 Macierz siedmiu stanów oraz confirmed/unavailable ma screenshoty desktop/mobile w obu wariantach, uzasadnienia N/A i ocenę kontrastu/focus; rzeczywisty dashboard sprawdzono w wariancie jasnym po zalogowaniu.
- [ ] 4.5 Kontrolowane odpowiedzi odczytu obejmują opóźniony sukces, null, błędny i brakujący ID oraz przerwane żądanie; UI nie twierdzi, że import się nie udał, nie pokazuje starego wyniku i nie zmienia walidacji liczb.
- [ ] 4.6 Regresja konta i obu widoków importu jest oceniona, zasady AGENTS są poza blokiem CLI, a `/10x-impl-review unify-dashboard-design-system` rozlicza C1–C5 i jawne odroczenia.
