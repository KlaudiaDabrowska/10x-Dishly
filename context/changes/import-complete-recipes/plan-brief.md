# Import Complete Recipes — Plan Brief

> Full plan: `context/changes/import-complete-recipes/plan.md`

## What & Why

Dishly udostępni sprawdzony import PDF zwykłym zalogowanym użytkownikom. Kompletne przepisy zapiszą się automatycznie, a ekran F-01 pozostanie oddzielnym narzędziem ewaluacyjnym.

## Starting Point

Pipeline lokalnego odczytu, AI, walidacji, deduplikacji, RLS i atomowego zapisu już działa. Brakuje produktowego wejścia, zwykłej autoryzacji użytkownika, oddzielenia budżetu od jednorazowego F-01 oraz przyjaznego UI.

## Desired End State

Użytkownik rozpoczyna import na `/dashboard/import`, obserwuje polskie etapy i otrzymuje potwierdzony wynik. Sukces wraca na dashboard; niekompletne kandydaty pozostają niezapisane i widoczne na stronie importu.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Entry point | `/dashboard/import` | Nie przeciąża przyszłej kolekcji |
| Evaluation | Zachować osobno | Chroni dowody i benchmarki F-01 |
| Rollout | `PDF_IMPORT_ENABLED` | Pozwala bezpiecznie zatrzymać nowe importy |
| API | Osobne trasy produktu i ewaluacji | Kanał i budżet są wybierane przez serwer |
| Success | Redirect po potwierdzonym read-back | Dashboard pokazuje wynik oparty na status API |
| Pending | Pozostać na stronie | Szczegóły istnieją tylko w pamięci |
| Empty result | Błąd rozpoznania | `0/0/0` nie udaje sukcesu |
| UI | Polski, bez diagnostyki | Oddziela produkt od benchmarku |
| Budget | Wspólny miesiąc i per-import | F-01 pozostaje tylko dodatkowym limitem ewaluacji |

## Scope

**In scope:** produktowa flaga i API, kanał importu, współdzielony kontroler, polski panel, dashboard banner, budżety i testy regresji.

**Out of scope:** keep/discard, kolekcja i filtrowanie, edycja/usuwanie, OCR, ebook storage, zmiana modelu i wsparcie Firefox/mobile.

## Architecture / Approach

Produkt i F-01 używają wspólnego serwisu oraz kontrolera klienta, ale osobnych namespace'ów API. Kanał zapisany przy imporcie steruje autoryzacją i zakresem budżetowym. Dashboard odzyskuje wynik przez owner-scoped status zamiast ufać licznikom w URL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend channel | Kanał, budżety, flaga i produktowe API | Zachowanie atomowości i F-01 |
| 2. Product UX | Wspólny kontroler i polski ekran | Lifecycle pamięci i recovery |
| 3. Dashboard/rollout | Potwierdzony wynik i pełna regresja | Bezpieczna aktywacja flagi |

**Prerequisites:** F-01 i S-01 są zakończone; lokalny Supabase jest potrzebny do testów DB.
**Estimated effort:** trzy sesje implementacyjne oraz manualny smoke z prawdziwym dostawcą.

## Open Risks & Assumptions

- Aktualne parametry OpenAI, 115 stron, 20 MB i desktop Chrome pozostają bez zmian.
- Pending jest pamięciowy i znika po opuszczeniu strony do czasu S-03.
- Workers Free pozostaje zaakceptowany do wystąpienia `exceededCpu`/1102.

## Success Criteria (Summary)

- Zwykły zalogowany użytkownik importuje kompletne przepisy z prywatnym, potwierdzonym zapisem.
- F-01 nadal działa osobno, a produkt nie obciąża jednorazowego limitu F-01.
- Sukces, pending, brak wyników, retry, cancel, deduplikacja i izolacja właścicieli zachowują ustalone kontrakty.
