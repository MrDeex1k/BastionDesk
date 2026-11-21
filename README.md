# BastionDesk

BastionDesk to autorska platforma helpdesk do obsługi incydentów cyberbezpieczeństwa, zaprojektowana jako przystępna kosztowo alternatywa dla rozbudowanych systemów klasy enterprise. Projekt powstał z myślą o organizacjach, które potrzebują uporządkowanego procesu zgłaszania, klasyfikacji i obsługi incydentów w duchu wymagań NIS-2.

System wspiera cały podstawowy cykl pracy z incydentem: od zgłoszenia przez pracownika, przez analizę i priorytetyzację, po obsługę przez analityka i nadzór administracyjny. Ważnym elementem rozwiązania jest lokalny moduł AI, który pomaga klasyfikować zgłoszenia i skraca czas reakcji zespołu.

BastionDesk jest przeznaczony przede wszystkim dla:
- małych i średnich przedsiębiorstw
- organizacji budujących własny lub współdzielony SOC
- instytucji i zespołów, które szukają lżejszego, bardziej dostępnego wejścia w obszar cyberbezpieczeństwa operacyjnego

Projekt łączy nowoczesny stos webowy, architekturę modułową oraz nacisk na bezpieczeństwo komunikacji między usługami, dzięki czemu może pełnić rolę praktycznej bazy pod dalszy rozwój w kierunku platformy SOAR.

## Licencja

BastionDesk Community Edition jest udostępniany jako open source na licencji GNU Affero General Public License v3.0 (`AGPL-3.0-only`). Pełny tekst licencji znajduje się w pliku `LICENSE`.

Dla organizacji, które potrzebują użycia komercyjnego niezgodnego z obowiązkami AGPLv3, prywatnych forków, osadzania w produkcie własnym lub dystrybucji/SaaS bez obowiązków AGPLv3, może być dostępna osobna licencja komercyjna po indywidualnym uzgodnieniu.

## Zgłoszenia i współpraca

