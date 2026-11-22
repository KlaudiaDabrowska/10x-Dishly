# Frame Brief: PDF token accounting mismatch

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Podczas płatnego product acceptance wspólny adapter OpenAI zakończył pierwszy
batch kodem `input-token-accounting-mismatch`: wynik wcześniejszego wywołania
`/responses/input_tokens` nie był równy `usage.input_tokens` z zakończonej
odpowiedzi `/responses`. Import został przerwany, niczego nie zapisano jako
zaakceptowany wynik, a rezerwacja kosztu pozostała fail-closed.

## Initial Framing (preserved)

- **User's stated cause or approach**: kontrakt rozliczania tokenów może wymagać
  diagnostyki i przeplanowania przed kolejną płatną próbą.
- **User's proposed direction**: rozpocząć osobną diagnostykę i przygotować nowy
  plan, bez ponawiania live gate w ciemno.
- **Pre-dispatch narrowing**: zbadać bieżący incydent oraz cały wspólny mechanizm
  liczenia tokenów w imporcie PDF; użytkownik nie wie, czy ten kod błędu pojawił
  się wcześniej.

## Dimension Map

Obserwacja mogła pochodzić z następujących wymiarów:

1. **Rozmiar fixture** — materiał mógł przekroczyć limit wejścia lub batching.
2. **Różna treść żądań** — licznik i generowanie mogły dostać inny token-bearing
   payload.
3. **Semantyka provider/model** — dwa endpointy mogły rozliczyć ten sam payload
   inaczej w pojedynczym wywołaniu.
4. **Nowy product runner** — acceptance mógł wprowadzić inną ścieżkę adaptera.
5. **Brak dowodu diagnostycznego** — obecny fail-closed kod zachował kod błędu,
   lecz nie zachował dwóch niesensytywnych wartości potrzebnych do rozróżnienia
   powyższych hipotez.

## Hypothesis Investigation

| Hipoteza | Dowód | Werdykt |
| --- | --- | --- |
| Fixture były za duże | `summer`: 16 stron i 16,6 MB; `lunchboxy`: 12 stron i 7,0 MB. Limity to 115 stron, 20 MB i 98 304 tokeny; oba fixture przeszły preflight i zostały podzielone po dwa batche. | NONE |
| Count i generation dostały inny materiał | Oba żądania powstają z tego samego `PdfTextBatch` przez `requestBody()`; count wybiera z niego wszystkie token-bearing fields (`openai.ts:96-120`). Bezpośrednio przed dispatch adapter ponownie liczy i buduje request z niezmienionego batcha (`openai.ts:351-379`). | WEAK |
| Różnica pól żądań wyjaśnia mismatch | Count pomija wyłącznie `store`, `background` i `max_output_tokens`, których count API nie przyjmuje jako token-bearing input. Test kontraktu utrwala ten subset. | WEAK |
| Nowy product runner wprowadził problem | Runner używa `/api/imports`, które prowadzi do tego samego `createValidationService` i `recognizePdfBatch`; historyczny extraction review używa tego samego adaptera (`pdf-product-acceptance.mjs:418-430`, `pdf-extract-review.mjs:250-280`). | NONE |
| Provider/model zwrócił niespójne liczniki | Błąd powstaje dopiero po kompletnej odpowiedzi providera podczas ścisłego porównania (`openai.ts:309-320`). Oficjalna dokumentacja opisuje count jako dokładną liczbę wejścia, więc różnicy nie można uznać za dozwoloną bez dalszego dowodu. | PARTIAL |
| Brakuje minimalnego dowodu do ustalenia przyczyny | Zachowano tylko stabilny kod błędu. Nie zachowano count value, usage value, ich delty ani zwróconego snapshotu modelu/response ID. Bez tych danych nie da się odróżnić incydentu providera od nieujawnionej różnicy kontraktu. | STRONG |

## Narrowing Signals

