---
date: 2026-11-22T17:54:44+01:00
researcher: Codex
git_commit: 4dd8da7048106280daa6f08c9b30d614360873c4
branch: plan/testing-critical-import-correctness-recovery
repository: 10xdevs
topic: "Diagnose the PDF input-token accounting mismatch before another paid attempt"
tags: [research, pdf-processing, token-accounting, openai, spending-control]
status: complete
last_updated: 2026-11-22
last_updated_by: Codex
---

# Research: PDF input-token accounting mismatch

**Date**: 2026-11-22T17:54:44+01:00
**Researcher**: Codex
**Git Commit**: 4dd8da7048106280daa6f08c9b30d614360873c4
**Branch**: plan/testing-critical-import-correctness-recovery
**Repository**: 10xdevs

## Research Question

Jak bez kolejnej płatnej próby ustalić, co trzeba zmienić w kontrakcie diagnostyki
i rozliczania tokenów po błędzie `input-token-accounting-mismatch`, nie osłabiając
ochrony budżetu ani prywatności treści PDF?

## Summary

W zbadanej ścieżce `recognizePdfBatch` ten sam stabilny kod błędu obejmuje dwa
warunki: nierówność wyniku count i `usage.input_tokens` oraz nieprawidłowe
`cached_tokens` ([openai.ts:309](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L309)). Obecny błąd zachowuje kod, ale nie zachowuje rodzaju rozbieżności, obu
liczników, modelu ani identyfikatora odpowiedzi ([openai.ts:35](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L35)). Dlatego przy tym incydencie root cause pozostaje nierozstrzygnięty.

