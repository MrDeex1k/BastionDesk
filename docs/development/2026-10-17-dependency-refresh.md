# Aktualizacja zależności — 17 października 2026

Odświeżenie na `feat/stage6-implement` obejmuje wszystkie manifesty NPM,
rootowy lockfile, niezależny prototyp Elysia, pakiety Pythona usługi AI
oraz obrazy Docker. Włączono również aktualizacje zależności, które były
już w katalogu roboczym przed tym przebiegiem.

## Karencja 6 godzin

- Skrypty `deps:install` i `deps:update`: `--minimum-release-age 21600`.
- Rootowy, backendowy i frontendowy `bunfig.toml`: `minimumReleaseAge = 21600`.
- Python: `exclude-newer = "6 hours"`, zapisane również w `uv.lock`.
- Przy wyborze nowych tagów Docker sprawdzono daty publikacji w rejestrze.
  Obrazy nie mają automatycznego resolvera karencji; daty sprawdzamy podczas
  aktualizacji. `--pull` odświeża również warstwy pod już przypiętymi tagami.

Pozostają dokładne przypięcia wersji, SFW dla aktualizacji NPM, Python 3.13
oraz jawny indeks CPU PyTorch.

## NPM

| Manifest | Pakiet | Przed | Po |
| --- | --- | --- | --- |
| `package.json` | `@oxlint/plugins` | `1.87.0` | `1.88.0` |
| `package.json` | `turbo` | `2.11.7` | `2.11.9` |
| `package.json` | `oxlint` | `1.87.0` | `1.88.0` |
| `backend/package.json` | `@better-auth/passkey` | `1.7.7` | `1.7.10` |
| `backend/package.json` | `@nestjs/common` | `12.1.2` | `12.1.3` |
| `backend/package.json` | `@nestjs/core` | `12.1.2` | `12.1.3` |
| `backend/package.json` | `@nestjs/platform-express` | `12.1.2` | `12.1.3` |
| `backend/package.json` | `better-auth` | `1.7.7` | `1.7.10` |
| `backend/package.json` | `dotenv` | `18.0.7` | `18.0.8` |
| `backend/package.json` | `effect` | `4.0.3` | `4.0.5` |
| `backend/package.json` | `elysia` | `2.0.0-beta.30` | `2.0.0-beta.32` |
| `backend/package.json` | `nodemailer` | `10.1.0` | `10.1.2` |
| `backend/package.json` | `zod` | `4.6.6` | `4.6.7` |
| `backend/package.json` | `oxfmt` | `0.72.0` | `0.73.0` |
| `backend/package.json` | `oxlint` | `1.87.0` | `1.88.0` |
| `frontend/package.json` | `@better-auth/passkey` | `1.7.7` | `1.7.10` |
| `frontend/package.json` | `@tanstack/react-query` | `5.104.2` | `5.104.3` |
| `frontend/package.json` | `@tanstack/react-router` | `1.170.42` | `1.170.44` |
| `frontend/package.json` | `better-auth` | `1.7.7` | `1.7.10` |
| `frontend/package.json` | `lucide-react` | `1.55.0` | `1.58.0` |
| `frontend/package.json` | `react` | `19.3.0` | `19.3.1` |
| `frontend/package.json` | `react-dom` | `19.3.0` | `19.3.1` |
| `frontend/package.json` | `@happy-dom/global-registrator` | `21.0.1` | `21.0.3` |
| `frontend/package.json` | `@playwright/test` | `1.64.0` | `1.64.1` |
| `frontend/package.json` | `@tanstack/router-plugin` | `1.168.43` | `1.168.47` |
| `frontend/package.json` | `@testing-library/user-event` | `14.6.7` | `14.6.8` |
| `frontend/package.json` | `happy-dom` | `21.0.1` | `21.0.3` |
| `frontend/package.json` | `oxfmt` | `0.72.0` | `0.73.0` |
| `frontend/package.json` | `oxlint` | `1.87.0` | `1.88.0` |
| `frontend/package.json` | `react-doctor` | `0.9.17` | `0.9.18` |
| `scripts/spikes/elysia2/package.json` | `elysia` | `2.0.0-beta.30` | `2.0.0-beta.32` |

Odświeżono zależności przechodnie w granicach kontraktów nadrzędnych pakietów.
Elysia pozostaje w używanym kanale `next` (2 beta); sprawdzono tag i datę
publikacji `2.0.0-beta.32`, tę samą wersję stosuje prototyp i backend.

## Python

