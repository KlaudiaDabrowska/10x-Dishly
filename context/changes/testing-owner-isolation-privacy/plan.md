# Izolacja właścicieli i prywatność — Implementation Plan

## Overview

Faza usuwa możliwość rozpoznania, czy identyfikator należy do innego
użytkownika, oraz zamyka wszystkie publiczne granice danych do jawnych allowlist.
Obejmuje testy i minimalne poprawki produkcyjne potrzebne do uzyskania zielonych
bramek na najtańszej warstwie dającej rzeczywisty sygnał.

## Current State Analysis

- Importy używają uprzywilejowanego klienta; bezpieczeństwo zależy od
  przekazania sesyjnego `ownerId` do każdego RPC.
- Globalny `pdf_imports.id` jest zarazem wewnętrznym PK i publicznym ID. Cudzy
  UUID daje `409 import-id-conflict`, a wolny UUID tworzy import.
- Status zwraca całe `record.outcome`, więc nowe pola bazy stają się publiczne.
- Auth renderuje surowe `error.message`, a logger PDF dopuszcza arbitralne
  `error.name` i `error.code`.
- Produkcyjny `dist/client` nie ma powtarzalnego skanu prywatności.

## Desired End State

Ten sam publiczny UUID może należeć do różnych użytkowników bez kolizji i
ujawnienia. Foreign i nonexistent dają tę samą odpowiedź oraz brak efektów
ubocznych. Publiczne błędy, logi, statusy i kody klienta mają zamknięte kontrakty,
a każdy PR uruchamia hermetyczne kontrakty, skan bundla oraz istniejący DB/HTTP
smoke. Prywatna treść właściciela pozostaje dozwolona w uwierzytelnionym UI z
`private, no-store`.

### Key Discoveries

- Create import ujawnia cudzy UUID przez globalny konflikt
  (`supabase/migrations/20261009120000_product_pdf_import.sql:83`).
- `service.status()` przekazuje pełny outcome
  (`src/lib/pdf-processing/service.ts:386`).
- Generyczny logger zapisuje wartości pochodzące z wyjątku
  (`src/lib/pdf-validation.ts:71`).
- Klient przyjmuje dowolny string błędu (`src/lib/pdf-processing/client-import.ts:100`).

## What We're NOT Doing

- Nie implementujemy edycji ani usuwania zapisanych przepisów; to rollout Phase 3.
- Nie dodajemy Playwrighta, nowego runnera e2e ani płatnych wywołań providera.
- Nie snapshotujemy wygenerowanego bundla.
- Nie publikujemy recipe IDs ani timestampów „na przyszłość”.

## Implementation Approach

Wprowadzić addytywną warstwę publicznego identyfikatora importu, zachowując
sygnatury RPC. Następnie zamknąć publiczne granice przez jawne serializery i
normalizatory. Testy DB dowodzą własności i braku mutacji, built-Worker smoke
dowodzi pełnej ścieżki HTTP, a hermetyczne kontrakty i skaner bundla chronią
prywatność na każdym PR.

## Critical Implementation Details

Nowa migracja musi zastąpić wszystkie aktywne RPC przyjmujące publiczny
`p_import_id`, nie tylko create/status. Publiczny ID jest najpierw rozwiązywany
wraz z `owner_id` do wewnętrznego PK; dopiero PK może być używany przez batch,
decisions, outcome i accounting.

Wewnętrzne `savedIds` i `existingIds` pozostają dostępne do serwerowego read-back.
Usunięcie następuje dopiero przy składaniu publicznej odpowiedzi.

## Phase 1: Owner-scoped identity

### Overview

Rozdzielić publiczny identyfikator klienta od globalnego klucza relacyjnego i
udowodnić kontrakt na realnej bazie.

### Changes Required

#### 1. Database identity and RPC contract

**Files:** nowa migracja `supabase/migrations/*_owner_scoped_pdf_import_ids.sql`
oraz `scripts/pdf-processing-db.test.mjs`.

**Intent:** Umożliwić różnym użytkownikom użycie tego samego UUID bez kolizji i
ujawnienia, zachowując recovery oraz idempotentny replay.

