# Aktualizacja zależności — 8 października 2026

Aktualizacja na branchu `feat/stage6-implement` obejmuje wszystkie manifesty NPM,
rootowy lockfile, niezależny prototyp `scripts/spikes/elysia2` oraz zależności
Pythona w `llm_service/pyproject.toml` i `llm_service/uv.lock`. Użyto `sfw`
i aktualizacji Bun z `--minimum-release-age 86400`. Zależności przechodnie
odświeżono w granicach kontraktów pakietów nadrzędnych.

Elysia pozostaje w używanym kanale 2 beta: `next` z minimum wieku rozwiązał się
do `2.0.0-beta.21` w obu pakietach. Zwykłe `bun outdated --latest` porównuje
kanał stabilny i nie wykrywa nowszych wydań tej bety.

## Bezpośrednie zależności NPM

| Manifest | Pakiet | Przed | Po |
| --- | --- | --- | --- |
| `package.json` | `@oxlint/plugins` | `nowa zależność` | `1.87.0` |
| `package.json` | `conventional-changelog-conventionalcommits` | `10.4.0` | `10.4.1` |
| `package.json` | `turbo` | `2.11.2` | `2.11.7` |
| `package.json` | `oxlint` | `nowa zależność` | `1.87.0` |
| `backend/package.json` | `@better-auth/passkey` | `1.7.5` | `1.7.7` |
| `backend/package.json` | `@nestjs/common` | `12.0.4` | `12.1.2` |
| `backend/package.json` | `@nestjs/core` | `12.0.4` | `12.1.2` |
| `backend/package.json` | `@nestjs/platform-express` | `12.0.4` | `12.1.2` |
| `backend/package.json` | `@opentelemetry/exporter-metrics-otlp-http` | `0.222.0` | `0.223.0` |
| `backend/package.json` | `@opentelemetry/exporter-trace-otlp-http` | `0.222.0` | `0.223.0` |
| `backend/package.json` | `@opentelemetry/sdk-node` | `0.222.0` | `0.223.0` |
| `backend/package.json` | `amqplib` | `2.0.1` | `2.2.0` |
| `backend/package.json` | `better-auth` | `1.7.5` | `1.7.7` |
| `backend/package.json` | `dotenv` | `18.0.1` | `18.0.6` |
| `backend/package.json` | `effect` | `3.22.2` | `4.0.1` |
| `backend/package.json` | `elysia` | `2.0.0-beta.16` | `2.0.0-beta.21` |
| `backend/package.json` | `express-rate-limit` | `8.7.0` | `8.7.1` |
| `backend/package.json` | `nodemailer` | `10.0.10` | `10.0.16` |
| `backend/package.json` | `pg` | `8.23.0` | `8.23.1` |
| `backend/package.json` | `oxfmt` | `0.68.0` | `0.72.0` |
| `backend/package.json` | `oxlint` | `1.83.0` | `1.87.0` |
| `backend/package.json` | `oxlint-tsgolint` | `7.0.2002` | `7.0.2003` |
| `frontend/package.json` | `@better-auth/passkey` | `1.7.5` | `1.7.7` |
| `frontend/package.json` | `@tanstack/react-query` | `5.103.1` | `5.104.1` |
| `frontend/package.json` | `@tanstack/react-router` | `1.170.38` | `1.170.41` |
| `frontend/package.json` | `better-auth` | `1.7.5` | `1.7.7` |
| `frontend/package.json` | `lucide-react` | `1.47.0` | `1.52.0` |
| `frontend/package.json` | `@shadcn/lint` | `0.1.1` | `0.2.0` |
| `frontend/package.json` | `@tanstack/router-plugin` | `1.168.40` | `1.168.42` |
| `frontend/package.json` | `@types/node` | `26.6.2` | `26.6.4` |
| `frontend/package.json` | `@vitejs/plugin-react` | `6.1.1` | `6.1.2` |
| `frontend/package.json` | `nanostores` | `1.5.3` | `1.5.5` |
| `frontend/package.json` | `oxfmt` | `0.68.0` | `0.72.0` |
| `frontend/package.json` | `oxlint` | `1.83.0` | `1.87.0` |
| `frontend/package.json` | `oxlint-tsgolint` | `7.0.2002` | `7.0.2003` |
| `frontend/package.json` | `react-doctor` | `0.9.14` | `0.9.17` |
| `frontend/package.json` | `vite` | `8.3.0` | `8.3.3` |
| `scripts/spikes/elysia2/package.json` | `elysia` | `2.0.0-beta.14` | `2.0.0-beta.21` |

## Zależności Pythona usługi AI

| Pakiet | Przed | Po |
| --- | --- | --- |
| `fastapi` | `0.141.1` | `0.142.2` |
| `grpcio` | `1.84.0` | `1.84.0` |
| `grpcio-tools` | `1.84.0` | `1.84.0` |
| `huggingface-hub` | `1.32.0` | `1.33.0` |
| `torch` | `2.14.0` | `2.14.1` |
| `transformers` | `5.17.0` | `5.19.0` |
| `uvicorn` | `0.53.0` | `0.54.0` |

Po ponownym rozwiązaniu wersji przypięto najnowszy zgodny zestaw z zachowaniem
`exclude-newer = "24 hours"`, Python 3.13 i jawnego indeksu CPU PyTorch.
FastAPI 0.143.0 było zbyt świeże. `huggingface-hub` pozostaje na 1.33.0,
ponieważ używane `tokenizers==0.23.2` wymaga `huggingface-hub<2.0`.

