<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Import kompletnych przepisów

- **Plan**: `context/changes/import-complete-recipes/plan.md`
- **Scope**: Pełny plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-12
- **Verdict**: APPROVED
- **Findings**: 0 nierozwiązanych; naprawiono 2 ostrzeżenia i 1 obserwację

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | ZALICZONE |
| Dyscyplina zakresu | ZALICZONE |
| Bezpieczeństwo i jakość | ZALICZONE |
| Architektura | ZALICZONE |
| Spójność ze wzorcami | ZALICZONE |
| Kryteria sukcesu | ZALICZONE |

## Dowody spełnienia kryteriów sukcesu

- `npm run test:pdf`: ZALICZONE, 118/118 testów.
- `npm run test:pdf:db`: ZALICZONE, 23/23 testów; izolowany projekt został usunięty.
- `npm run test:deploy-config`: ZALICZONE, 8/8 testów.
- `npx astro check`: ZALICZONE, 0 błędów i 0 ostrzeżeń (jedna podpowiedź informacyjna).
- `npm run lint`: ZALICZONE.
- `npm run build`: ZALICZONE.
- Ręczne punkty postępu 1.4, 2.4–2.5 i 3.5–3.7 zostały wykonane i potwierdzone przez użytkownika podczas implementacji. Obejmowały wyłączoną flagę, kontynuację i anulowanie, importy kompletne i niekompletne, reprezentatywne ebooki, przekierowanie, deduplikację, błędy oraz izolację właścicieli.

## Ustalenia

### F1 — Odzyskiwanie po utracie odpowiedzi `finalize` może zgłosić błąd podczas trwającego zapisu

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — wymaga rozważenia rzeczywistego kompromisu
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/lib/pdf-processing/client-import.ts:109`
- **Szczegóły**: Po utracie odpowiedzi `finalize` funkcja `recoverStatus()` natychmiast wykonuje jedno zapytanie o status. Nieterminalny wynik `processing` zostaje zamieniony na wynik z zerowymi licznikami. Kontroler usuwa aktywny import i pokazuje końcowy błąd, chociaż pierwotna finalizacja może zatwierdzić zapis chwilę później. Przepisy mogą więc zostać zapisane po komunikacie o niepowodzeniu, bez oczekiwanego potwierdzenia na dashboardzie. Testy pokrywają status `committed`, ale nie wyścig `processing`.
- **Naprawa**: Traktować `processing` po utracie odpowiedzi jako stan nierozstrzygnięty i odpytywać status przez ograniczony czas, aż do wyniku terminalnego lub jawnego wyniku niepotwierdzonego. Do tego czasu zachować odpowiedzialność za odzyskanie importu. Dodać test `processing` → `committed`.
  - Zaleta: Zachowuje wymóg potwierdzonego wyniku i zapobiega mylącemu błędowi po możliwie udanym zapisie.
  - Koszt: Dodaje ograniczoną politykę odpytywania i kolejną ścieżkę asynchroniczną.
  - Pewność: WYSOKA — obecne pojedyncze sprawdzenie jest jednoznaczne, a wyścig wynika bezpośrednio z kontraktu statusu.
  - Niewiadoma: Plan nie określa odstępu ani maksymalnego czasu odpytywania.
- **Decision**: FIXED — dodano ograniczone odpytywanie statusu `finalize`, jawny stan niepotwierdzony i test `processing` → `committed`.

### F2 — Status i anulowanie wymagają niezwiązanego z nimi aktywnego klucza OpenAI

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — wymaga rozważenia rzeczywistego kompromisu
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/lib/pdf-validation.ts:167`
- **Szczegóły**: Każda operacja inna niż tworzenie korzysta z `infrastructureAvailable()`, które wymaga `OPENAI_API_KEY`, `SUPABASE_URL` i `SUPABASE_SECRET_KEY`. `guard()` również odmawia utworzenia serwisu bez klucza dostawcy. Status i anulowanie wymagają tylko Supabase, a finalizacja nie wywołuje dostawcy. Brak klucza OpenAI blokuje więc bezpieczne sprawdzenie i anulowanie istniejących importów kodem `503`, mimo sprawnej bazy. Obecne testy sprawdzają wyłączone flagi przy kompletnej infrastrukturze, ale nie awarię poświadczeń dostawcy.
- **Naprawa**: Uzależnić wymagania od operacji: create/batch wymagają dostawcy i bazy, natomiast status/cancel/finalize tylko bazy. Dodać testy statusu i anulowania bez klucza OpenAI, zachowując zamknięcie funkcji w preview.
  - Zaleta: Ścieżki odzyskiwania i bezpiecznego zatrzymania pozostają dostępne podczas awarii poświadczeń dostawcy.
  - Koszt: Wymaga rozdzielenia zależności od dostawcy w obecnym wspólnym guardzie i konstrukcji serwisu.
  - Pewność: WYSOKA — wskazane handlery nie wywołują dostawcy, a obecny guard zawsze sprawdza klucz.
  - Niewiadoma: Podczas refaktoru należy potwierdzić wszystkie pośrednie zależności finalizacji.
- **Decision**: FIXED — zależności są przypisane do operacji; create/batch wymagają OpenAI i Supabase, a finalize/status/cancel tylko Supabase.

### F3 — Błędy przed odczytem zapisują UUID importu, który nigdy nie powstał

- **Waga**: 🔎 OBSERWACJA
- **Wpływ**: 🏃 NISKI — oczywista i wąska poprawka
- **Wymiar**: Spójność ze wzorcami
- **Lokalizacja**: `src/lib/pdf-processing/client-import.ts:342`
- **Szczegóły**: Wspólny hook generuje i śledzi UUID przed lokalnym odczytem PDF. Jeśli odczyt nie powiedzie się z powodu rozmiaru, szyfrowania lub nieczytelnej treści, zdarzenie F-01 `finished` zawiera UUID, mimo że żądanie create nigdy nie zostało wysłane. Wcześniej panel ewaluacyjny zachowywał `id = null` do zakończenia odczytu, więc run record poprawnie wskazywał brak importu serwerowego. Obecnie widoczny panel może mieć `importId = null`, a pobrany run record zawierać UUID istniejący tylko po stronie klienta.
- **Naprawa**: Rozróżnić identyfikator korelacyjny klienta od ID importu serwerowego albo emitować `importId: null` do momentu wysłania create. Dodać test run record dla błędu przed create.
- **Decision**: FIXED — identyfikator importu jest emitowany dopiero po rozpoczęciu żądania create; błędy lokalnego odczytu zachowują `importId: null` i są pokryte testem.