**Contract:** Dodać `client_import_id uuid`, wykonać backfill z `id`, ustawić
`NOT NULL` i `UNIQUE(owner_id, client_import_id)`. `pdf_imports.id` pozostaje
globalnym PK. Publiczne RPC zachowują sygnatury, rozwiązują `p_import_id` przez
`(owner_id, client_import_id)` i zwracają publiczny alias jako `import_id`.
Świeży lub zajęty wyłącznie przez innego ownera UUID daje niezależny `201`;
zgodny replay własny daje ten sam import; własny mismatch pozostaje 409. Zachować
`SECURITY DEFINER`, pusty `search_path` i granty.

### Success Criteria

#### Automated Verification

- Migracja wykonuje backfill i zachowuje obsługę istniejących publicznych identyfikatorów.
- Test DB rozróżnia wewnętrzne PK dwóch ownerów używających tego samego publicznego UUID.
- Test DB zalicza świeży create, zgodny replay, własny konflikt 409 oraz niezależny foreign UUID.
- `npm run test:pdf:db` przechodzi na czystym lokalnym Supabase.

---

## Phase 2: HTTP owner isolation

### Overview

Udowodnić pełną ścieżkę sesja → guard → owner-scoped RPC → bezpieczna odpowiedź.

### Changes Required

#### 1. Import API and built-Worker smoke

**Files:** istniejące trasy `/api/imports/**`, `scripts/smoke.mjs` i ich harness.

**Intent:** Zrównać foreign i nonexistent na granicy HTTP oraz dowieść braku
mutacji po odmowie.

**Contract:** Status oraz reprezentatywna mutacja decyzji dla foreign i
nonexistent zwracają dokładnie `404 {"error":"import-not-found"}` z
`Cache-Control: private, no-store`. Body i logi nie zawierają identyfikatorów,
tytułów, przyczyny odmowy ani sentinelów. Import, decyzje i recipes pozostają
niezmienione. Create z publicznym UUID innego ownera tworzy niezależny import.
Istniejący recipe smoke pozostaje jedynym testem HTTP odczytu przepisów.

### Success Criteria

#### Automated Verification

- `npm run smoke` zalicza exact foreign/nonexistent HTTP matrix.
- Smoke dowodzi braku mutacji po odmowie przez owner-scoped read-back.
- Smoke dowodzi niezależnego create dla wspólnego publicznego UUID.
- Istniejące testy izolacji odczytu przepisów nadal przechodzą.

---

## Phase 3: Privacy allowlists

### Overview

Zamknąć publiczne kontrakty auth, logów, statusu i kodów klienta oraz chronić je
adversarial sentinelami.

### Changes Required

#### 1. Auth errors

**Files:** trasy i strony sign-in/sign-up oraz współdzielony normalizator auth.

**Intent:** Usunąć wiadomości providera i attacker-controlled query z URL oraz UI.

**Contract:** Błąd providera przekierowuje wyłącznie z `?error=auth_failed`.
Sign-in pokazuje „Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.”,
a sign-up „Nie udało się utworzyć konta. Sprawdź dane i spróbuj ponownie.”.
Nieznane wartości `?error=` są ignorowane. Brak infrastruktury pozostaje
`503 {"error":"infrastructure_unavailable"}`.

#### 2. Logging and public error codes

**File:** `src/lib/pdf-validation.ts` oraz security-contract suite.

**Intent:** Zastąpić dane pochodzące z wyjątku stałą projekcją diagnostyczną.

**Contract:** Generyczny event ma exact keys `event`, `channel`, `route`,
`status`, `code`, `db_code`. `code` pochodzi z sanitizowanego mapowania, unknown
staje się `internal-error`, a `db_code` dopuszcza wyłącznie pięcioznakowy SQLSTATE
lub `null`. Nie logować name, arbitralnego code, message, cause ani provider body.

#### 3. Status and client normalization

**Files:** serwis/API importu, publiczne typy kontraktów i klient importu.

**Intent:** Składać nowe obiekty z allowlisty zamiast przekazywać outcome z bazy.

