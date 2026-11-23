# Izolacja właścicieli i prywatność — Plan Brief

> Full plan: `context/changes/testing-owner-isolation-privacy/plan.md`
> Research: `context/changes/testing-owner-isolation-privacy/research.md`

## What & Why

Usunąć możliwość rozpoznania, czy identyfikator należy do innego użytkownika,
oraz zamknąć wszystkie publiczne granice danych do jawnych allowlist. Faza
obejmuje testy oraz minimalne poprawki produkcyjne potrzebne do ich zaliczenia.

## Starting Point

Importy są owner-scoped, ale globalny `importId` ujawnia istnienie cudzego UUID.
Auth, logger PDF i status importu mają również potwierdzone drogi ujawnienia
niekontrolowanych danych, a produkcyjny bundle nie ma powtarzalnego skanu.

## Desired End State

Foreign i nonexistent są nierozróżnialne i nie powodują mutacji. Publiczne
błędy, logi, statusy i bundle mają zamknięte kontrakty, a ich najtańsze bramki
działają na każdym PR.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Identyfikator importu | Publiczny `client_import_id` per owner i osobny globalny PK | Ukrywa cudzy UUID bez łamania recovery | Research + Plan |
| Status importu | Minimalna allowlista bez recipe IDs i timestampów | Frontend ich nie konsumuje | Research + Plan |
| Auth | `auth_failed`, `infrastructure_unavailable`; unknown query ignorowane | Provider i attacker text nie trafiają do UI | Research + Plan |
| CI | Kontrakty i skan bundla na każdym PR; DB/HTTP w smoke | Najtańsza warstwa z realnym sygnałem | Plan |

## Scope

**In scope:** istniejące odczyty przepisów, operacje importu/decyzji, auth,
logi PDF, statusy, kody klienta, `dist/client` i CI.

**Out of scope:** przyszłe recipe edit/delete, Playwright, płatny provider,
snapshoty bundla i publikowanie nieużywanych pól na przyszłość.

## Architecture / Approach

Addytywna migracja rozdzieli publiczny owner-scoped identyfikator od
wewnętrznego PK. Jawne serializery i normalizatory zamkną granice HTTP/log/UI,
a DB integration, built-Worker smoke i static client scan udowodnią je na
właściwych warstwach.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Owner-scoped identity | Migracja i kontrakty DB | Pominięte RPC lub zerwana zgodność |
| 2. HTTP owner isolation | Nierozróżnialne odmowy i brak mutacji | IDOR na pełnej ścieżce |
| 3. Privacy allowlists | Auth, logi, status i klient | Prywatny payload na granicy |
| 4. Bundle and CI gate | Skan `dist/client` i obowiązkowe bramki | Pozornie zielony skaner |
| 5. Cookbook and closeout | Utrwalona procedura fazy 2 | Drift dokumentacji |

**Prerequisites:** Node 24, zależności repozytorium i lokalny Supabase dla DB/smoke.
**Estimated effort:** 4–6 sesji implementacyjnych.

## Open Risks & Assumptions

- Wszystkie aktywne RPC muszą tłumaczyć publiczny ID na wewnętrzny PK.
- Wewnętrzne ID pozostają potrzebne serwerowi do read-back, lecz nie są publiczne.
- Poprzednia aplikacja pozostaje zgodna dzięki zachowaniu sygnatur RPC.

## Success Criteria (Summary)

- Wspólny publiczny UUID różnych ownerów nie koliduje ani niczego nie ujawnia.
- Sentinele nie trafiają do błędów, logów, statusów, UI ani `dist/client`.
- Kontrakty, DB integration i HTTP smoke blokują regresję na każdym PR.
