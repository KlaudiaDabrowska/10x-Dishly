---
date: 2026-11-01T16:35:26+01:00
researcher: Codex
git_commit: d1ee706e08390b1e401693810e51d51c465cd11f
branch: docs/test-plan-rollout
repository: 10xdevs
topic: "Krytyczna poprawność importu i recovery — ryzyka #1, #2 i #5"
tags: [research, testing, pdf-import, recovery, acceptance]
status: complete
last_updated: 2026-11-01
last_updated_by: Codex
---

# Research: Krytyczna poprawność importu i recovery

**Date**: 2026-11-01T16:35:26+01:00
**Researcher**: Codex
**Git Commit**: d1ee706e08390b1e401693810e51d51c465cd11f
**Branch**: docs/test-plan-rollout
**Repository**: 10xdevs

## Research Question

Ugruntować rollout Phase 1 z `context/foundation/test-plan.md`: sprawdzić, czy import nie zapisuje błędnych lub niepełnych wyników jako poprawnych (#1), czy retry i współbieżność nie tworzą duplikatów ani częściowych zapisów (#2) oraz czy reprezentatywny PDF przechodzi aktualny przepływ produktowy do potwierdzonej persystencji w limicie (#5). Zweryfikować najtańszą wiarygodną warstwę testów i skorygować założenia planu, jeśli obecny kod lub pokrycie im przeczą.

## Summary

Na badanej rewizji strukturalna walidacja, digests i transakcje dobrze chronią zapis, lecz nie mogą wykryć semantycznego pominięcia, gdy model zwróci niepuste wymagane pola. Status `complete` zależy od wyliczonych i zgłoszonych omission codes, nie od porównania ze źródłem (`src/lib/pdf-processing/validation.ts:213-260`). Niezależne, zatwierdzone goldeny istnieją, ale aktualny blocking scorer nie promuje wszystkich różnic wykrywanych przez dokładny evaluator do błędu (`scripts/pdf-acceptance.mjs:124-164`; `scripts/pdf-evaluate.mjs:143-183`).

Recovery i idempotency są silne osobno w kliencie, serwisie i DB: terminalna finalizacja jest odtwarzalna, zapis produktowy jest transakcyjny pod blokadą wiersza, a deduplikacja zachowuje istniejący rekord (`src/lib/pdf-processing/service.ts:234-335`; `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:447-573`). Brakuje jednak jednego testu spinającego rzeczywistą trasę HTTP, recovery klienta, product finalizer, owner-scoped read-back i lokalną bazę. Obecny HTTP smoke seeduje rekordy bez import API (`scripts/smoke.mjs:47-78`, `scripts/smoke.mjs:256-306`).

Historyczny F-01 udowodnił pełną ścieżkę kanału ewaluacyjnego dla dokładnie dwóch komórek desktop Chrome: summer 4/4 w 105,4 s i lunchboxy 5/5 w 56,6 s, z read-back (`context/archive/2026-09-28-validate-pdf-processing/evaluation.md:541-552`). Nie jest to bieżący gate aktualnego kanału produktowego, który używa innej finalizacji i tworzy decisions (`src/lib/pdf-processing/persistence.ts:221-239`; `src/lib/pdf-processing/service.ts:284-335`). Najtańszy rollout powinien uzupełnić istniejące harnessy, a nie dodawać nowy runner ani live e2e na każdy PR.

## Detailed Findings

### Ryzyko #1 — poprawność i kompletność ekstrakcji

- Prompt wymaga zachowania wariantów, kolumn, instrukcji oraz jawnych braków (`src/lib/pdf-processing/prompt.ts:108-128`). Walidator sprawdza schemat, provenance, niepuste struktury i znane omission codes (`src/lib/pdf-processing/validation.ts:111-178`).
- Kod sam wylicza brak tytułu, składników, instrukcji i kategorii oraz zachowuje wymagane semantyczne omission codes modelu (`src/lib/pdf-processing/validation.ts:213-241`). Kandydat staje się `complete`, gdy ten zbiór jest pusty (`src/lib/pdf-processing/validation.ts:243-260`). Dlatego poprawnie ukształtowany, ale semantycznie zły wynik może przejść ten kontrakt.
- Konflikt treści dla wspólnego source anchor usuwa kandydata z wyniku reconciliation; identyczne nakładki łączą pages i dziedziczą status `incomplete` (`src/lib/pdf-processing/reconcile.ts:48-99`).
- Serwis zapisuje status i digest przed zwróceniem kandydata, a finalizacja wymaga pełnego zestawu zgodnych digestów (`src/lib/pdf-processing/service.ts:185-231`, `src/lib/pdf-processing/service.ts:234-284`). Automatycznie zapisywane są wpisy reconciled ze statusem `complete` (`src/lib/pdf-processing/service.ts:293-335`).
- Produktowy RPC ponownie wymaga recorded candidate o statusie `complete`; recipes, decisions, outcome i przejście do `committed` zapisują się w jednej transakcji (`supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:447-573`).
- Klient ogłasza ścieżkę sukcesu dopiero dla `committed`, `readBack=true`, `pending=0` i co najmniej jednego saved/existing (`src/lib/pdf-processing/client-import.ts:440-447`). To chroni uczciwy komunikat o persystencji, ale nie semantyczną zgodność przepisu ze źródłem.

#### Oracle i luka acceptance

- Manifest przypina hashe źródeł i referencji, a procedura fixture wymaga zatwierdzonego goldenu oraz weryfikuje schema, hashe i source anchors (`evaluation/validate-pdf-processing/manifest.json:5-37`, `scripts/pdf-fixtures.mjs:295-319`). Prywatne PDF-y i referencje są celowo poza Gitem (`context/archive/2026-09-28-validate-pdf-processing/fixtures.md:17-26`, `context/archive/2026-09-28-validate-pdf-processing/fixtures.md:56-64`).
- Dokładny evaluator porównuje tytuły, ingredient groups, instructions, servings, footnotes, categories i pages (`scripts/pdf-evaluate.mjs:20-35`, `scripts/pdf-evaluate.mjs:45-183`).
- `scoreFixture()` blokuje niedokończony run, nieuzgodnioną księgę, brakujące/wymyślone/duplikowane przepisy, `incomplete` oraz niezgodne składniki i warianty, lecz pozostałe różnice z `evaluateRecipes()` trafiają do reported counts (`scripts/pdf-acceptance.mjs:124-164`). Na tej ścieżce zła instrukcja, kategoria, strona, servings lub footnote nie musi zmienić `blocking.ok`.
- Extraction review kończy się na providerze, walidacji, reconciliation, digestach i ledgerze (`scripts/pdf-extract-review.mjs:250-386`); nie wywołuje produktowej finalizacji ani nie porównuje utrwalonych rekordów. Test DB używa syntetycznych kandydatów (`scripts/pdf-processing-db.test.mjs:738-843`).

### Ryzyko #2 — retry, współbieżność i atomowość

- Klient wybiera `importId` przed create. Dla tego samego ownera, kanału, manifestu i fingerprintu RPC create zwraca istniejący import; inne użycie ID kończy się konfliktem (`supabase/migrations/20261009120000_product_pdf_import.sql:83-121`).
- Serwis odrzuca wcześniej przetworzony batch przed kolejnym wywołaniem modelu (`src/lib/pdf-processing/service.ts:147-184`). Zapis wyniku batcha blokuje import i opiera niezmienność o `(import_id, batch_index)` (`supabase/migrations/20261008120000_pdf_processing.sql:1022-1084`).
- Product finalizer używa `FOR UPDATE`, zwraca zapisany outcome dla stanu terminalnego i zapisuje pełny wynik atomowo (`supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:447-573`). Stabilna tożsamość owner + fingerprint + source page + source item oraz `ON CONFLICT DO NOTHING` zabezpieczają reimport bez nadpisania istniejącej treści (`supabase/migrations/20261008120000_pdf_processing.sql:184-205`; `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:529-550`).
- Po utracie odpowiedzi finalize klient odpytuje status dla pięciu opóźnień: 0, 250, 500, 1000 i 2000 ms; nie ponawia modelu (`src/lib/pdf-processing/client-import.ts:310-345`, `src/lib/pdf-processing/client-import.ts:407-430`).
- „Retry providera” wymaga doprecyzowania: badana ścieżka ponawia potwierdzone 429 po zerowym reconciliation, natomiast timeouty, transport errors i 5xx kończą próbę z utrzymaną rezerwacją (`src/lib/pdf-processing/openai.ts:381-419`; `scripts/pdf-processing.test.mjs:465-488`).

#### Istniejący sygnał i luki

- Mockowany klient obejmuje lost finalize, status nadal `processing` i cancel ścigający się z commitem (`scripts/client-import.test.mjs:110-200`). Lokalna DB obejmuje atomową finalizację/replay (`scripts/pdf-processing-db.test.mjs:738-843`), lost create (`scripts/pdf-processing-db.test.mjs:1203-1229`), expiry, finalize-vs-cancel, lost commit oraz dedup reimportu (`scripts/pdf-processing-db.test.mjs:1280-1377`).
- W zbadanym `client-import.test.mjs` brak przypadku lost create na poziomie klienta i wyczerpania wszystkich odczytów statusu. Produkcyjny catch po create wykonuje status/cancel lub zachowuje unconfirmed import (`src/lib/pdf-processing/client-import.ts:654-675`), a finalize recovery może zwrócić ostatni nieterminalny stan (`src/lib/pdf-processing/client-import.ts:319-327`).
- W zbadanym DB suite race finalize-vs-cancel i lost commit dotyczą ścieżki evaluation (`scripts/pdf-processing-db.test.mjs:1294-1337`). Produktowa finalizacja z decision rows nie ma testu dwóch równoległych finalize ani product finalize-vs-cancel.
- Endpointy dodają auth, owner scope i read-back (`src/lib/pdf-import-api.ts:36-64`; `src/lib/pdf-validation.ts:151-169`), lecz istniejący smoke nie przechodzi przez `/api/imports/**` (`scripts/smoke.mjs:47-78`, `scripts/smoke.mjs:256-306`).

### Ryzyko #5 — reprezentatywny pełny przepływ

- Bieżący offline acceptance wymaga dokładnie fixture `summer` i `lunchboxy`, po trzy runy na wspólnym config digest (`scripts/pdf-acceptance.mjs:8-12`, `scripts/pdf-acceptance.mjs:167-182`). To mierzy powtarzalność ekstrakcji, ale nie aktualną persystencję produktu.
- Historyczny benchmark F-01 czyta import i recipes przez ewaluacyjne RPC, następnie wymaga committed/read-back, golden pass i czasu ≤300 s (`scripts/pdf-benchmark-report.mjs:242-330`, `scripts/pdf-benchmark-report.mjs:354-387`, `scripts/pdf-benchmark-report.mjs:564-597`). Dowód dotyczy commit `37f690e...` i kanału evaluation (`context/archive/2026-09-28-validate-pdf-processing/evaluation.md:541-587`).
- Aktualny produkt używa `finalize_pdf_product_import`, podczas gdy evaluation używa `finalize_pdf_validation_import` (`src/lib/pdf-processing/persistence.ts:221-239`). Aktualny produkt tworzy także decision rows dla reconciled incomplete candidates (`src/lib/pdf-processing/service.ts:284-335`).
- CI uruchamia syntetyczny `test:pdf`, lokalny `test:pdf:db` i HTTP smoke, ale nie `pdf:fixtures`, live acceptance ani `pdf:report` (`.github/workflows/ci.yml:27-46`, `.github/workflows/ci.yml:60-78`). DB suite korzysta z testowego recognize zamiast OpenAI (`scripts/pdf-processing-db.test.mjs:469-477`), a smoke seeduje recipes bez import API (`scripts/smoke.mjs:47-78`).
- Archiwalne S-02 odnotowuje ręczny reprezentatywny import, czas poniżej 300 s, redirect i deduplikację (`context/archive/2026-10-09-import-complete-recipes/plan.md:242-246`), ale nie jest to bieżący, odtwarzalny record przypięty do obecnego commitu i product finalizer.

## Recommended Planning Boundaries

1. **Najpierw wzmocnić istniejący deterministic oracle.** Uzgodnione różnice semantyczne z `evaluateRecipes()` powinny blokować acceptance dla zatwierdzonych goldenów. Nie tworzyć expected values z walidatora produkcyjnego.
2. **Domknąć brakujące tanie przypadki.** Dodać do client tests lost create i wyczerpanie polling; do DB suite product finalize-vs-finalize i product finalize-vs-cancel z decision rows.
3. **Dodać jeden wąski test HTTP bez providera.** Built Worker + lokalny Supabase powinien przejść przez finalize/status/read-back aktualnego kanału produktowego z deterministycznym recognize; bez Playwrighta.
4. **Dodać selektywną bramkę product acceptance.** Przed wydaniem lub po zmianie pipeline’u uruchomić `summer` i `lunchboxy` przez aktualne `/api/imports/**` na czystym koncie; wymagać `committed`, `readBack=true`, `pending=0`, zgodnej liczby persisted rows, semantycznego golden pass, ≤300 s oraz recordu commit/config/cost. Nie uruchamiać płatnego modelu na każdy PR.
5. **Zakończyć fazę aktualizacją cookbook §6.** Zapisać lokalizacje, nazewnictwo, referencyjne testy i dokładne komendy dla contract, DB/HTTP recovery oraz selektywnego product acceptance.

## Corrections to Test Plan Guidance

- Dla #1 obecne `selective acceptance` nie jest wystarczające bez promowania uzgodnionych różnic dokładnego evaluatora do blocking oraz bez mostu do product persistence/read-back (`scripts/pdf-acceptance.mjs:124-164`; `scripts/pdf-extract-review.mjs:344-386`).
- Dla #2 słowo „retry” musi rozdzielać HTTP/status recovery od wywołań providera: timeout/5xx/transport nie są ponawiane; obsługiwany jest jeden bounded retry 429 w ramach czasu (`src/lib/pdf-processing/openai.ts:381-419`).
- Dla #5 istnieje historyczny dowód pełnej ścieżki evaluation, więc plan nie powinien opisywać projektu jako pozbawionego acceptance. Luka dotyczy aktualnego kanału produktowego i bieżącej rewizji (`context/archive/2026-09-28-validate-pdf-processing/evaluation.md:541-587`; `src/lib/pdf-processing/persistence.ts:221-239`).

## Code References

- `src/lib/pdf-processing/validation.ts:111-260` — granica schema/provenance/omissions i klasyfikacja complete.
- `src/lib/pdf-processing/reconcile.ts:48-99` — deduplikacja nakładających się batchy i konflikty treści.
- `src/lib/pdf-processing/service.ts:147-335` — batch dispatch, digests, reconciliation i finalizacja.
- `src/lib/pdf-processing/client-import.ts:310-447` — lost-response recovery i semantyka sukcesu produktu.
- `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:447-573` — transakcyjna finalizacja produktu.
- `scripts/pdf-acceptance.mjs:124-182` — blocking tier i wymagany zestaw runów.
- `scripts/pdf-evaluate.mjs:45-183` — dokładny niezależny comparator.
- `scripts/pdf-extract-review.mjs:250-386` — live extraction bez product persistence.
- `scripts/pdf-processing-db.test.mjs:738-843,1203-1377` — istniejący sygnał DB/recovery.
- `.github/workflows/ci.yml:27-78` — faktyczny zestaw testów uruchamiany w CI.

## Architecture Insights

Projekt celowo rozdziela trzy rodzaje dowodu: deterministyczne testy kontraktu bez sieci, integrację z prawdziwą lokalną bazą oraz kosztowną ewaluację reprezentatywnych ebooków. Granicą zaufania jest zapisany server-side candidate digest, a źródłem oracle dla semantyki jest zatwierdzony golden, nie produkcyjna implementacja walidacji. Plan powinien zachować ten podział i dodać brakujące mosty, zamiast scalać wszystko w kosztowne e2e.

## Historical Context

- **Supported:** F-01 osiągnął GO dla dwóch desktopowych komórek Chrome na commit `37f690e...`; dowód obejmuje persisted evaluation read-back i limit 300 s (`context/archive/2026-09-28-validate-pdf-processing/evaluation.md:541-587`).
- **Supported with narrower scope:** S-02 odnotowuje ręczny produktowy import i deduplikację, lecz zapis nie daje takiego samego, bieżącego cell recordu jak F-01 (`context/archive/2026-10-09-import-complete-recipes/plan.md:242-246`).
- **Contradicted field only:** `fixtures.md:15` nadal nazywa 113-stronicowy ebook przekraczającym limit 100, podczas gdy tabela w tym samym dokumencie i aktualny limit mówią 115 (`context/archive/2026-09-28-validate-pdf-processing/fixtures.md:7-15`; `src/lib/pdf-processing/limits.ts:2-18`). Ta niespójność nie unieważnia hashów ani zatwierdzonych goldenów.

## Related Research

- `context/archive/2026-09-28-validate-pdf-processing/research.md` — pierwotne badanie wykonalności i granic przetwarzania.
- `context/archive/2026-10-09-import-complete-recipes/plan.md` — przejście z kanału ewaluacyjnego do produktu.
- `context/archive/2026-10-14-resolve-incomplete-recipes/plan.md` — trwałe decisions i obsługa incomplete candidates.

## Open Questions

1. Czy blocking product acceptance ma wymagać pełnej zgodności `evaluateRecipes()` dla wszystkich pól goldenu, czy zatwierdzonego podzbioru z jawnymi wyjątkami? Research potwierdza lukę, ale zakres oracle jest decyzją planu.
2. Czy selektywny live product acceptance ma być bramką przed wydaniem, czy obowiązkową bramką po zmianie pipeline’u? Uruchamianie go na każdy PR jest nieproporcjonalne do kosztu i prywatnych fixture.
3. Czy istniejący HTTP smoke rozszerzyć o import, czy utrzymać osobną komendę dla wąskiego product finalize/status/read-back? Obie opcje mogą użyć tego samego built Workera i lokalnego Supabase.