**Contract:** Status zwraca tylko `{ status, outcome, readBack }`, gdzie outcome
ma `saved`, `alreadySaved`, `pending` oraz dla produktu `kept`, `discarded` i
`decisions`. Publiczna decyzja ma wyłącznie `decisionId`, `sourceStart`, `state`,
`missingReasonCodes`. Finalize/cancel zachowują płaski odpowiednik wraz z
`readBack`; resolve zwraca `{ decision, outcome, readBack }`. Nie publikować
`importId`, expiry/batch metadata, `savedIds`, `existingIds`, `committedAt`,
`recipeId` ani `resolvedAt`. Nieznane pola ignorować, a wadliwe wymagane pola
kończyć sanitizowanym błędem odczytu. Nieznane kody klient normalizuje do
`unexpected-error` przed state, eventem lub run recordem. Product acceptance
weryfikuje zapis owner-scoped odczytem DB zamiast publicznym `savedIds`.

### Success Criteria

#### Automated Verification

- `npm run test:security` zalicza planted sentinels w auth, logach, statusie i kodach klienta.
- Exact-key assertions odrzucają każde dodatkowe pole statusu i decyzji.
- `npm run test:pdf` przechodzi po dostosowaniu recovery i product acceptance.
- `npm run lint` oraz `npx --no-install astro check` przechodzą.

#### Manual Verification

- Sign-in i sign-up pokazują ustalone copy dla `auth_failed`, a nieznane query nie tworzy banera.

---

## Phase 4: Bundle and CI gate

### Overview

Dodać testowany skaner publicznych assetów i uruchamiać każdą warstwę w
najtańszym istniejącym jobie CI.

### Changes Required

#### 1. Client privacy scanner

**Files:** nowy skaner/test w `scripts/`, `package.json` i config deploy/build.

**Intent:** Skanować dokładnie katalog wdrażany jako publiczne assets i dowieść,
że skaner wykrywa wyciek.

**Contract:** Wymagać `assets.directory === "../client"`. Skanować rekurencyjnie
wszystkie bytes w `dist/client`, odrzucać sztuczne secret canaries i nazwy
prywatnych zmiennych. Test skanera sadzi w katalogu tymczasowym sentinele
secret/PDF/private payload. Błąd podaje kategorię i ścieżkę, nigdy wartość.

#### 2. CI placement

**File:** `.github/workflows/ci.yml`.

**Intent:** Uruchamiać security contract i static scan na każdym PR bez nowego
joba ani płatnego providera.

**Contract:** `test:security` działa w `validate`; po produkcyjnym buildzie działa
`check:client-privacy`; realne DB i HTTP pozostają w `smoke`. Hermetyczny test
outputu smoke sadzi prywatny sentinel i wymaga braku w stdout/stderr.

### Success Criteria

#### Automated Verification

- Test skanera zalicza czysty fixture i odrzuca każdy typ zasianego sentinela.
- `npm run build && npm run check:client-privacy` przechodzi dla produkcyjnego `dist/client`.
- Lokalny odpowiednik jobów `validate` i `smoke` przechodzi.
- CI uruchamia kontrakty, skan bundla i owner smoke na każdym PR.

#### Manual Verification

- Pierwszy PR run pokazuje osobne, czytelne wyniki security contract, client privacy i owner smoke bez wypisywania sentinelów.

---

## Phase 5: Cookbook and closeout

### Overview

Utrwalić działające wzorce w planie testów i zamknąć rollout dopiero po przejściu
wszystkich bramek.

### Changes Required

#### 1. Test plan documentation

**File:** `context/foundation/test-plan.md`.

**Intent:** Zastąpić placeholder §6.2 działającą procedurą fazy 2.

**Contract:** Opisać hermetyczne allowlisty, real DB, built-Worker smoke i static
client gate oraz komendy `test:security`, `test:pdf:db`, `smoke` i
`check:client-privacy`. Wyjaśnić wyjątek owner-authorized UI i pozostawić future
recipe edit/delete w rollout Phase 3. Ustawić Phase 2 na `complete` dopiero po
zaliczeniu całego planu.

### Success Criteria

#### Automated Verification

- Wszystkie komendy faz 1–4 przechodzą w jednym końcowym przebiegu.
- Plan testów zawiera kompletne §6.2 i poprawny status Phase 2.
- `git diff --check` nie zgłasza błędów.

## Testing Strategy

### Unit Tests

- Exact body/key allowlists, auth normalization, logger, status serializer,
  client error codes i skaner z planted sentinelami.

### Integration Tests

