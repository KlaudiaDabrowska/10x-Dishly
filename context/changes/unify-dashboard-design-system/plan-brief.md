# Design system i dashboard Dishly — Plan Brief

> Pełny plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

S-08 porządkuje istniejący system wizualny i stosuje wybrany motyw cagops na dashboardzie. Przyszłe widoki S-04 mają korzystać ze wspólnych tokenów i komponentów. Dashboard przestanie sugerować pustą kolekcję po udanym imporcie.

## Starting Point

Tokeny Tailwind/shadcn i Button istnieją, ale dashboard oraz banner mają 23 odwołania do kolorów palety poza kontraktem. Są testy funkcjonalne i lint, lecz brak skonfigurowanej weryfikacji screenshotów. Import i autoryzacja działają i zachowują swoje kontrakty.

## Desired End State

Polski dashboard ma ciepły motyw cagops, Montserrat, spójne odstępy i kontrolki. Zamiast „No recipes yet” pokazuje neutralną zapowiedź przeglądania kolekcji. Odczyt potwierdzenia importu ma widoczny loading, potwierdzony sukces albo neutralny komunikat braku potwierdzenia.

## Key Decisions Made

| Decyzja     | Wybór                                                                                    | Powód                                                  | Źródło                    |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------- |
| Motyw       | cagops; źródło w theme-source.json                                                       | Wygląd wybrany przez użytkowniczkę                     | Użytkowniczka             |
| Język       | Polski na dashboardzie, lang=pl                                                          | Spójność z importem                                    | Uzgodnienia planu         |
| Placeholder | „Twoja kolekcja przepisów”; „Przeglądanie zapisanych przepisów będzie dostępne wkrótce.” | Brak niepopartego danymi twierdzenia o pustej kolekcji | Uzgodnienia planu         |
| Brak wyniku | „Nie udało się potwierdzić wyniku importu.” po loading                                   | Null nie dowodzi porażki importu                       | Uzgodnienia planu         |
| Kontrast    | Jasne accent-foreground #A6402F, ciemne muted-foreground #9AAEBB                         | Poprawa czytelności przy zachowaniu motywu             | Pomiar podczas planowania |
| Komponenty  | Istniejący Button/variants, lokalne Card i Alert                                         | Reużycie systemu bez drugiej biblioteki                | Research / Plan           |
| Font        | Montserrat lokalnie, z licencją i polskimi znakami                                       | Brak żądania Google Fonts w przeglądarce               | Plan                      |
| Podgląd     | Oddzielny lokalny projekt Astro w tools/ui-preview                                       | Deterministyczne stany bez obejścia produkcyjnego auth | Plan                      |

## Scope

**W zakresie:**

- Globalne tokeny, minimalne komponenty, dashboard i jego feedback.
- Siedem stanów, dostępność klawiaturą, kontrast i screenshoty desktop/mobile.
- Reguły AGENTS, kontrola klas w oczyszczonych plikach oraz punktowe regresje wspólnych komponentów.

**Poza zakresem:**

- Lista, filtry, szczegóły i odczyt zawartości kolekcji; to S-04.
- Logika importu PDF, zapisy, API, ponawianie operacji i zmiana operacyjnego 503 JSON.
- Przełącznik motywu, redesign pozostałych ekranów, nowy runner screenshotów i publikacja.

## Architecture / Approach

Global CSS publikuje semantyczne role, a niezmieniony snapshot motywu zachowuje pochodzenie wartości. DashboardView.astro jest wspólnym widokiem serwerowym dla aplikacji i podglądu; feedback pozostaje niewielką wyspą React. Helper walidacji i middleware pozostają bez zmian. Nowe lokalne stany bannera rozróżniają oczekiwanie, potwierdzenie i jego niedostępność, bez rozpoznawania przyczyny null.

## Phases at a Glance

| Faza                       | Rezultat                                                  | Główne ryzyko                                                      |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Komponenty i środowisko | Card/Alert, font, lokalne stanowisko wizualne             | Przypadkowe nadpisanie istniejącego systemu                        |
| 2. Tokeny cagops           | Kolory, skale, cienie, korekty kontrastu i kontrakt       | Regresje wspólnych komponentów innych ekranów                      |
| 3. Dashboard               | Polski widok, reużycie komponentów, neutralny placeholder | Osłabienie dotychczasowych testów prywatności przy zmianie tekstów |
| 4. Stany i spójność        | Loading/unavailable, macierz, screenshoty, guard i AGENTS | Uznanie null za porażkę importu lub testów za dowód wizualny       |

**Prerequisites:** ukończone S-02; lokalne zależności, przeglądarka i Supabase do smoke; pobranie fontu i komponentów podczas implementacji. S-03 wymaga koordynacji wspólnych plików.
**Estimated effort:** cztery weryfikowane fazy; brak estymacji kalendarzowej — koszt zależy głównie od iteracji wizualnych i regresji.

## Open Risks & Assumptions

- Oryginalny motyw nie gwarantuje kontrastu; korekty są jawne i nie zmieniają snapshotu.
- Ciemny wariant sprawdzamy w podglądzie, produkcyjny dashboard pozostaje jasny bez przełącznika.
- Screenshoty 1440×900 i 390×844 używają fikcyjnych danych; brak dowodu pozostawia punkt Progress otwarty.
- Podgląd nie zastępuje kontroli prawdziwego dashboardu, izolacji kont i cyklu odczytu potwierdzenia.

## Success Criteria (Summary)

- Dashboard jest czytelny, po polsku i oparty na rolach, z prawidłowym focusem i responsywnością.
- Placeholder nie sugeruje utraty przepisów, a brak potwierdzenia nie jest przedstawiany jako porażka importu.
- Testy i guard przechodzą, screenshoty rozliczają stany, AGENTS opisuje kontrakt, a review odnosi się do C1–C5 i odroczeń.

## References

- [Research](research.md), [snapshot cagops](theme-source.json), [roadmapa S-08](../../foundation/roadmap.md).
- Pełny plan zawiera ścieżki plików, kontrakty, źródła dokumentacji i kanoniczny Progress.