| Pakiet | Przed | Po |
| --- | --- | --- |
| `fastapi` | `0.143.0` | `0.143.3` |
| `filelock` | `4.1.1` | `4.2.0` |
| `starlette` | `1.7.0` | `1.8.0` |
| `torch` | `2.14.1+cpu` | `2.14.1` |
| `transformers` | `5.19.0` | `5.20.1` |
| `truststore` | `0.10.4` | `0.10.5` |

Pozostałe pakiety bezpośrednie — grpcio/grpcio-tools `1.84.0`, Hub `2.2.0`,
PyTorch `2.14.1` i Uvicorn `0.54.0` — pozostają najnowszym zgodnym zestawem
po rozwiązaniu zależności z karencją 6 godzin.

## Docker

| Obraz | Przed | Po |
| --- | --- | --- |
| NGINX (proxy i frontend) | `1.31.6-alpine3.24` | `1.31.7-alpine3.24` |
| uv / Python 3.13 / Debian trixie | `0.13.0` | `0.13.1` |
| Mailpit | `v1.31.5` | `v1.31.6` |
| OpenTelemetry Collector | `0.162.0` | `0.163.1` |

Tag Collectora opublikowano 16 października o 20:17 UTC; kontrola
17 października po 03:11 UTC potwierdziła wiek ponad 6 godzin.
Sprawdzono także Bun `1.4.3-alpine`, PostgreSQL `18.6`/`18.6-alpine3.24`,
RabbitMQ `4.3.6-management-alpine`, PgBouncer `v1.26.0-p0`, BusyBox
`1.38.0-musl`, MinIO `RELEASE.2025-10-15T17-29-55Z` i MinIO Client
`RELEASE.2025-08-13T08-35-41Z`: nie wymagają zmiany w używanych kanałach.

## Kontrole gotowości podczas startu

Pierwsze próby E2E ujawniły dwa wyścigi podczas uruchamiania świeżych
wolumenów. PostgreSQL może zgłaszać gotowość przez socket lokalnego,
tymczasowego serwera inicjalizacji; kontrola używa teraz TCP `127.0.0.1`,
aby czekać na serwer docelowy. RabbitMQ zgłosił `eacces` przy odczycie
`.erlang.cookie`. Diagnostyka uruchamiana bezpośrednio jako root może utworzyć
plik po zmianie właściciela danych przez entrypoint. Kontrola wywołuje teraz
oficjalny `docker-entrypoint.sh rabbitmq-diagnostics`, który uruchamia ją
jako użytkownik rabbitmq, tak jak sam broker.

## Weryfikacja

- Zamrożona instalacja Bun oraz `uv lock --check`: manifesty zgodne z lockfile.
- `bun outdated --latest`: brak zaległych bezpośrednich aktualizacji spełniających
  karencję; dodatkowo sprawdzono kanał Elysia `next`.
- `bun run check`: testy trzech reguł lint, typecheck, lint i format; bez błędów,
  23 istniejące ostrzeżenia anti-slop.
- `bun run test`: 80 testów backendu i 24 testy frontendu, bez błędów.
- `bun run build` i `bun run test:core:http`: zaliczone.
- Walidacja wszystkich trzech plików Compose i pobranie nowego Mailpit.
- `docker compose build --pull`: wszystkie 13 obrazów zbudowane na arm64,
  w tym produkcyjny LLM z zamrożonym `uv.lock`.
- Collector `0.163.1 validate` z konfiguracją projektu: zaliczony.
- `uv pip check` w obrazie AI: wszystkie 45 pakietów zgodne.
- Test offline w obrazie AI: generacja dwóch tokenów na małej losowej
  konfiguracji Gemma 3 z PyTorch CPU, health dla modelu gotowego i niedostępnego,
  normalizacja kategorii oraz generowanie i serializacja protobuf/import gRPC.

Pełny E2E nie został zaliczony. Po poprawkach startowych wszystkie usługi,
w tym RabbitMQ, osiągnęły stan healthy. Ponowienie na wcześniej zbudowanych
obrazach (tymczasowy runner pomijający wyłącznie ponowny build) zatrzymało się
na `TimeoutError` w probe autoryzacji fazy 5, przed scenariuszami przeglądarkowymi.
Docker w tym przebiegu bardzo wolno tworzył kontenery i wykonywał buildy;
wpływ obciążenia jest prawdopodobny, ale przyczyna timeoutu nie została
jednoznacznie potwierdzona. Nie uznajemy tego przebiegu za pozytywny E2E.

Nie pobierano ani nie uruchamiano pełnego checkpointu `google/gemma-3-1b-it`.
Nie wykonywano wdrożenia ani migracji istniejących danych produkcyjnych.
