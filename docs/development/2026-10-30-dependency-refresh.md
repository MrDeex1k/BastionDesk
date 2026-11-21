# Aktualizacja zależności — 30 października 2026

Pakiety NPM odświeżono przez SFW z karencją 10800 sekund, bez skryptów
instalacyjnych. Python zaktualizowano przez `uv` z `exclude-newer = "3 hours"`,
bez budowania pakietów źródłowych i bez synchronizacji środowiska. Zachowano
Python 3.13, indeks CPU PyTorch i dokładne przypięcia wersji.

## Bezpośrednie zmiany NPM

| Manifest | Pakiet | Przed | Po |
| --- | --- | --- | --- |
| `backend/package.json` | `@grpc/grpc-js` | `1.14.6` | `1.14.7` |
| `backend/package.json` | `@nestjs/common` | `12.2.0` | `12.3.2` |
| `backend/package.json` | `@nestjs/core` | `12.2.0` | `12.3.2` |
| `backend/package.json` | `@nestjs/platform-express` | `12.2.0` | `12.3.2` |
| `backend/package.json` | `effect` | `4.0.6` | `4.1.0` |
| `backend/package.json` | `elysia` | `2.0.0-rc.0` | `2.0.0-rc.1` |
| `backend/package.json` | `express-rate-limit` | `8.7.1` | `8.7.2` |
| `backend/package.json` | `jose` | `6.2.13` | `6.2.14` |
| `backend/package.json` | `nodemailer` | `10.2.1` | `10.3.1` |
| `frontend/package.json` | `lucide-react` | `1.62.0` | `1.65.0` |
| `frontend/package.json` | `@types/node` | `26.6.5` | `26.6.6` |
| `scripts/spikes/elysia2/package.json` | `elysia` | `2.0.0-rc.0` | `2.0.0-rc.1` |

## Python

| Pakiet | Przed | Po |
| --- | --- | --- |
| `huggingface-hub` | `2.3.0` | `2.4.0` |
| `torch` | `2.14.1` | `2.15.0` |
| `transformers` | `5.21.0` | `5.22.1` |

Odświeżono także zależności przechodnie w granicach wymagań pakietów nadrzędnych.
Zapisano rootowy `bun.lock`, lockfile prototypu Elysia i `llm_service/uv.lock`.

## Obrazy Docker — bez karencji

Przejrzano metadane Docker Hub, manifesty GHCR i oficjalne wydania GitHub.
Obecne tagi są aktualne w używanych stabilnych wariantach; nie zmieniano
Dockerfile ani Compose:

| Obraz | Aktualny tag |
| --- | --- |
| Bun | `1.4.4-alpine` |
| NGINX | `1.31.8-alpine3.24` |
| PostgreSQL | `18.6` / `18.6-alpine3.24` |
| RabbitMQ | `4.4.0-management-alpine` |
| PgBouncer | `v1.26.1-p0` |
| BusyBox | `1.38.0-musl` |
| MinIO | `RELEASE.2025-10-15T17-29-55Z` |
| uv / Python 3.13 | `0.13.6-python3.13-trixie-slim` |
| Mailpit | `v1.32.0` |
| OpenTelemetry Collector | `0.164.0` |

Digest tagu Collector `latest` jest identyczny z przypiętym `0.164.0`.
MinIO Client pozostaje na najnowszym oficjalnym wydaniu
`RELEASE.2025-08-13T08-35-41Z`. Nie stosowano karencji do wyboru obrazów;
wydania nightly, canary i RC innych serii nie zastępują używanych stabilnych tagów.
Elysia pozostaje w osobno wybranym kanale 2 RC.

## Zakres wykonania

Zgodnie z poleceniem nie uruchamiano buildów, testów, lintera ani typechecka.
Nie pobierano warstw i nie uruchamiano kontenerów. Commit pomija hooki, które
uruchomiłyby testy. Ta aktualizacja nie potwierdza zgodności aplikacji z nowymi wersjami.
