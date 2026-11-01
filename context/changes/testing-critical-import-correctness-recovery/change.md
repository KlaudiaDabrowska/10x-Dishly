---
change_id: testing-critical-import-correctness-recovery
title: Krytyczna poprawność importu i recovery
status: preparing
created: 2026-11-01
updated: 2026-11-01
archived_at: null
---

## Notes

Otwórz folder zmiany dla fazy 1 z context/foundation/test-plan.md: „Krytyczna poprawność importu i recovery”.
Objęte ryzyka: #1, #2, #5. Planowane typy testów: contract + DB integration + selective acceptance.
Intencja reakcji na ryzyka:
- #1: udowodnij, że braki, pomieszane warianty i błędne pola nie wchodzą jako poprawny zapis ani pełny sukces.
- #2: udowodnij, że retry i współbieżność dają jeden uzgodniony wynik bez częściowych zapisów.
- #5: udowodnij, że reprezentatywny PDF przechodzi pełny przepływ w limicie, a awaria nie udaje sukcesu.
Po utworzeniu folderu zastosuj downstream continuation rule.
