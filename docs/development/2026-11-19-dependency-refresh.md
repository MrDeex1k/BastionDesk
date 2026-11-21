# Aktualizacja zależności 19 listopada 2026

Zaktualizowano zależności na `feat/stage6-implement`, zachowując karencję
3 godzin dla NPM i Pythona oraz brak karencji dla obrazów Docker.
Dokładne przypięcia wersji, Python 3.13, indeks CPU PyTorch i `bun fmt`
pozostają w dotychczasowej konfiguracji.

## NPM

Zależności workspace odświeżono przez SFW i Bun z
`--minimum-release-age 10800 --latest --exact --ignore-scripts`.
Osobno odświeżono lockfile prototypu Elysia; jego bezpośrednie zależności
były już aktualne. Pakiet `tools/oxlint/anti-slop` nie deklaruje zależności.

| Manifest | Pakiet | Przed | Po |
| --- | --- | --- | --- |
| `package.json` | `@oxlint/plugins` | `1.90.0` | `1.94.0` |
| `package.json` | `oxlint` | `1.90.0` | `1.94.0` |
| `package.json` | `turbo` | `2.11.10` | `2.11.13` |
| `backend/package.json` | `@better-auth/passkey` | `1.7.18` | `1.7.26` |
| `backend/package.json` | `@nestjs/common` | `12.4.2` | `12.5.1` |
| `backend/package.json` | `@nestjs/core` | `12.4.2` | `12.5.1` |
| `backend/package.json` | `@nestjs/platform-express` | `12.4.2` | `12.5.1` |
| `backend/package.json` | `@opentelemetry/exporter-metrics-otlp-http` | `0.301.1` | `0.301.2` |
| `backend/package.json` | `@opentelemetry/exporter-trace-otlp-http` | `0.301.1` | `0.301.2` |
| `backend/package.json` | `@opentelemetry/sdk-node` | `0.301.1` | `0.301.2` |
| `backend/package.json` | `amqplib` | `2.3.1` | `2.4.0` |
| `backend/package.json` | `better-auth` | `1.7.18` | `1.7.26` |
| `backend/package.json` | `effect` | `4.1.2` | `4.1.4` |
| `backend/package.json` | `express-rate-limit` | `8.7.3` | `8.7.5` |
| `backend/package.json` | `jose` | `6.2.16` | `6.2.18` |
| `backend/package.json` | `nodemailer` | `10.4.0` | `10.6.0` |
| `backend/package.json` | `oxlint` | `1.93.0` | `1.94.0` |
| `backend/package.json` | `oxlint-tsgolint` | `7.0.2006` | `7.0.2007` |
| `frontend/package.json` | `@better-auth/passkey` | `1.7.18` | `1.7.26` |
| `frontend/package.json` | `@tanstack/react-query` | `5.107.1` | `5.108.0` |
| `frontend/package.json` | `better-auth` | `1.7.18` | `1.7.26` |
| `frontend/package.json` | `lucide-react` | `1.70.0` | `1.75.0` |
| `frontend/package.json` | `recharts` | `3.10.1` | `3.11.0` |
| `frontend/package.json` | `@playwright/test` | `1.65.0` | `1.65.1` |
| `frontend/package.json` | `@testing-library/jest-dom` | `7.0.1` | `8.0.0` |
| `frontend/package.json` | `@testing-library/user-event` | `14.6.8` | `14.6.13` |
| `frontend/package.json` | `oxlint` | `1.93.0` | `1.94.0` |
| `frontend/package.json` | `oxlint-tsgolint` | `7.0.2006` | `7.0.2007` |
| `frontend/package.json` | `react-doctor` | `0.9.22` | `0.9.23` |
| `frontend/package.json` | `vite` | `8.3.7` | `8.3.8` |

Kontrola `bun outdated --recursive` wskazuje wyłącznie nowsze wydanie
`lucide-react`, które nie spełnia jeszcze karencji. Elysia pozostaje na
wybranym kanale 2 RC (`2.0.0-rc.4`). Zależności przechodnie odświeżono
w granicach wymagań pakietów nadrzędnych.

## Python

| Pakiet | Przed | Po |
| --- | --- | --- |
| `fastapi` | `0.162.2` | `0.165.0` |
| `grpcio` | `1.85.1` | `1.85.3` |
| `grpcio-tools` | `1.85.1` | `1.85.3` |
| `transformers` | `5.22.2` | `5.23.0` |

Resolver uv zastosował `exclude-newer = "3 hours"` do zależności
bezpośrednich i przechodnich. Wersje bezpośrednie ponownie przypięto
po rozwiązaniu zależności, a `uv lock --check` potwierdził zgodność.

## Obrazy Docker

| Obraz | Przed | Po |
| --- | --- | --- |
| PostgreSQL | `18.6` / `18.6-alpine3.24` | `18.7` / `18.7-alpine3.24` |
| NGINX | `1.31.8-alpine3.24` | `1.31.9-alpine3.24` |
| RabbitMQ | `4.4.0-management-alpine` | `4.4.1-management-alpine` |
| uv z Python 3.13 | `0.13.7-python3.13-trixie-slim` | `0.13.9-python3.13-trixie-slim` |
| Mailpit | `v1.33.1` | `v1.34.0` |

Dostępność tagów potwierdzono w Docker Hub i manifestach GHCR.
Zaktualizowano też referencje PostgreSQL i RabbitMQ w skryptach integracyjnych
oraz prototypie Drizzle. PostgreSQL pozostaje w stabilnej serii 18;
wydanie 19 RC nie zastępuje stabilnej wersji.

Bun `1.4.4-alpine`, BusyBox `1.38.0-musl`, PgBouncer `v1.26.1-p0`,
OpenTelemetry Collector `0.165.0`, MinIO `RELEASE.2025-10-15T17-29-55Z`
oraz klient MinIO `RELEASE.2025-08-13T08-35-41Z` pozostają aktualne.

## Weryfikacja

- Build WEB oraz kontrola typów i build trzech punktów wejścia backendu.
- Lint WEB i Python; WEB zgłasza dwa ostrzeżenia anti-slop w `tests/support/network.ts`.
- Instalacja Pythona z `uv.lock` w tymczasowym środowisku, kompilacja
  `main.py`, generowanie gRPC i importy zależności bez ładowania modelu.
- Zgodność lockfile i zachowanie wcześniejszych lokalnych zmian dokumentacji.

Nie uruchamiano zestawów testów, buildów obrazów ani stosu Docker Compose.