Błędy, propozycje funkcji i pytania zgłaszaj przez [GitHub Issues](https://github.com/MrDeex1k/BastionDesk/issues).
Pull requesty otwierają maintainerzy i zaproszeni współpracownicy.
[Zasady współpracy i kanały zgłoszeń](CONTRIBUTING.md).

## Stan rozwoju

Kod zawiera fundamenty faz 0–5: migracje SQL, modularny NestJS Core z Effect,
osobny gateway Elysia 2 + Better Auth, JWT/JWKS przez mTLS oraz trwałe zadania
klasyfikacji przez RabbitMQ. Express pozostaje hostem HTTP Core i części tras
administracyjnych. Wersja manifestów nadal wynosi `1.0.3`; nie jest to wydanie
pełnej platformy SOAR.

Etap 6 dodaje widok **Alerty Wazuh** dla analityka i administratora. Backend
odczytuje alerty i pełny JSON z Indexera na żądanie. PostgreSQL przechowuje
konfigurację jednego źródła na organizację i zaszyfrowane hasło. Test w Chromium
potwierdził odczyt istniejącego alertu agenta Ubuntu `001` oraz zgodność pełnego
JSON-u z dokumentem w Indexerze. Kryterium WAZ-04 jest zamknięte.
[Wyniki odbioru](docs/integrations/wazuh-stage-6-spec.md#wyniki-odbioru-w-laboratorium) ·
[Plan rozwoju](docs/future-soar-platform.md) · [Architektura backendu](docs/backend/backend.md).

## TechStack
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Oxc](https://img.shields.io/badge/oxc-%233451b2.svg?style=for-the-badge&logo=oxc&logoColor=white&logoSize=auto) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white) ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![TanStack Router](https://img.shields.io/badge/TanStack_Router-FF4154?style=for-the-badge&logo=react-router&logoColor=white) ![React Query](https://img.shields.io/badge/-React%20Query-FF4154?style=for-the-badge&logo=react%20query&logoColor=white) ![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB) ![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)

Backend aplikacyjny: Bun, Elysia 2 + Better Auth, NestJS z ExpressAdapter,
Effect i RabbitMQ. Dokładne wersje określają manifesty i lockfile.

![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54) ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi) ![HuggingFace](https://img.shields.io/badge/huggingface-%23FFD21E.svg?style=for-the-badge&logo=huggingface&logoColor=white)

![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white) ![Amazon S3](https://img.shields.io/badge/Amazon%20S3-FF9900?style=for-the-badge&logo=amazons3&logoColor=white)

![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white)


## Proces uruchomienia

1. Wchodzimy w katalog BastionDesk.
2. Kopiujemy `.env.example` do `.env` i zastępujemy przykładowe sekrety oraz dane dostępowe.
3. Generujemy lokalne certyfikaty poleceniem `sh infra/tls/generate-dev-certs.sh`.
   Jeśli `POSTGRES_USER` w `.env` różni się od wartości domyślnej, przekazujemy
   tę samą wartość do generatora, np.
   `POSTGRES_USER=<wartość-z-.env> sh infra/tls/generate-dev-certs.sh`.
4. Uruchamiamy `docker compose build`.
5. Uruchamiamy bazę: `docker compose up -d --wait database`.
6. Wykonujemy `plan` i `apply` migratora zgodnie z
   [instrukcją wdrożenia](docs/infrastructure/deploy.md). Bez migracji
   `0001_core_operations` i `0002_durable_jobs` Core/worker nie wystartują;
   auth wymaga `0003_auth_jwks`, a integracja Wazuh wymaga `0004_wazuh_sources`.
7. Uruchamiamy `docker compose up` lub `docker compose up -d`, jeśli stack ma działać w tle.
8. Z aplikacji korzystamy przez `http://localhost:4567` — to jedyny publiczny entrypoint stacka.

Szczegółowe wymagania i ograniczenia opisuje
[instrukcja wdrożenia](docs/infrastructure/deploy.md).

## Bezpieczne zarządzanie zależnościami

Rootowy workspace używa [Socket Firewall (`sfw`)](https://docs.socket.dev/docs/socket-firewall-free) jako zależności deweloperskiej. SFW uruchamia tymczasowy proxy, filtruje ruch menedżera pakietów i może zablokować złośliwą zależność przed jej pobraniem. Integracja z Bun działa w projekcie, ale Bun nie znajduje się na liście menedżerów oficjalnie wspieranych przez Socket Firewall Free.

Integracja jest częścią BastionDesk `1.0.3`.

W trybie workspace instalowanie i aktualizowanie zależności całego repozytorium wykonuj z katalogu
głównego:

```bash
bun run deps:install
bun run deps:update
```

Skrypty uruchamiają odpowiednio `sfw bun install` i `sfw bun update` z katalogu głównego.
Przy pracy tylko nad jednym pakietem użyj rootowego lockfile’a, np. `bun install --cwd frontend`
albo `bun install --cwd backend`. Konfiguracja Bun wymaga, aby wydanie pakietu miało co najmniej
3 godziny (`10800` sekund).
Bezpośrednie użycie `bun install` lub `bun update` zachowuje karencję z `bunfig.toml`, ale omija
ochronę SFW.

Zależności Pythona w `llm_service` mają tę samą karencję: `exclude-newer = "3 hours"`
w `pyproject.toml` dla `uv`. Wersje obrazów Docker aktualizujemy bez karencji.

Instalacje wykonywane podczas budowania obrazów Docker nie korzystają obecnie z SFW.

## Narzędzia repozytorium

Repozytorium używa TurboRepo do uruchamiania wspólnych kontroli dla `frontend` i `backend`.
Po pierwszym sklonowaniu zainstaluj zależności z katalogu głównego:

```bash
bun install
```

Najważniejsze polecenia:

```bash
bun run check      # testy reguł lint, lint, typecheck i sprawdzenie formatowania
bun run build      # build wszystkich pakietów, które go definiują
bun run test       # testy backendu i komponentów React
bun run test:components # formularze, uprawnienia i stan UI
bun run test:e2e   # jednorazowy stos Compose + Chromium
bun run test:e2e:all # checkpoint Chromium, Firefox i WebKit
bun run test:core:http # kontrakt HTTP Core, RBAC, GET/QUERY
bun run test:messaging:broker # routing, DLQ, confirms i restart RabbitMQ
bun run test:messaging:telemetry # eksport OTLP i propagacja trace
bun run test:core:db # transakcje, idempotencja, audyt na izolowanym PostgreSQL
bun run test:migrations # izolowany PostgreSQL: baseline, historia, rollback i restore
bun run dev        # frontend i Core; auth i worker wymagają osobnego startu
bun run changelog:generate # generowanie ostatniej sekcji CHANGELOG z Conventional Commits
```

Konfiguracje `backend/oxlint.config.ts` i `frontend/oxlint.config.ts` współdzielą
bazę `tools/oxlint/base.mts` i korzystają z `oxlint-flat-config`.
Wybrane reguły anti-slop działają jako ostrzeżenia w obu workspace’ach.
[Zakres, testy i aktualizacje](docs/development/anti-slop.md). Testy reguł wymagają
Node.js 22.18+ lub 24+ obok Bun.

Formatowanie zapewnia `bun fmt` z Bun 1.4.4. Ustawienia znajdują się w sekcjach
`[fmt]` plików `backend/bunfig.toml` i `frontend/bunfig.toml`: backend używa tabulatorów
o szerokości 4, a frontend dwóch spacji. Polecenie `bun run format` sprawdza formatowanie
obu workspace’ów bez zapisywania zmian. Aby poprawić pliki, uruchom
`bun run --cwd backend format:fix` lub `bun run --cwd frontend format:fix`.
Backend obejmuje katalog `src/`, a frontend pomija `dist/` i generowany `src/routeTree.gen.ts`.

Husky instaluje hooki Git po `bun install`. Hook `pre-commit` uruchamia `bun run check`, a hook
`commit-msg` wymusza format [Conventional Commits](https://www.conventionalcommits.org/), np.
`feat(frontend): dodaj filtrowanie incydentów` albo `fix(backend): popraw walidację zapytania`.

Repozytorium używa jednego kanonicznego rootowego `bun.lock`. Buildy Docker korzystają z niego
przez filtrowane workspace’y. Wyjątek: odizolowany probe Elysia 2 w
`scripts/spikes/elysia2` ma własny lockfile i nie jest częścią builda produkcyjnego.

Core wymaga migracji `0001_core_operations` i `0002_durable_jobs` przed startem, również
na świeżej bazie. Auth dodatkowo wymaga `0003_auth_jwks`. Brak wymaganego
schematu blokuje start odpowiedniej usługi.
[Zakres Core i wyniki](docs/backend/phase-3-core.md).
Faza 4 dodaje worker LLM, RabbitMQ po TLS, retry/DLQ i opcjonalny OTLP.
[Uruchomienie i replay](docs/backend/messaging-runbook.md).

Faza 2 dodaje jawne polecenia `db:migrate:plan` i `db:migrate:apply`, wymagające
osobnego połączenia migratora. Zakres baseline i procedurę opisuje
[instrukcja migracji](docs/database/migrations.md).

Instalację przeglądarek, macierz scenariuszy i historyczny wynik CI opisuje
[kontrakt testowy fazy 1](docs/testing/phase-1-ui-e2e.md).
Workflowy GitHub Actions usunięto 22 września 2026; kontrole pozostają lokalne.
Aktualne wersje zależności określają manifesty i pliki lockfile.
[Odświeżenie z 30 października 2026](docs/development/2026-10-30-dependency-refresh.md)
nie obejmowało testów ani buildów; wcześniejsze wyniki nie potwierdzają
automatycznie zgodności po tej aktualizacji. Poprzednią migrację Effect 4
opisuje [aktualizacja z 8 października](docs/development/2026-10-08-dependency-refresh.md). Uwagi do
schematu Better Auth opisuje [dokumentacja bazy](docs/database/database.md).

## Deployment

Model wdrożenia jest opisany w:

- [docs/infrastructure/deploy.md](docs/infrastructure/deploy.md)

Najważniejsze założenia release:

- wspierany jest self-hosted Docker Compose,
- model wdrożenia to `fresh install only`,
- główny punkt wejścia do aplikacji to `http://localhost:4567`.

### Auth i gateway (faza 5)

Elysia 2 + Better Auth działa w osobnym `auth-service`; Core przyjmuje JWT przez
mTLS. Wymagane są migracja `0003_auth_jwks` i certyfikaty identity przed
przełączeniem ruchu. [Konfiguracja, upgrade, rollback i testy](docs/backend/phase-5-identity.md).

### Alerty Wazuh (etap 6)

Podłącz zewnętrzny Indexer przez prywatną sieć, zamontuj klucz szyfrowania
w backendzie i zapisz źródło w panelu administratora.
[Instrukcja wdrożenia i testu](docs/integrations/wazuh-discovery.md#wdrożenie-etapu-6).