- Oba fixture są poniżej limitów pliku, stron i batchingu; zwykłe przekroczenie
  rozmiaru jest wykluczone.
- Bezkosztowy pierwszy live attempt zakończył się przed providerem na lokalnym
  `503`; drugi dotarł do providera i zatrzymał się dokładnie na porównaniu
  liczników.
- Użytkownik nie pamięta wcześniejszego wystąpienia; historia repo również nie
  zawiera wcześniejszego zapisu tego kodu.
- W lokalnym ledgerze pozostała jedna fail-closed rezerwacja `147456000`
  nano-USD w stanie `dispatch-claimed`, zgodnie z zasadą niezwalniania
  niepotwierdzonego kosztu.

## Cross-System Convention

Oficjalny przewodnik OpenAI przedstawia `/responses/input_tokens` jako sposób
uzyskania dokładnej liczby tokenów, które model otrzyma, a Responses API raportuje
końcowe `usage.input_tokens`. Nie znaleziono udokumentowanego wyjątku pozwalającego
traktować różnicę jako normalną tolerancję. W projekcie wcześniejsze płatne serie
na tym samym adapterze, modelu i konfiguracji przeszły oraz zostały rozliczone:
runy `e4e7a786`, `e6e3150c` i `066f4d67` (`evaluation.md:397-420`).

Pressure-test nie potwierdził ani zmiany payloadu w aplikacji, ani regresji
wprowadzonej przez product runner. Potwierdził natomiast, że historyczny sukces
nie wystarcza do wyjaśnienia pojedynczego bieżącego mismatchu bez zachowania
wartości liczbowych.

## Reframed Problem Statement

> **The actual problem to plan around is**: fail-closed accounting prawidłowo
> zatrzymuje niespójny wynik, ale obecny evidence contract nie zachowuje
> minimalnych, niesensytywnych metadanych potrzebnych do ustalenia, dlaczego dwa
> oficjalnie równoważne pomiary tokenów się rozeszły.

Nie ma obecnie podstaw do poluzowania kontroli równości ani do uznania mismatchu
za tolerowany. Plan powinien najpierw umożliwić bezpieczne rozróżnienie: provider
incident, model-alias/snapshot drift albo rzeczywista różnica request contract.
Dopiero taki dowód może uzasadnić zmianę kontraktu i kolejną płatną próbę.

## Confidence

- **MEDIUM** — dowody z kodu i historii mocno wykluczają rozmiar fixture oraz
  product-runner regression, a dokumentacja wspiera ścisły kontrakt. Root cause
  pozostaje jednak nierozstrzygnięty, ponieważ incydent nie zachował dwóch liczb
  ani tożsamości odpowiedzi potrzebnych do weryfikacji.

Wymagany następny krok dowodowy: research ma ustalić najmniejszy prywatny format
evidence, zasady redakcji oraz bezpłatne testy kontraktowe, które pozwolą
zarejestrować count, usage, deltę i model identity bez treści PDF, promptu lub
response body.

## What Changes for /10x-plan

Plan nie powinien zaczynać się od tolerancji, retry ani zmiany budżetu. Powinien
zacząć się od dowodu diagnostycznego i zachowania fail-closed, a decyzję o
kontrakcie odroczyć do czasu jednoznacznego researchu.

## References

- Source: `src/lib/pdf-processing/openai.ts:96-120,215-245,309-320,351-379`
- Product path: `scripts/pdf-product-acceptance.mjs:418-430`
- Historical path: `scripts/pdf-extract-review.mjs:250-280`
- Historical passing evidence:
  `context/archive/2026-09-28-validate-pdf-processing/evaluation.md:397-420,514-524`
- Origin commit: `50c2122`
- Official docs:
  <https://developers.openai.com/api/docs/guides/token-counting>
- Official count reference:
  <https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count>
- Investigation tasks: `frame_request_equivalence`, `frame_history_paths`,
  `frame_provider_semantics`
