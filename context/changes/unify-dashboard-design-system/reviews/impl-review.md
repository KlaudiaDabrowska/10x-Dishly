<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Design system i dashboard Dishly

- **Plan**: `context/changes/unify-dashboard-design-system/plan.md`
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-12
- **Verdict**: APPROVED
- **Findings**: 0 open; 2 warnings and 2 observations fixed during triage

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Bazowe powierzchnie nie realizują zapisanego kontraktu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/components/ui/alert.tsx:7`, `src/components/ui/card.tsx:9`
- **Detail**: Plan, `theme-contract.md` i `AGENTS.md` przypisują powierzchniom `rounded-xl` oraz `shadow-surface`. Bazowy Alert używa `rounded-lg` bez cienia, a bazowy Card używa `shadow-sm`. Dashboard nadpisuje Card lokalnie, lecz trzy produkcyjne stany importu dziedziczą rozbieżny Alert.
- **Fix ⭐ Recommended**: Przenieść `rounded-xl shadow-surface` do bazowych Card i Alert, usunąć zbędne lokalne nadpisania oraz odtworzyć dowody wizualne.
  - Strength: Jednoznacznie realizuje kontrakt w komponencie współdzielonym i chroni przyszłych odbiorców.
  - Tradeoff: Zmienia wygląd pozostałych istniejących odbiorców Card i Alert, więc wymaga ponownej kontroli regresji.
  - Confidence: HIGH — te klasy są wprost wymagane przez plan i reguły repozytorium.
  - Blind spot: Pełna lista przyszłych odbiorców tych komponentów może wyjść poza obecny dashboard.
- **Fix B**: Zawęzić dokumentację kontraktu do powierzchni dashboardu i jawnie zachować domyślne style shadcn.
  - Strength: Ogranicza wpływ na inne ekrany.
  - Tradeoff: Osłabia cel ujednolicenia bazowych komponentów i pozostawia lokalne nadpisania.
  - Confidence: MEDIUM — technicznie spójne, ale słabiej odpowiada zaakceptowanemu zakresowi.
  - Blind spot: Wymaga ponownej akceptacji zmiany kontraktu przez użytkownika.
- **Decision**: FIXED — bazowe Card i Alert używają `rounded-xl shadow-surface`, zbędne nadpisania usunięto, a dowody wizualne odtworzono i zaakceptowano.

### F2 — Dowód focus ma odstęp, którego nie zapewnia wspólny Button

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `src/components/ui/button.tsx:8`, `tools/ui-preview/src/components/ComponentPreview.tsx:75`
- **Detail**: Plan wymaga pełnego ringu i widocznego odstępu od kontrolki. Fixture dopisuje `ring-offset-background ring-offset-2`, ale wspólny Button używany przez produkcyjny dashboard nie ma odpowiednika `focus-visible:ring-offset-*`. Screenshot focus wygląda więc mocniej niż rzeczywista kontrolka.
- **Fix**: Dodać `focus-visible:ring-offset-2 focus-visible:ring-offset-background` do `buttonVariants`, usunąć ręczny offset z fixture i odtworzyć screenshoty oraz kontrolę klawiatury.
- **Decision**: FIXED — offset focus ring przeniesiono do `buttonVariants`, fixture odzwierciedla te same klasy, a screenshoty i zachowanie klawiatury zweryfikowano.

### F3 — Kontrola izolacji preview nie śledzi importów tranzytywnych

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/ui-preview.mjs:100`
- **Detail**: Bieżący graf importów jest bezpieczny, ale skan obejmuje tylko pliki pod `tools/ui-preview`. Wspólne komponenty importowane przez alias `@/` nie są analizowane przed buildem, więc przyszły tranzytywny import klienta danych lub konfiguracji może ominąć kontrolę źródłową.
- **Fix**: Uruchamiać kontrolę izolacji przed buildem i sprawdzać jawnie dozwolony graf entry pointów wraz z importowanymi plikami z `src`.
- **Decision**: FIXED — kontrola działa przed buildem i śledzi lokalny graf importów z preview do `src`; kontrolowany import Supabase został poprawnie zablokowany.

### F4 — Guard UI przepuszcza arbitralne właściwości Tailwind

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/check-ui-contract.mjs:12`
- **Detail**: Regex wykrywa klasy takie jak `w-[13px]`, ale nie wykrywa składni arbitralnych właściwości, np. `[color:red]` lub `[--gap:13px]`, mimo że reguła AGENTS zakazuje arbitralnych wartości w oczyszczonych widokach.
- **Fix**: Rozszerzyć skan o arbitralne właściwości i potwierdzić go kontrolowanym naruszeniem obok istniejącego break-checka.
- **Decision**: FIXED — guard wykrywa arbitralne właściwości Tailwind; kontrolowane `[color:red]` spowodowało oczekiwany błąd.

## Verification evidence

- `npm run check:ui`, `npm run lint`, `node --test scripts/ui-theme.test.mjs`, `npm run test:pdf`, `npx --no-install astro check`, `npm run build`, `npm run check:ui-preview`, `npm run capture:ui-preview`, lokalny smoke oraz preview check przeszły przed review.
- Kontrolowane naruszenie `text-red-500` powoduje błąd guardu i po przywróceniu pliku check ponownie przechodzi.
- Użytkownik zaakceptował screenshoty wszystkich faz, macierz stanów i rzeczywisty zalogowany dashboard 2026-10-12.
- Nie znaleziono sekretów ani rzeczywistych danych użytkownika. Zmiana ID, abort oraz ochrona przed starym wynikiem działają zgodnie z planem.

## Triage resolution

- **Fixed**: F1, F2, F3, F4
- **Skipped**: none
- **Accepted risk**: none
- **Manual acceptance**: użytkownik zaakceptował odświeżone screenshoty 2026-10-12.
