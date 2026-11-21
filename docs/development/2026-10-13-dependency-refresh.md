# Aktualizacja zależności — 13 października 2026

Aktualizacja na `feat/stage6-implement` obejmuje oba workspace’y NPM,
rootowy lockfile, niezależny prototyp Elysia, usługę AI i obrazy Docker.
Zachowano minimum wieku wydania 24 godziny dla NPM i Pythona oraz jawny
indeks CPU PyTorch. Wszystkie bezpośrednie wersje pozostają przypięte.

## NPM

| Manifest | Pakiet | Przed | Po |
| --- | --- | --- | --- |
| `backend/package.json` | `@grpc/grpc-js` | `1.14.5` | `1.14.6` |
| `backend/package.json` | `dotenv` | `18.0.6` | `18.0.7` |
| `backend/package.json` | `effect` | `4.0.1` | `4.0.3` |
| `backend/package.json` | `elysia` | `2.0.0-beta.21` | `2.0.0-beta.30` |
| `backend/package.json` | `express` | `5.2.1` | `5.3.0` |
| `backend/package.json` | `nodemailer` | `10.0.16` | `10.1.0` |
| `backend/package.json` | `zod` | `4.6.5` | `4.6.6` |
| `backend/package.json` | `@types/bun` | `1.4.2` | `1.4.3` |
| `backend/package.json` | `oxlint-tsgolint` | `7.0.2003` | `7.0.2004` |
| `frontend/package.json` | `@base-ui/react` | `1.8.0` | `1.9.0` |
| `frontend/package.json` | `@tanstack/react-query` | `5.104.1` | `5.104.2` |
| `frontend/package.json` | `@tanstack/react-router` | `1.170.41` | `1.170.42` |
| `frontend/package.json` | `lucide-react` | `1.52.0` | `1.55.0` |
| `frontend/package.json` | `@happy-dom/global-registrator` | `20.14.5` | `21.0.1` |
| `frontend/package.json` | `@playwright/test` | `1.63.0` | `1.64.0` |
| `frontend/package.json` | `@shadcn/lint` | `0.2.0` | `0.2.1` |
| `frontend/package.json` | `@tanstack/router-plugin` | `1.168.42` | `1.168.43` |
| `frontend/package.json` | `@types/bun` | `1.4.2` | `1.4.3` |
| `frontend/package.json` | `@types/node` | `26.6.4` | `26.6.5` |
| `frontend/package.json` | `happy-dom` | `20.14.5` | `21.0.1` |
| `frontend/package.json` | `oxlint-tsgolint` | `7.0.2003` | `7.0.2004` |
| `frontend/package.json` | `vite` | `8.3.3` | `8.3.4` |
| `scripts/spikes/elysia2/package.json` | `elysia` | `2.0.0-beta.21` | `2.0.0-beta.30` |

Odświeżono również zależności przechodnie w granicach kontraktów pakietów
nadrzędnych. Elysia pozostaje w używanym kanale 2 beta; wersję `2.0.0-beta.30`
sprawdzono w rejestrze NPM i wyrównano w backendzie oraz prototypie.
`bun outdated --latest` nie wskazuje zaległych aktualizacji spełniających
minimum wieku wydania; oznaczenie `*` przy oxlint dotyczy tego ograniczenia.

## Python

- FastAPI: `0.142.2` → `0.143.0`.
- Hugging Face Hub: `1.33.0` → `2.2.0`.
- Tokenizers (przechodnio): `0.23.2` → `0.23.3`, co pozwala na Hub 2.2.
- grpcio/grpcio-tools `1.84.0`, PyTorch `2.14.1`, Transformers `5.19.0`
  i Uvicorn `0.54.0` pozostają najnowszym zgodnym zestawem po rozwiązaniu
  zależności z minimum wieku wydania.

Zaktualizowano `uv.lock`, zachowując Python 3.13 i PyTorch CPU na Linux.
Odświeżono też Filelock `4.1.1`, NumPy `2.5.4`, Pydantic `2.14.1`
i pydantic-core `2.50.1`; Hub 2.2 wprowadza HTTPX2/httpcore2 `2.13.1`
oraz truststore `0.10.4`.

## Docker

| Obraz / narzędzie | Przed | Po |
| --- | --- | --- |
| Bun (backend i build frontendu) | `1.4.2-alpine` | `1.4.3-alpine` |
| uv / Python 3.13 / Debian trixie | `0.12.23` | `0.13.0` |
| Mailpit | `v1.31.4` | `v1.31.5` |

Pole `packageManager` wskazuje teraz `bun@1.4.3`.
Sprawdzono rejestry oraz wydania upstream: NGINX `1.31.6-alpine3.24`,
PostgreSQL `18.6`/`18.6-alpine3.24`, RabbitMQ `4.3.6-management-alpine`,
PgBouncer `v1.26.0-p0`, BusyBox `1.38.0-musl`, OpenTelemetry Collector
`0.162.0`, MinIO `RELEASE.2025-10-15T17-29-55Z` oraz klient MinIO
`RELEASE.2025-08-13T08-35-41Z` pozostają aktualne w używanych kanałach.
Nie wybrano wydań nightly ani canary. Build z `--pull` pobiera aktualne
warstwy bazowe również dla niezmienionych tagów.

## Weryfikacja

- `bun install --frozen-lockfile --ignore-scripts`: manifesty zgodne z lockfile.
- `bun run check`: testy trzech reguł lint, typecheck, lint i format; bez błędów,
  23 istniejące ostrzeżenia anti-slop.
- `bun run test`: 80 testów backendu i 24 testy frontendu, bez błędów.
- `bun run build`: produkcyjny build frontendu.
- `bun run test:core:http`: kontrakty HTTP, tożsamość, tenant scope, RBAC
  i zgodność admin GET/QUERY.
- Walidacja wszystkich trzech konfiguracji Compose i pobranie nowego Mailpit.
- `docker compose build --pull`: wszystkie 13 obrazów zbudowane na arm64;
  produkcyjny LLM używa zamrożonego `uv.lock`.
- `bun run test:e2e`: 10/10 scenariuszy Chromium oraz probe mTLS/JWT,
  trwałość sesji i kluczy po restarcie, odzyskiwanie brokera i deduplikacja
  klasyfikacji. Po aktualizacji Playwright doinstalowano wymagane Chromium.
- `uv lock --check` i `uv pip check` w obrazie LLM: bez błędów.
- Test offline w produkcyjnym obrazie LLM: generacja dwóch tokenów na małej,
  losowej konfiguracji Gemma 3 z PyTorch CPU; endpoint health dla gotowego
  i niedostępnego modelu, normalizacja kategorii oraz generowanie protobuf,
  serializacja i import gRPC.

Test usługi AI nie pobierał ani nie uruchamiał pełnego checkpointu
`google/gemma-3-1b-it`. Nie wykonywano wdrożenia ani migracji istniejących
wolumenów produkcyjnych.
