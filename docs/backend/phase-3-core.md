# Faza 3 — modularny Core incydentów

Realizacja na branchu `feat/stage3-implement`. Każdy etap kończy się
weryfikacją i osobnym commitem. Zakres testów bazodanowych: izolowane dane,
bez uruchamiania migracji istniejącej instalacji użytkownika.

| Etap | Zakres | Status |
| --- | --- | --- |
| 3.1 | NestJS Core obok Expressa, lifecycle, port świeżej tożsamości, Effect | Gotowe |
| 3.2 | Listy i szczegóły, scope organizacji i uprawnień | Gotowe; QUERY admin do porządkowania w 3.5 |
| 3.3 | Tworzenie, przypisywanie, statusy, notatki, rozstrzygnięcia | Gotowe |
| 3.4 | Pliki, trwały audyt oraz idempotencja operacji | W toku |
| 3.5 | Parity API, izolacja tenantów, pełne E2E i odbiór | Do wykonania |

## 3.1

NestJS 12.0.4 jest montowany we wspólnym procesie przez ExpressAdapter.
Core ma własny lifecycle i endpoint `/api/core/health`. Effect 3.22.2 obsługuje
port tożsamości, timeout i jawne błędy. Adapter należący do auth odczytuje
bieżącą sesję, konto i członkostwo; Core nie czyta tabel auth. Uzasadnienie
przejściowej topologii: [ADR-0004](../adr/0004-core-in-process.md).

Weryfikacja: check, 58 testów backendu, 24 testy frontendu (cache),
`bun scripts/test-core-http.ts` — rzeczywisty lokalny HTTP oraz shutdown.

## 3.2

Core obsługuje GET własnych, przypisanych i nieprzypisanych incydentów oraz
szczegóły w trzech rodzinach API. Warstwa domenowa wyznacza scope organizacji,
a dla pracownika również zgłaszającego. SQL i wzbogacanie nazw użytkowników
pozostają w adapterze danych. Publiczne URI i format paginacji pozostają zgodne.
Rozbudowane QUERY administratora i filtry pozostają adapterami legacy do
końcowego porządkowania w 3.5; nie deklarujemy jeszcze migracji całego API.

Testy: 60 backend, 24 frontend (cache), check, rzeczywisty HTTP Core
(401/403/404, świeża sesja i scope). E2E 24/24 dla trzech przeglądarek,
run `1790183263486-99336`.

## 3.3

Komendy tworzenia, przypisania/oddania, statusu, notatki i rozstrzygnięcia
przechodzą przez NestJS oraz use case'y Effect. Polityki rozróżniają legacy
PATCH i workflow analityka (PUT), zachowując istniejące reguły przejść.
Repozytorium wykonuje sprawdzenie stanu, uprawnień i UPDATE w jednej transakcji
z `SELECT FOR UPDATE`. Core nie przyjmuje aktora ani organizacji z body.

Integracja PostgreSQL (`bun backend/src/core/integration.ts`) potwierdziła
jednego zwycięzcę konkurencyjnego przypisania, tenant scope oraz rollback po
błędzie. Check i 63 testy backendu przechodzą, frontend 24 (cache).
E2E: 24/24, run `1790183673725-99990`.

Klasyfikacja LLM pozostaje best-effort do fazy 4. Upload przed zapisem SQL
może pozostawić osierocony obiekt; przy niejednoznacznym potwierdzeniu COMMIT
nie usuwamy obiektu, który mógł już zostać powiązany z incydentem.
