# Aktualizacja zależności — 8 września 2026

Aktualizacja obejmuje root, backend i frontend przez Bun oraz serwis Python
przez UV. Zachowano dokładne wersje w manifestach, jeden `bun.lock`,
`llm_service/uv.lock` i istniejącą 24-godzinną karencję. „Najnowsze” oznacza
wersje dopuszczone przez tę politykę oraz wspieraną linię Python 3.13 / CPU.
Nie zmieniono architektury ani rodziny obrazów na warianty preview.

## Bun i npm

`bun run deps:update` używa teraz `sfw bun update --recursive --latest
--minimum-release-age 86400`, dzięki czemu obejmuje oba workspace’y.
Aktualizacja obejmuje również zależności przechodnie. Najważniejsze zmiany:

| Zależność | Przed | Po |
| --- | --- | --- |
| Bun / obrazy aplikacji | 1.4.1 | 1.4.2 |
| Better Auth i Passkey | 1.7.2 | 1.7.3 |
| Nodemailer | 9.0.6 | 10.0.0 |
| Zod | 4.4.3 | 4.5.4 |
| Base UI | 1.7.0 | 1.8.0 |
| TanStack Router | 1.170.32 | 1.170.33 |
| Lucide React | 1.35.0 | 1.41.0 |
| Oxlint / Oxfmt | 1.80.0 / 0.65.0 | 1.81.0 / 0.66.0 |

Dodano zależności testowe React Testing Library, happy-dom, jest-dom,
user-event i Playwright. Pełne wersje określają manifesty i lockfile.
`bun outdated --latest --recursive` należy interpretować razem z karencją;
oznaczenie nowszej publikacji nie oznacza zgody na ominięcie tej polityki.

Nodemailer 10 dostarcza własne typy: usunięto `@types/nodemailer`, a sender
korzysta z publicznych eksportów pakietu. Nowe typy Expressa dopuszczają
tablice w parametrach tras; istniejąca walidacja teraz jawnie wymaga tekstu.
Usunięto lokalne rozszerzenie typów QUERY, ponieważ deklaruje je już pakiet
upstream. Rejestracja tras sprawdza dostępność tej metody w runtime.

## Python / UV

| Zależność | Przed | Po |
| --- | --- | --- |
| FastAPI | 0.141.1 | 0.141.1 |
| grpcio / grpcio-tools | 1.83.0 | 1.83.1 |
| huggingface-hub | 1.27.0 | 1.30.0 |
| torch | 2.13.0 | 2.14.0 |
| transformers | 5.14.1 | 5.16.1 |
| uvicorn | 0.52.1 | 0.52.4 |

Pozostaje jawny indeks [PyTorch CPU](https://download.pytorch.org/whl/cpu)
i Python `>=3.13,<3.14`. Zaktualizowano piny przez `uv add --no-sync` oraz
rozwiązanie zależności. `uv lock --upgrade --dry-run --directory llm_service`
nie wykazało dalszych zmian dopuszczonych przez konfigurację.

## Obrazy Docker

Tagi sprawdzono w rejestrach wydawców i oficjalnych wydaniach:

| Obraz | Wynik |
| --- | --- |
| [oven/bun](https://hub.docker.com/r/oven/bun/tags) | 1.4.2-alpine, aktualizacja obu builderów/aplikacji |
| [astral-sh/uv](https://github.com/astral-sh/uv/releases) | 0.12.10-python3.13-trixie-slim, oba etapy LLM |
| [Mailpit](https://github.com/axllent/mailpit/releases) | v1.31.1, testowy SMTP |
| [NGINX](https://hub.docker.com/_/nginx/tags) | 1.31.5-alpine3.24, bez zmian |
| [PostgreSQL](https://hub.docker.com/_/postgres/tags) | 18.6 i 18.6-alpine3.24, bez zmian |
| [BusyBox](https://hub.docker.com/_/busybox/tags) | 1.38.0-musl, bez zmian |
| [PgBouncer](https://hub.docker.com/r/edoburu/pgbouncer/tags) | v1.25.2-p0, bez zmian |
| [MinIO Client](https://hub.docker.com/r/minio/mc/tags) | RELEASE.2025-08-13T08-35-41Z, bez zmian |
| [MinIO](https://hub.docker.com/r/coollabsio/minio/tags) | RELEASE.2025-10-15T17-29-55Z, bez zmian |

## Zgodność Better Auth

[Oficjalna instrukcja Better Auth 1.7](https://better-auth.com/docs/guides/1-7-upgrade-guide)
opisuje przywrócenie identyfikacji konta przez `providerId/accountId` w 1.7.3.
Nowy init SQL jest zgodny z tym kontraktem. Historyczny skrypt `001` pozostaje
zapisem poprzedniego upgrade’u; nie należy uruchamiać go na nowej bazie 1.7.3.

Dla bazy już zmienionej przez 1.7.2 przygotowano
`database/migrations/002-better-auth-1.7.3-provider-identity.sql`. Przed
uruchomieniem nowego backendu należy na kopii bazy sprawdzić backup/restore,
wykonać skrypt przez `psql -X -v ON_ERROR_STOP=1 -f ...` oraz zweryfikować
logowanie i rejestrację. W czasie migracji należy zatrzymać zapisy auth.
Skrypt blokuje tabelę w transakcji, zachowuje historyczne `issuer` i odrzuca
duplikaty `providerId/accountId` wymagające ręcznego rozstrzygnięcia.
Powtórzenie na zgodnym schemacie jest bezpieczne. Nie wykonano go na istniejącej
instalacji użytkownika. Wspierany model wydania nadal pozostaje fresh install;
pełny mechanizm migracji należy do fazy 2.

Test E2E uruchamia ten skrypt dwukrotnie na osobnym schemacie PostgreSQL,
sprawdza zachowanie historycznego konta i odrzucenie duplikatu, po czym usuwa
schemat. Zmiana `creatorRole` na `admin` zapewnia zgodność standardowego API
tworzenia organizacji z rolami aplikacji.

## Weryfikacja

Wykonano kontrole typów, lint i format, testy backendu i komponentów, build
aplikacji oraz build obrazów LLM i backupu z odświeżeniem obrazów bazowych.
Nowy stos PyTorch/Transformers wykonał prawdziwą inferencję Gemma z istniejącego
cache tylko do odczytu, w jednorazowym kontenerze bez sieci: wynik `Żółty`.
Wiadomości auth w E2E przechodzą przez rzeczywisty Nodemailer i testowy Mailpit.
Macierz przeglądarek i ograniczenia CI opisuje [kontrakt fazy 1](phase-1-ui-e2e.md).