- Real DB: migracja, replay, owner namespace, aktywne RPC i brak mutacji.
- Built Worker: foreign/nonexistent equivalence przez realną sesję.

### Manual Testing Steps

1. Sprawdzić ustalone copy auth i brak banera dla unknown query.
2. Sprawdzić czytelność wyników pierwszego CI run bez ujawnienia sentinelów.

## Performance Considerations

Skan jest liniowy względem rozmiaru `dist/client`. Nie dodawać przeglądarki,
snapshotów ani płatnego providera; wykorzystać istniejące build i smoke joby.

## Migration Notes

Migracja jest addytywna: backfill zachowuje stare publiczne identyfikatory.
Sygnatury RPC pozostają bez zmian, więc poprzednia wersja aplikacji może korzystać
z nowych funkcji podczas rollbacku aplikacji. Nie edytować historycznych migracji
i nie usuwać starego PK.

## References

- Related research: `context/changes/testing-owner-isolation-privacy/research.md`
- Current conflict: `supabase/migrations/20261009120000_product_pdf_import.sql:83`
- Raw status: `src/lib/pdf-processing/service.ts:386`
- Generic logger: `src/lib/pdf-validation.ts:71`
- Client error boundary: `src/lib/pdf-processing/client-import.ts:100`
- CI gates: `.github/workflows/ci.yml:27`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Owner-scoped identity

#### Automated

- [x] 1.1 Migracja wykonuje backfill i zachowuje obsługę istniejących publicznych identyfikatorów. — 8eda3cf
- [x] 1.2 Test DB rozróżnia wewnętrzne PK dwóch ownerów używających tego samego publicznego UUID. — 8eda3cf
- [x] 1.3 Test DB zalicza świeży create, zgodny replay, własny konflikt 409 oraz niezależny foreign UUID. — 8eda3cf
- [x] 1.4 `npm run test:pdf:db` przechodzi na czystym lokalnym Supabase. — 8eda3cf

### Phase 2: HTTP owner isolation

#### Automated

- [x] 2.1 `npm run smoke` zalicza exact foreign/nonexistent HTTP matrix. — 1d28eb0
- [x] 2.2 Smoke dowodzi braku mutacji po odmowie przez owner-scoped read-back. — 1d28eb0
- [x] 2.3 Smoke dowodzi niezależnego create dla wspólnego publicznego UUID. — 1d28eb0
- [x] 2.4 Istniejące testy izolacji odczytu przepisów nadal przechodzą. — 1d28eb0

### Phase 3: Privacy allowlists

#### Automated

- [x] 3.1 `npm run test:security` zalicza planted sentinels w auth, logach, statusie i kodach klienta. — 6e46bc4
- [x] 3.2 Exact-key assertions odrzucają każde dodatkowe pole statusu i decyzji. — 6e46bc4
- [x] 3.3 `npm run test:pdf` przechodzi po dostosowaniu recovery i product acceptance. — 6e46bc4
- [x] 3.4 `npm run lint` oraz `npx --no-install astro check` przechodzą. — 6e46bc4

#### Manual

- [x] 3.5 Sign-in i sign-up pokazują ustalone copy dla `auth_failed`, a nieznane query nie tworzy banera. — 6e46bc4

### Phase 4: Bundle and CI gate

#### Automated

- [x] 4.1 Test skanera zalicza czysty fixture i odrzuca każdy typ zasianego sentinela.
- [x] 4.2 `npm run build && npm run check:client-privacy` przechodzi dla produkcyjnego `dist/client`.
- [x] 4.3 Lokalny odpowiednik jobów `validate` i `smoke` przechodzi.
- [x] 4.4 CI uruchamia kontrakty, skan bundla i owner smoke na każdym PR.

#### Manual

- [ ] 4.5 Pierwszy PR run pokazuje osobne, czytelne wyniki security contract, client privacy i owner smoke bez wypisywania sentinelów.

### Phase 5: Cookbook and closeout

#### Automated

- [ ] 5.1 Wszystkie komendy faz 1–4 przechodzą w jednym końcowym przebiegu.
- [ ] 5.2 Plan testów zawiera kompletne §6.2 i poprawny status Phase 2.
- [ ] 5.3 `git diff --check` nie zgłasza błędów.
