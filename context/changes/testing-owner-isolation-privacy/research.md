---
date: 2026-11-23T12:59:25+01:00
researcher: Codex
git_commit: dc0c069419927f704f4b0d5d478b0cc6f392e80e
branch: plan/testing-owner-isolation-privacy
repository: 10xdevs
topic: "Izolacja właścicieli i prywatność — ryzyka #3 i #4"
tags: [research, security, owner-isolation, privacy, idor]
status: complete
last_updated: 2026-11-23
last_updated_by: Codex
---

# Research: Izolacja właścicieli i prywatność

**Date**: 2026-11-23T12:59:25+01:00
**Researcher**: Codex
**Git Commit**: dc0c069419927f704f4b0d5d478b0cc6f392e80e
**Branch**: plan/testing-owner-isolation-privacy
**Repository**: 10xdevs

## Research Question

Ugruntować rollout Phase 2 z `context/foundation/test-plan.md`: sprawdzić, czy
cudze i nieistniejące identyfikatory są nierozróżnialne na istniejących
powierzchniach odczytu i mutacji (#3), czy logi, błędy, statusy oraz statyczne
bundle nie ujawniają treści PDF, sekretów ani prywatnych payloadów (#4), a
następnie wskazać najtańsze warstwy testów dające rzeczywisty sygnał.

## Summary

W zbadanej ścieżce importów własność jest egzekwowana przez sesyjny `user.id`
przekazywany jako `ownerId` do uprzywilejowanego klienta RPC, a następnie ponownie
sprawdzany w owner-scoped odczytach i mutacjach. Odczyt zapisanych przepisów używa
cookie-bound klienta i RLS. Realne testy DB oraz istniejący smoke dobrze chronią
część tych granic, ale nie ma HTTP-owej macierzy own/foreign/nonexistent dla
zaimplementowanych endpointów importu ani systematycznego dowodu braku mutacji po
odmowie (`src/lib/pdf-validation.ts:117-155`,
`src/lib/pdf-processing/persistence.ts:99-115`,
`scripts/pdf-processing-db.test.mjs:701-965`, `scripts/smoke.mjs:287-309`).

Kontrakt „cudzy i nieistniejący identyfikator niczego nie ujawniają” ma jeden
potwierdzony wyjątek: istniejący cudzy `importId` podczas create daje publiczne
`import-id-conflict` 409, podczas gdy wolny UUID może zostać utworzony. Plan nie
powinien kopiować tego zachowania do oracle; musi najpierw wybrać nieujawniający
kontrakt i objąć go regresją (`supabase/migrations/20261009120000_product_pdf_import.sql:83-95`,
`src/lib/pdf-processing/persistence.ts:78-97`, `src/lib/pdf-import-access.ts:62-80`).

Dla prywatności potwierdzono dwie bezpośrednie luki. Sign-in i sign-up umieszczają
surowe `error.message` providera auth w URL i renderują je w uwodnionym UI.
Generyczny logger PDF deklaruje allowlistę, lecz zapisuje dowolne `error.name` i
`error.code`. Dodatkowo status przekazuje `record.outcome` bez jawnego serializera,
a klient akceptuje każdy string błędu; istniejące testy nie zamykają tych granic
exact allowlistą (`src/pages/api/auth/signin.ts:9-17`,
`src/pages/api/auth/signup.ts:9-17`, `src/components/auth/ServerError.tsx:7-14`,
`src/lib/pdf-validation.ts:71-108`, `src/lib/pdf-processing/service.ts:386-404`,
`src/lib/pdf-processing/client-import.ts:100-125,668-680`).

Najtańszy wiarygodny zestaw to: hermetyczne kontrakty exact-body/exact-log-key,
realna integracja DB dla RLS i braku mutacji, wąski built-Worker smoke dla
nierozróżnialności odpowiedzi HTTP oraz deterministyczny skan produkcyjnego
`dist/client`. Playwright, snapshoty UI, nowy worker test i płatny provider nie
dodają potrzebnego sygnału dla tych ryzyk.

## Detailed Findings

### 1. Oracle i granice zakresu

- PRD wymaga, by użytkownik widział i modyfikował wyłącznie swoje przepisy, by
  kolekcje pozostawały prywatne, credentials były server-only, a logi nie
  zawierały surowego tekstu źródłowego ani pełnych odpowiedzi modelu
  (`context/foundation/prd.md:44-47,87-108,135-148,163-177`).
- Zakaz prywatnej treści we frontendzie nie może być absolutny: uwierzytelniony
  właściciel celowo widzi kandydatów importu, składniki i instrukcje
  (`src/components/pdf-processing/RecipeImportPanel.tsx:30-74,156-230`).
  Właściwy oracle zabrania treści w logach, publicznych/statycznych bundlach,
  błędach i statusach operacyjnych oraz w odpowiedziach dla nieuprawnionego
  użytkownika; dopuszcza owner-authorized content w prywatnym UI z `no-store`.
- S-06 i S-07 są w roadmapie nadal `proposed`, a w zbadanym drzewie tras nie ma
  endpointów edit/delete zapisanych przepisów (`context/foundation/roadmap.md:186-212`,
  `src/pages/dashboard/recipes/[id].astro:1-50`). Phase 2 może dowieść ochrony
  istniejących odczytów i mutacji importu/decyzji. Testy przyszłego recipe
  edit/delete należą do Phase 3, gdy te powierzchnie powstaną.

### 2. Owner isolation — rzeczywista architektura

- Guard API rozdziela uwierzytelnienie od własności: brak sesji daje 401,
  niepoprawny UUID ogólne 404, a zweryfikowany `user.id` trafia do usługi jako
  `ownerId` (`src/lib/pdf-validation.ts:117-155`).
- Uprzywilejowany klient importów omija RLS, dlatego granicą bezpieczeństwa jest
  owner ID dołączany do każdego RPC (`src/lib/pdf-processing/persistence.ts:99-115`).
  `get_pdf_import` filtruje po `id`, `owner_id` i kanale, a brak cudzego lub
  nieistniejącego rekordu staje się tym samym `import-not-found`
  (`supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:316-389`,
  `src/lib/pdf-processing/service.ts:105-108`).
- Status, batch, finalize, cancel i resolve najpierw odczytują owner-scoped import;
  mutujące RPC finalizacji i decyzji ponownie sprawdzają ownera
  (`src/lib/pdf-processing/service.ts:143-148,234-240,338-395`,
  `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:447-450,613-620`).
- Dla zapisanych przepisów rola przeglądarkowa ma grant wyłącznie `SELECT`, a
  polityka RLS wymaga `auth.uid() = owner_id`
  (`supabase/migrations/20261008120000_pdf_processing.sql:224-243`). Cookie-bound
  odczyt szczegółu oraz wspólna translacja `not-found` ukrywają cudzy i
  nieistniejący rekord (`src/lib/recipes/supabase-read.ts:5-20`,
  `src/lib/recipes/read.ts:270-276`, `src/pages/dashboard/recipes/[id].astro:12-50`).
- UI nie jest granicą autoryzacji. Klient wysyła ID do `/api/imports/**`, a
  dashboard ufa dopiero owner-scoped odpowiedzi statusu
  (`src/lib/pdf-processing/client-import.ts:100-124,585-600`,
  `src/lib/pdf-processing/dashboard-import.ts:30-53`).

### 3. Owner isolation — istniejący sygnał i luka

- Realna baza blokuje browser-role RPC i bezpośrednie mutacje `recipes`, ukrywa
  cudzą listę/szczegół oraz odrzuca cudzą finalizację, status i decyzję
  (`scripts/pdf-processing-db.test.mjs:701-801,821-900,910-965`).
- Built-Worker smoke używa dwóch cookie jarów i wymaga wspólnego 404 dla cudzego,
  nieistniejącego i błędnego recipe ID bez ujawnienia ID, tytułu lub przyczyny
  (`scripts/smoke.mjs:85-117,191-205,287-309`).
- Brakuje odpowiednika smoke dla `/api/imports/**`. Zbadany zestaw nie porównuje
  HTTP status/body dla foreign i nonexistent w reprezentatywnym statusie oraz
  mutacji ani nie dowodzi po odmowie niezmienności importu, decisions i recipes.
- Create import rozróżnia cudzy istniejący UUID: SQL rzuca `import id conflict`,
  persistence mapuje go do `import-id-conflict`, a API do 409
  (`supabase/migrations/20261009120000_product_pdf_import.sql:83-95`,
  `src/lib/pdf-processing/persistence.ts:78-97`, `src/lib/pdf-import-access.ts:62-80`).
  Obecny DB test utrwala tę różnicę
  (`scripts/pdf-processing-db.test.mjs:1268-1287`), więc poprawka wymaga zmiany
  oracle, a nie dopisania testu lustrzanego.

### 4. Prywatność — konkretne drogi wycieku

- Auth routes przekazują surowe `error.message` providera w query stringu;
  strony odczytują dowolne `?error=` i `ServerError` renderuje je dosłownie
  (`src/pages/api/auth/signin.ts:9-17`, `src/pages/api/auth/signup.ts:9-17`,
  `src/pages/auth/signin.astro:5-14`, `src/pages/auth/signup.astro:5-14`,
  `src/components/auth/ServerError.tsx:7-14`). Obecny smoke sprawdza tylko
  niepusty parametr błędu, więc nie chroni stałego publicznego kodu
  (`scripts/smoke.mjs:140-150`).
- Publiczne błędy PDF są mapowane do stabilnych kodów, lecz generyczny `logFailure`
  loguje dowolne `error.name` i `error.code`. Wstrzyknięty custom error może zatem
  przenieść prywatny sentinel do logu przy bezpiecznym body `internal-error`
  (`src/lib/pdf-validation.ts:71-108`). Specjalny accounting event ma exact
  allowlistę i test, ale generyczny logger nie ma analogicznego adversarial contract
  (`scripts/pdf-product-http.test.mjs:11-68`).
- Status zwraca `record.outcome` wprost. Dzisiejszy SQL outcome zawiera metadane,
  ale przyszłe pole RPC automatycznie dotarłoby do klienta. Istniejący test
  zabrania jedynie sentinela `ingredientGroups`, zamiast wymagać exact kluczy
  (`src/lib/pdf-processing/service.ts:386-404`,
  `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:367-386`,
  `scripts/pdf-processing.test.mjs:1324-1326`). Jawny `terminalOutcome` pokazuje
  istniejący wzorzec serializacji (`src/lib/pdf-processing/service.ts:76-95`).
- `requestImportJson` przyjmuje dowolny string z `body.error`, a catch zapisuje
  dowolne `.code` do stanu i eventów. Produktowy UI mapuje nieznane kody do stałego
  tekstu, lecz restricted evaluator wyświetla raw code i zapisuje go w kopiowalnym
  run recordzie (`src/lib/pdf-processing/client-import.ts:100-125,497-515,668-680`,
  `src/components/pdf-processing/PdfValidationPanel.tsx:127-140,300-315`).

### 5. Prywatność — istniejące zabezpieczenia i brakujące gate'y

- Provider error tests sadzą prywatne body i tokeny oraz wymagają sanitizowanych
  wyjątków; failure record product acceptance usuwa prywatne pola
  (`scripts/pdf-processing.test.mjs:228-265,437-452,513-619`,
  `scripts/pdf-product-acceptance.test.mjs:282-347`).
- Deployment probe ma sześciopolowy event i testy exact-key, które odrzucają
  token, object key, PDF body oraz sentinele błędów providera/storage/queue
  (`src/lib/deployment-probe.ts:27-46,138-154`,
  `scripts/deployment-probe.test.mjs:90-110,205-305`). Zbadany worker nie dodaje
  osobnej granicy logowania (`workers/pdf-consumer/index.ts:1-6`).
- Główny smoke drukuje stałą nazwę kroku i stały komunikat zamiast response body
  lub wyjątku, ale nie ma bezpośredniego testu z planted sentinel
  (`scripts/smoke.mjs:358-380`). CI zapisuje logi preview/Supabase/smoke, lecz ich
  nie skanuje (`.github/workflows/ci.yml:41-46,60-81`).
- Astro deklaruje badane env jako server/secret, a deployment tests blokują
  przeniesienie credentials do preview/plain vars (`astro.config.mjs:18-51`,
  `scripts/deploy-config.test.mjs:82-100`). Nie istnieje powtarzalny skan
  produkcyjnego `dist/client` dla planted secret/PDF/private-payload canaries;
  obecny UI preview scanner obejmuje wyłącznie własny preview graph
  (`scripts/ui-preview.mjs:182-204`).

### 6. Najtańsza strategia testowa

| Warstwa | Sygnał | Zakres |
| --- | --- | --- |
| Hermetyczny security contract | Exact public body, exact log keys, auth code mapping, status allowlist i normalizacja client error code | Rozszerzyć istniejące `node:test`; sadzić prywatne sentinele w message/name/code/cause/body |
| Real DB integration | RLS, security-definer RPC i brak mutacji po odmowie | Own/foreign/nonexistent dla istniejących import status/finalize/cancel/decision; bez mockowania DB |
| Wąski built-Worker smoke | Sesja → guard → uprzywilejowany klient → wspólna odpowiedź HTTP | Reprezentatywny odczyt i mutacja importu, dwa cookie jary, exact status/body i brak sentineli w logu |
| Post-build static gate | Sekrety i prywatne canaries nie trafiają do publicznych assetów | Skan `dist/client` po buildzie; bez snapshotu bundle i bez prawdziwych sekretów w fixture |

Istniejące komendy odpowiadają tym warstwom: `npm run test:pdf`,
`npm run test:pdf:db`, `npm run smoke`, `npm run smoke:pdf-product` i
`npm run build` (`package.json:23-31`, `.github/workflows/ci.yml:27-40,60-81`).
Nie ma podstaw do dodania Playwrighta, płatnego wywołania providera ani kolejnej
warstwy worker test dla uzgodnionych ryzyk.

## Corrections to Test Plan Guidance

- Risk #3 powinno w tej fazie oznaczać owner isolation dla istniejących odczytów
  przepisów i mutacji importu/decyzji. Przyszłe recipe edit/delete pozostają w
  rollout Phase 3 i S-06/S-07.
- Risk #4 powinno zabraniać prywatnej treści w logach, publicznych/statycznych
  bundlach, błędach, statusach operacyjnych i odpowiedziach nieuprawnionych.
  Owner-authorized recipe content w prywatnym UI nie jest wyciekiem.
- Hipoteza „foreign i nonexistent są już nierozróżnialne” jest fałszywa dla create
  import. Plan musi naprawić lub jawnie rozstrzygnąć `import-id-conflict`, zanim
  test zapisze oczekiwany kontrakt.

## Code References

- `src/lib/pdf-validation.ts:71-155` — logging, error response, sesja i guard API.
- `src/lib/pdf-processing/persistence.ts:78-115` — mapowanie RPC i owner ID.
- `src/lib/pdf-processing/service.ts:76-108,338-404` — owner-scoped odczyt, decyzje i status.
- `src/lib/pdf-processing/client-import.ts:100-125,497-515,668-680` — klient błędów i bezpieczny product copy.
- `supabase/migrations/20261009120000_product_pdf_import.sql:83-95` — rozróżniający create conflict.
- `supabase/migrations/20261014120000_incomplete_recipe_decisions.sql:316-389,447-450,613-620` — owner-scoped RPC.
- `supabase/migrations/20261008120000_pdf_processing.sql:224-243` — grant SELECT i RLS recipes.
- `scripts/pdf-processing-db.test.mjs:701-965,1268-1287` — obecny sygnał DB i konflikt create.
- `scripts/smoke.mjs:85-117,140-150,191-205,287-309,358-380` — sesje, recipe isolation, auth error i output.
- `scripts/pdf-product-http.test.mjs:11-68,118-129` — allowlista diagnostyki i prywatność CLI.

## Architecture Insights

Projekt ma dwie różne granice danych. Odczyty przepisów opierają się na
cookie-bound Supabase i RLS, natomiast importy używają backendowego klienta i muszą
wiązać każdą operację z owner ID pochodzącym z sesji. Dlatego test UI ani mock RPC
nie zastępuje realnej integracji DB dla IDOR.

Prywatność jest kontraktem allowlisty, nie wyszukiwaniem jednego znanego sekretu.
Publiczne body, event logu, status i client error code powinny mieć jawne klucze i
wartości; bundle gate powinien używać unikalnych planted canaries, nie prawdziwych
sekretów ani snapshotów wygenerowanego kodu.

## Historical Context (from prior changes)

- **Supported, narrow scope:** S-01 udowodnił izolację sesji/cache przez built
  Worker i realny Supabase, ale jawnie nie rościł sobie pokrycia recipe-row privacy
  (`context/archive/2026-09-26-private-recipe-collection/plan.md:31-42,179-189`).
- **Supported:** S-04 ustanowił wspólne 404 dla foreign/nonexistent/malformed recipe
  ID oraz dodał real-DB i built-Worker checks
  (`context/archive/2026-10-14-browse-and-read-recipes/plan.md:28-45,183-223`).
- **Supported as historical manual evidence:** F-01 zanotował brak uploadu PDF i
  credentials w przeglądarce oraz brak aplikacyjnych logów w obserwowanym tailu,
  lecz nie jest to powtarzalny gate obecnego buildu
  (`context/archive/2026-09-28-validate-pdf-processing/evaluation.md:543-580`).
- **Still future:** roadmap S-06/S-07 opisuje foreign modification/deletion jako
  proponowane slice'y, więc ich testy nie mogą być kryterium obecnej implementacji
  (`context/foundation/roadmap.md:186-212`).

## Related Research

- `context/changes/testing-critical-import-correctness-recovery/research.md` —
  granice recovery, persystencji produktu i owner-scoped read-back.
- `context/changes/diagnose-token-accounting-mismatch/research.md` — allowlistowany
  public/private diagnostic contract i fail-closed ledger.

## Open Questions

1. Jaki nieujawniający kod/status ma zastąpić publiczne `import-id-conflict` dla
   cudzego UUID, zachowując idempotentny replay własnego zgodnego importu?
2. Jaki zamknięty zestaw publicznych kodów auth ma zastąpić provider
   `error.message` dla sign-in, sign-up i braku konfiguracji?
3. Które dokładne pola obecnego `record.outcome` są publicznym kontraktem statusu?
   Research potwierdza potrzebę serializera, ale wybór shape powinien wynikać z
   istniejących konsumentów w planie.
4. Jak wstrzyknąć build-time canaries do testowego buildu bez umieszczania
   prawdziwego sekretu w źródle? Plan powinien zachować deterministyczny skan i
   brak sekretów w logach narzędzia.
