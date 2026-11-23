# Krytyczna poprawność importu i recovery — Plan Brief

> Full plan: `context/changes/testing-critical-import-correctness-recovery/plan.md`
> Research: `context/changes/testing-critical-import-correctness-recovery/research.md`

## What & Why

Domykamy ryzyka, w których import może zaakceptować semantycznie błędny przepis, recovery może zwrócić sprzeczny wynik, a zielone testy niższych warstw nie potwierdzają rzeczywistego zapisu produktu. Zmiana wzmacnia istniejące testy, zachowując podział na szybkie kontrakty, integrację DB/HTTP i selektywny płatny acceptance. Ukończenie implementacji testów jest oddzielone od gotowości konkretnego wydania.

## Starting Point

Golden oracle, produktowe testy współbieżności, most HTTP i release-acceptance harness są zaimplementowane. Bieżący live gate zatrzymuje się fail-closed na `count-vs-usage`; zapisuje sanitizowany dowód i pozostawia niepewny koszt held.

## Desired End State

Każda zatwierdzona różnica semantyczna blokuje acceptance. Lost responses i operacje współbieżne prowadzą do jednego potwierdzonego stanu bez duplikatów. CI sprawdza rzeczywisty finalize/status/read-back bez providera. Rollout testów może przejść dalej po zweryfikowaniu harnessu, ale każde wydanie pozostaje zablokowane do jednej udanej próby `summer` i jednej `lunchboxy`.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Oracle | Wszystkie zatwierdzone pola semantyczne są blokujące | Błędne instrukcje, kategorie i provenance nie mogą przechodzić jako sukces | Plan |
| Tolerancje | Zachować zatwierdzoną częściową wariantowość summer, whitespace i household-parenthetical | Są częścią zaakceptowanego kontraktu fixture | Research |
| Live gate | Obowiązkowo przed każdym wydaniem | Ogranicza koszt i nadal chroni wydanie | Plan |
| Statusy | Rollout completion i release readiness są niezależne | Awaria dostawcy nie zatrzymuje tworzenia kolejnych testów, ale nadal blokuje wydanie | Replan 2026-11-23 |
| Powtórzenia | Jedna próba na każdy z dwóch ebooków | Gate mierzy integrację produktu; powtarzalność pozostaje osobnym sygnałem | Plan |
| Race fix | Dopuścić minimalną poprawkę produkcyjną | Test nie może tylko dokumentować nadal aktywnego ryzyka | Plan |
| HTTP harness | Osobny `smoke:pdf-product` w istniejącym jobie CI | Zachowuje czytelność obecnego smoke’a i nie wymaga providera | Research |

## Scope

**In scope:** golden scorer, recovery klienta, produktowe wyścigi DB, korekta product cancel outcome, deterministyczny HTTP smoke, release-acceptance harness, bezpieczne failure evidence i cookbook.

**Out of scope:** nowe migracje, zmiana publicznych endpointów, Playwright, provider w CI, testy na każdym PR, zmiana promptu/modelu oraz regenerowanie prywatnych goldenów.

## Architecture / Approach

Szybkie testy hermetyczne chronią recovery i oracle. Lokalny Supabase sprawdza rzeczywiste blokady i atomowość. Osobny smoke łączy klienta z prawdziwymi endpointami finalize/status i RLS read-back. Płatny gate używa aktualnego kanału produktu i zapisuje prywatny, przypięty do rewizji artefakt; jego wynik steruje release readiness, nie statusem wdrożenia testów.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Semantyczny golden oracle | Pełne blokowanie uzgodnionych różnic | Mirror test lub fałszywy sukces |
| 2. Hermetyczne recovery klienta | Lost-create i wyczerpany polling | Ponowienie modelu lub fałszywe potwierdzenie |
| 3. Produktowa współbieżność DB | Spójne finalize/cancel | Duplikaty i sprzeczny outcome |
| 4. HTTP product bridge w CI | Finalize/status/read-back bez providera | Luka między testami modułów |
| 5. Release acceptance harness i cookbook | Gotowy gate, bezpieczna porażka i trwała polityka release | Zielone testy bez działającego produktu |

**Prerequisites:** lokalny Supabase i prywatne zatwierdzone fixture; dostęp do providera jest wymagany dopiero dla gate'u konkretnego wydania.
**Estimated effort:** pięć faz implementacyjnych; przyszły release gate pozostaje osobną kontrolowaną operacją płatną.

## Open Risks & Assumptions

- Prywatne fixture i referencje pozostają dostępne lokalnie i nie trafiają do Git.
- Provider może chwilowo uniemożliwić release gate; taki wynik jest niezaliczonym gate’em, nie domyślnym sukcesem.
- Ukończenie rollout'u nie autoryzuje wydania ani kolejnej płatnej próby.
- Lokalna zmiana `AGENTS.md` nie należy do tej zmiany i musi zostać zachowana.

## Success Criteria (Summary)

- Wszystkie zatwierdzone różnice semantyczne powodują niezaliczony acceptance.
- Recovery, finalize i cancel zawsze zgadzają się z jednym trwałym stanem.
- CI przechodzi deterministyczny product HTTP smoke bez klucza providera.
- Harness zapisuje prawdziwy sukces albo sanitizowaną porażkę; release wymaga później po jednym udanym imporcie `summer` i `lunchboxy` w limicie 300 sekund.