Odświeżono również `filelock` 4.0.1 → 4.0.12, `hf-xet` 1.6.0 → 1.7.0,
`markupsafe` 3.0.3 → 3.0.4, `networkx` 3.6.1 → 3.7, `regex` 2026.9.10 →
2026.9.29, `starlette` 1.6.0 → 1.7.0 i `typer` 0.27.2 → 0.27.3.
Doszło przechodnie `opentelemetry-api==1.45.1`.

Weryfikacja aktualizacji Pythona: `uv sync --locked`, `uv pip check` i
`uv lock --upgrade --dry-run` bez dalszych zmian, ponowny build obrazu LLM
oraz test offline Linux/arm64: FastAPI/Starlette HTTP, generowanie protobuf
i import wygenerowanego gRPC, generacja na małej losowej konfiguracji Gemma 3
z PyTorch CPU i normalizacja odpowiedzi klasyfikatora. Nie pobierano ani
nie uruchamiano pełnego checkpointu `google/gemma-3-1b-it`.

## Effect 4

Aktualizacja `effect` do `4.0.1` wymagała migracji pięciu deklaracji usług
z `Context.Tag` do `Context.Service`, `Effect.either`/`Either` do
`Effect.result`/`Result` oraz `timeoutFail` do `timeoutOrElse` z błędem domenowym.
Testy runtime sprawdzają zachowanie wartości, oryginalnego błędu domenowego,
defektu oraz timeoutu tożsamości zwracającego `SERVICE_UNAVAILABLE`.

## Obrazy Docker

| Obraz | Przed | Po |
| --- | --- | --- |
| RabbitMQ | `4.2.5-management-alpine` | `4.3.6-management-alpine` |
| PgBouncer | `v1.25.2-p0` | `v1.26.0-p0` |
| OpenTelemetry Collector | `0.148.0` | `0.162.0` |
| Mailpit | `v1.31.2` | `v1.31.4` |
| uv / Python 3.13 / Debian trixie | `0.12.17` | `0.12.23` |

Sprawdzono także istniejące przypięcia Bun `1.4.2-alpine`, NGINX
`1.31.6-alpine3.24`, PostgreSQL `18.6`/`18.6-alpine3.24`, BusyBox `1.38.0-musl`
i MinIO `RELEASE.2025-10-15T17-29-55Z`: pozostały aktualne w używanych wariantach.
Build z `--pull` odświeża również bazowe warstwy pod tymi tagami.

Obraz MinIO Client w Quay zwracał `401 Unauthorized`; ten sam tag na Docker Hub
również nie był dostępny. Etapy `mc-src` pobierają teraz oficjalny plik wydania
[MinIO Client](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z)
z GitHub, a wspólny `storage/download-client.sh` weryfikuje opublikowane SHA-256
osobno dla amd64 i arm64. Wersja klienta pozostaje bez zmian. Pobieranie wymaga
sieci przy budowaniu; inne architektury są jawnie odrzucane.

Przy wdrażaniu RabbitMQ 4.3 na istniejących danych należy stosować
[procedurę aktualizacji upstream](https://www.rabbitmq.com/docs/upgrade),
w tym sprawdzić wymagane feature flags przed zmianą obrazu. Testy lokalne
korzystają z jednorazowych kontenerów i nie migrują istniejących wolumenów.

## Anti-slop

Dodano cztery kontrole jako ostrzeżenia. Politykę i pochodzenie kodu opisuje
[anti-slop w BastionDesk](anti-slop.md).

## Weryfikacja

- `bun outdated --latest` w repozytorium i prototypie: brak zaległych stabilnych aktualizacji.
- `sfw bun install --frozen-lockfile`: instalacja zgodna z lockfile’em.
- `bun run check`: trzy zestawy RuleTester, typecheck, format i lint; 23 oczekiwane
  ostrzeżenia anti-slop, zero błędów.
- `bun run test`: 80 testów backendu i 24 testy frontendu, zero błędów.
- `bun run build`: produkcyjny build frontendu.
- `docker compose build --pull`: wszystkie 13 obrazów usług zbudowane na arm64,
  w tym produkcyjny LLM z zamrożonym `uv.lock`.
- Walidacja Compose, pobranie obrazów RabbitMQ/Mailpit/OTel oraz `otelcol validate`
  z konfiguracją projektu.
- `test:core:http`, `test:core:db`, `test:messaging:telemetry`,
  `test:messaging:broker`: kontrakty HTTP, transakcje i migracja istniejącego
  schematu, idempotencja, kolejki/DLQ/restart, eksport OTLP — zaliczone.
- `bun run test:e2e`: 10/10 scenariuszy Chromium, probe mTLS/JWT i trwałości
  sesji/kluczy po restarcie, odzyskiwanie po zatrzymaniu brokera i deduplikacja
  klasyfikacji — zaliczone. Jednorazowy stos i jego wolumeny zostały usunięte.

E2E używa istniejącego deterministycznego stubu LLM; produkcyjny obraz LLM
został zbudowany, ale nie wykonywano pełnej inferencji modelu ani wdrożenia
na istniejących danych. Nie uruchamiano macierzy Firefox/WebKit.

Nowy Turbo automatycznie dodał swój zarządzany blok instrukcji do `AGENTS.md`;
zachowano go wraz z dotychczasowymi zasadami projektu.