W zbadanej ścieżce po przyznaniu rezerwacji każdy błąd inny niż potwierdzone HTTP
429 pozostawia koszt zablokowany, a serwis oznacza import jako nieudany
([openai.ts:375](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L375), [service.ts:178](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/service.ts#L178)). To zachowanie jest właściwe dla obecnego incydentu: provider zwrócił odpowiedź, lecz aplikacja nie ma wiarygodnego raportu, na podstawie którego mogłaby rozliczyć albo zwolnić blokadę.

Przed kolejną płatną próbą potrzebny jest hermetycznie testowalny, beztreściowy
rekord diagnostyczny. Minimalny rekord ma rozróżniać rodzaj mismatchu i zawierać
wyłącznie: losowy `diagnosticId`, indeks batcha, numer próby, prywatne identyfikatory
rezerwacji i odpowiedzi, API, model żądany i zwrócony, count, usage, podpisaną deltę
oraz zwalidowane `cached_tokens` albo informację o ich braku. W zbadanej ścieżce
wszystkie te wartości są dostępne przed wyrzuceniem błędu lub w otaczającej pętli
([openai.ts:293](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L293), [openai.ts:309](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L309), [openai.ts:365](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L365)).

## Detailed Findings

### 1. Mismatch jest możliwy do odtworzenia bez sieci i kosztu

- W jednym hermetycznym teście adaptera mock count może zwrócić `123`, a mock
  zakończonej odpowiedzi `124`; zbadany parser wtedy rzuci dokładnie
  `input-token-accounting-mismatch` ([openai.ts:313](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L313)).
- Obecny pozytywny test obejmuje dokładnie sekwencję count, jedna rezerwacja,
  generation i jedno reconciliation dla zgodnej wartości `123`
  ([pdf-processing.test.mjs:153](/home/klaudia/Pulpit/10xdevs/scripts/pdf-processing.test.mjs#L153)). Nie ma w nim gałęzi nierównych liczników.
- Test regresyjny powinien dla tego jednego scenariusza udowodnić: dwa mockowane
  wywołania HTTP, jedną rezerwację, brak reconciliation, brak retry, brak wyniku
  zaakceptowanego i zachowanie rezerwacji jako held. Nie wymaga to połączenia z
  providerem.

### 2. Minimalny evidence contract może pozostać beztreściowy

- Dla warunku z linii 313 `mismatchKind` powinien wynosić `count-vs-usage`; dla
  warunku z linii 320 powinien wynosić `cached-token-detail-invalid`
  ([openai.ts:313](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L313), [openai.ts:318](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L318)).
- Publiczna odpowiedź powinna zawierać dokładnie stabilny kod błędu i losowy
  `diagnosticId`. Prywatny rekord może zawierać allowlistowane liczniki i
  identyfikatory; obecny `OpenAiPdfError` wymaga do tego opcjonalnego, ściśle
  typowanego pola `evidence`, a nie rozbudowy tekstu `message`
  ([openai.ts:35](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L35)).
- Rekord nie powinien zawierać tekstu lub nazwy PDF, batcha, promptu, request body,
  schematu, outputu, surowej odpowiedzi providera, sekretów, danych właściciela ani
  surowych wyjątków. Te pola nie są potrzebne do porównania dwóch liczników.
- W tej zmianie nie jest potrzebna migracja bazy: runner ma już zapis exclusive
  create z trybem `0600`, a katalog per-run ma `0700`
  ([pdf-product-acceptance.mjs:501](/home/klaudia/Pulpit/10xdevs/scripts/pdf-product-acceptance.mjs#L501), [pdf-product-acceptance.mjs:505](/home/klaudia/Pulpit/10xdevs/scripts/pdf-product-acceptance.mjs#L505)).

### 3. Runner obecnie traci dowód błędu

- Dla każdego fixture w zbadanej pętli prywatny JSON powstaje dopiero po pomyślnym
  powrocie `executeFixtureAcceptance`; wyjątek przed linią 525 zostawia katalog bez
  rekordu fixture ([pdf-product-acceptance.mjs:519](/home/klaudia/Pulpit/10xdevs/scripts/pdf-product-acceptance.mjs#L519)). To wyjaśnia puste katalogi po incydencie.
- Istniejący test potwierdza dla jednego zapisu tryb `0600` i odmowę nadpisania
  istniejącego pliku ([pdf-product-acceptance.test.mjs:127](/home/klaudia/Pulpit/10xdevs/scripts/pdf-product-acceptance.test.mjs#L127)); osobny test musi pokryć zapis allowlistowanego failure record po wyjątku.
- Istniejący test CLI dla jednego błędu potwierdza, że stdout nie zawiera prywatnej
  wiadomości wyjątku ([pdf-product-http.test.mjs:48](/home/klaudia/Pulpit/10xdevs/scripts/pdf-product-http.test.mjs#L48)). Nowy test powinien dodatkowo sprawdzić dokładny zestaw kluczy rekordu i negatywne markery treści, promptu, odpowiedzi i sekretów.

### 4. Rezerwacji z incydentu nie wolno automatycznie zwolnić

- W zbadanej ścieżce rezerwacja zostaje przypisana przed płatnym dispatch, a
  specjalne reconciliation do zera jest uruchamiane wyłącznie dla kodu
  `provider-rate-limited` ([openai.ts:375](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L375), [openai.ts:381](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L381)).
- Zwykłe reconciliation wymaga raportu z input tokens, output tokens i output
  digest ([import-state.ts:86](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/import-state.ts#L86)). Mismatch blokuje powstanie tego raportu przed linią 387 adaptera
  ([openai.ts:386](/home/klaudia/Pulpit/10xdevs/src/lib/pdf-processing/openai.ts#L386)).
- Dla tego incydentu poprawny stan to import `failed`, batch i rezerwacja nadal
  `dispatch-claimed`, bez automatycznego retry i bez zerowego rozliczenia. Zbadany
  read-back potrafi ujawnić stan rezerwacji i koszt, ale `inputTokens` pozostaje
  `null`, dopóki nie nastąpi reconciliation
  ([20261008120000_pdf_processing.sql:667](/home/klaudia/Pulpit/10xdevs/supabase/migrations/20261008120000_pdf_processing.sql#L667)).
- Usunięcie testowego użytkownika nie jest ścieżką rozliczeniową. W jednym miejscu
  runner ignoruje błąd `deleteUser`, więc nie może traktować cleanupu jako dowodu
  zwolnienia ledgera ([pdf-product-acceptance.mjs:496](/home/klaudia/Pulpit/10xdevs/scripts/pdf-product-acceptance.mjs#L496)).

### 5. Kolejna płatna próba musi być osobnym, ręcznie zatwierdzonym krokiem

- Najpierw powinny przejść bezpłatne testy: rozróżnienie obu rodzajów mismatchu,
  exact allowlist, brak wycieku, zapis `0600`/exclusive create, jedno dispatch,
  brak retry i brak reconciliation.
- Dopiero potem można wykonać jedną wąską próbę diagnostyczną z osobnym limitem i
  zgodą. Pełny product acceptance pozostaje odrębnym gate'em; wynik diagnostyczny
  ma najpierw rozstrzygnąć, czy problem leży w providerze/model aliasie, czy w
  kontrakcie requestów.
- Oficjalna dokumentacja opisuje count endpoint jako dokładny pomiar wejścia; w
  zbadanych źródłach nie ma podstaw do wprowadzenia tolerancji przed uzyskaniem
  nowego dowodu ([OpenAI token counting](https://developers.openai.com/api/docs/guides/token-counting)).

## Code References

- `src/lib/pdf-processing/openai.ts:35-45` — błąd zachowuje kod i opcjonalny delay.
- `src/lib/pdf-processing/openai.ts:277-320` — walidacja odpowiedzi i dwa warunki mismatchu.
- `src/lib/pdf-processing/openai.ts:351-419` — count, rezerwacja, dispatch, reconciliation i retry.
- `src/lib/pdf-processing/service.ts:157-181` — błąd po dispatch zamyka import jako failed.
- `src/lib/pdf-processing/import-state.ts:86-98` — wymagania normalnego reconciliation.
- `scripts/pdf-product-acceptance.mjs:496-525` — cleanup i zapis dowodu dopiero po sukcesie.
- `supabase/migrations/20261008120000_pdf_processing.sql:651-694` — stan ledgera dostępny w read-back.

## Architecture Insights

Fail-closed spending control i diagnostyka powinny pozostać osobnymi warstwami.
Pierwsza chroni budżet, gdy koszt jest niepewny; druga ma dostarczyć minimalny dowód
bez treści użytkownika. Diagnostyka nie może sama zwalniać rezerwacji ani zmieniać
reguły równości liczników.

## Historical Context (from prior changes)

- W trzech wskazanych historycznych runach tego samego adaptera wszystkie płatne
  wywołania zostały rozliczone; wyjątkiem jest tylko to, że dowód historyczny nie
  rozstrzyga obecnego pojedynczego mismatchu
  (`context/archive/2026-09-28-validate-pdf-processing/evaluation.md:397-420`).
- Ścisłe porównanie count i usage pochodzi z commita `50c2122`; obecny incydent
  pokazał lukę dowodową, nie dowód, że sama reguła jest błędna.
- `frame.md` odrzucił rozmiar fixture i regresję nowego runnera jako wyjaśnienie
  zbadanej próby, ale pozostawił root cause nierozstrzygnięty
  (`context/changes/diagnose-token-accounting-mismatch/frame.md:38-47`).

## Related Research

- `context/changes/diagnose-token-accounting-mismatch/frame.md` — rozdzielenie obserwacji od hipotez.
- `context/changes/testing-critical-import-correctness-recovery/research.md` — oracle wcześniejszej fazy jakości.

## Open Questions

1. Czy nowy dowód pokaże różnicę count-vs-usage, czy nieprawidłowy cached-token detail?
2. Czy `returnedModel` będzie tym samym snapshotem co w poprzednich udanych runach?
3. Czy wiarygodny dowód billingowy providera pozwoli później przenieść held amount
   do kosztu faktycznego? Taka ścieżka wymaga osobnego projektu i audytu; nie należy
   jej domniemywać w tej zmianie.
4. Jak zachować finansowy ledger po cleanupie prywatnych danych testowego właściciela?
   To jest osobna decyzja retencyjna, nie warunek bezpiecznej diagnostyki mismatchu.
