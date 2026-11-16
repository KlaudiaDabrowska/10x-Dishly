# Krytyczna poprawność importu i recovery — Plan Brief

> Full plan: `context/changes/testing-critical-import-correctness-recovery/plan.md`
> Research: `context/changes/testing-critical-import-correctness-recovery/research.md`

## What & Why

Domykamy ryzyka, w których import może zaakceptować semantycznie błędny przepis, recovery może zwrócić sprzeczny wynik, a zielone testy niższych warstw nie potwierdzają rzeczywistego zapisu produktu. Zmiana wzmacnia istniejące testy, zachowując podział na szybkie kontrakty, integrację DB/HTTP i selektywny płatny acceptance.

## Starting Point

Walidacja strukturalna, digests i transakcyjna finalizacja już chronią przed częściowym zapisem. Brakuje pełnego golden oracle, produktowych testów współbieżności, mostu przez HTTP i bieżącego dowodu live dla kanału produktu.

## Desired End State

Każda zatwierdzona różnica semantyczna blokuje acceptance. Lost responses i operacje współbieżne prowadzą do jednego potwierdzonego stanu bez duplikatów. CI sprawdza rzeczywisty finalize/status/read-back bez providera, a przed każdym wydaniem wykonywana jest jedna płatna próba `summer` i jedna `lunchboxy`.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Oracle | Wszystkie zatwierdzone pola semantyczne są blokujące | Błędne instrukcje, kategorie i provenance nie mogą przechodzić jako sukces | Plan |
| Tolerancje | Zachować zatwierdzoną częściową wariantowość summer, whitespace i household-parenthetical | Są częścią zaakceptowanego kontraktu fixture | Research |
| Live gate | Obowiązkowo przed każdym wydaniem | Ogranicza koszt i nadal chroni wydanie | Plan |
| Powtórzenia | Jedna próba na każdy z dwóch ebooków | Gate mierzy integrację produktu; powtarzalność pozostaje osobnym sygnałem | Plan |
| Race fix | Dopuścić minimalną poprawkę produkcyjną | Test nie może tylko dokumentować nadal aktywnego ryzyka | Plan |
| HTTP harness | Osobny `smoke:pdf-product` w istniejącym jobie CI | Zachowuje czytelność obecnego smoke’a i nie wymaga providera | Research |

## Scope

**In scope:** golden scorer, recovery klienta, produktowe wyścigi DB, ewentualna korekta product cancel outcome, deterministyczny HTTP smoke, płatny release acceptance i cookbook.

**Out of scope:** nowe migracje, zmiana publicznych endpointów, Playwright, provider w CI, testy na każdym PR, zmiana promptu/modelu oraz regenerowanie prywatnych goldenów.

## Architecture / Approach

Szybkie testy hermetyczne chronią recovery i oracle. Lokalny Supabase sprawdza rzeczywiste blokady i atomowość. Osobny smoke łączy klienta z prawdziwymi endpointami finalize/status i RLS read-back. Płatny gate używa aktualnego kanału produktu i zapisuje prywatny, przypięty do rewizji artefakt.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Semantyczny golden oracle | Pełne blokowanie uzgodnionych różnic | Mirror test lub fałszywy sukces |
| 2. Hermetyczne recovery klienta | Lost-create i wyczerpany polling | Ponowienie modelu lub fałszywe potwierdzenie |
| 3. Produktowa współbieżność DB | Spójne finalize/cancel | Duplikaty i sprzeczny outcome |
| 4. HTTP product bridge w CI | Finalize/status/read-back bez providera | Luka między testami modułów |
| 5. Release acceptance i cookbook | Bieżący dowód na realnych ebookach | Zielone testy bez działającego produktu |

**Prerequisites:** lokalny Supabase, prywatne zatwierdzone fixture, dostęp do providera dla fazy 5.
**Estimated effort:** pięć faz implementacyjnych oraz jedno kontrolowane uruchomienie dwóch płatnych importów.

## Open Risks & Assumptions

- Prywatne fixture i referencje pozostają dostępne lokalnie i nie trafiają do Git.
- Provider może chwilowo uniemożliwić release gate; taki wynik jest niezaliczonym gate’em, nie domyślnym sukcesem.
- Lokalna zmiana `AGENTS.md` nie należy do tej zmiany i musi zostać zachowana.

## Success Criteria (Summary)

- Wszystkie zatwierdzone różnice semantyczne powodują niezaliczony acceptance.
- Recovery, finalize i cancel zawsze zgadzają się z jednym trwałym stanem.
- CI przechodzi deterministyczny product HTTP smoke bez klucza providera.
- Release evidence potwierdza po jednym udanym imporcie `summer` i `lunchboxy` w limicie 300 sekund.
