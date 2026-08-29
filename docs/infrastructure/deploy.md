# Deployment Guide

Ten dokument opisuje wspierany sposób wdrożenia BastionDesk `1.0.3`.

## Supported Mode

Wersja `1.0.3` wspiera jeden oficjalny model wdrożenia:

- self-hosted Docker Compose,
- pełny start całego stacka z repozytorium,
- nowa instalacja typu `fresh install only`.

Nie jest obecnie wspierane:

- upgrade istniejących instalacji z wcześniejszych rewizji projektu,
- częściowe wdrożenia bez pełnego stacka,
- alternatywne orkiestratory jako oficjalna ścieżka release `1.0`.

## Fresh Install Only

Model `1.0.3` należy traktować jako:

```text
fresh install only
```

To oznacza, że przed wdrożeniem należy przygotować nową bazę danych, nowe wolumeny i nowy zestaw sekretów/certyfikatów. Dokumentacja `1.0.3` nie dostarcza procedury migracji in-place ze starszych środowisk.

## What Gets Deployed

Docker Compose uruchamia następujące usługi:

- `database` - PostgreSQL
- `pgbouncer` - pooler połączeń do PostgreSQL
- `postgres-backup` - harmonogram backupów bazy do MinIO
- `storage-1` do `storage-4` - distributed MinIO po HTTPS
- `llm_service` - klasyfikacja incydentów przez lokalny model
- `backend` - API i Better Auth
- `frontend` - statyczny build SPA
- `nginx` - główny reverse proxy i punkt wejścia do aplikacji

## Prerequisites

Minimalnie potrzebujesz:

- Docker i Docker Compose,
- lokalnej kopii repozytorium,
- przygotowanego pliku `.env`,
- wygenerowanych certyfikatów TLS/mTLS,
- zasobów hosta wystarczających do uruchomienia `llm_service`.

`llm_service` ma w Compose ustawiony limit pamięci `10GB`, więc host powinien mieć wyraźny zapas ponad tę wartość.

## Environment Configuration

Punktem wyjścia jest:

- [`.env.example`](../../.env.example)

Przed uruchomieniem skopiuj go do `.env` i uzupełnij co najmniej:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `BETTER_AUTH_SECRET`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_APP_PASSWORD`
- `EMAIL_FROM_ADDRESS`

W lokalnym Compose domyślne adresy wewnętrzne są już przygotowane, m.in.:

- `S3_ENDPOINT=https://storage-1:9000`
- `LLM_GRPC_TARGET=llm_service:8443`
- `PGBOUNCER_HOST=pgbouncer`
- `FRONTEND_URL=http://localhost:4567`

Dla frontendu i Better Auth lokalny model uruchomienia zakłada jeden publiczny origin:

- `BETTER_AUTH_URL=http://localhost:4567`
- `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4567`

## TLS and Certificates

### Development / Local Compose

Dla lokalnego Compose używany jest generator certyfikatów developerskich:

- [`infra/tls/generate-dev-certs.sh`](../../infra/tls/generate-dev-certs.sh)

Generuje on lokalne CA i certyfikaty dla:

- `backend`
- `llm_service`
- `database`
- `pgbouncer`
- `storage-1` do `storage-4`

Instrukcja i układ plików są opisane w:

- [tls.md](./tls.md)

### Production

W środowisku produkcyjnym generator developerski nie powinien być traktowany jako docelowe PKI. Należy podstawić własne certyfikaty i własny zaufany CA dla:

- PostgreSQL / PgBouncer
- backend -> `llm_service`
- backend -> MinIO
- MinIO nodes

## Build and Start

Z katalogu głównego repo:

```bash
cp .env.example .env
sh infra/tls/generate-dev-certs.sh
docker compose build
docker compose up -d
```

Po starcie stan usług sprawdzisz przez:

```bash
docker compose ps
```

## Entry Points and Ports

Główny punkt wejścia dla użytkownika:

```text
http://localhost:4567
```

Mapowanie hosta używane obecnie przez Compose:

- `4567 -> nginx:8080` - główna aplikacja

Pozostałe usługi są dostępne wyłącznie wewnątrz sieci Docker Compose. Dzięki temu użytkownik końcowy korzysta z jednego publicznego entrypointu, a backend, baza, PgBouncer, LLM i storage nie są bezpośrednio publikowane na hoście.

## Runtime Verification

Po wdrożeniu warto sprawdzić:

1. `docker compose ps` pokazuje zdrowe usługi krytyczne.
2. Frontend otwiera się pod `http://localhost:4567`.
3. Logowanie i Better Auth działają przez publiczny origin `http://localhost:4567`.
4. Upload i download plików działają przez MinIO po HTTPS.
5. Zgłaszanie incydentu i klasyfikacja LLM przechodzą poprawnie.
6. `postgres-backup` ma status `healthy`.

## Storage

Warstwa storage używa distributed MinIO po HTTPS.

Najważniejsze założenia:

- bucket `S3_BUCKET` jest tworzony automatycznie przez `storage-1`,
- versioning bucketa jest włączany przy bootstrapie,
- backend korzysta z natywnego `Bun.S3Client`,
- upload i download plików zostały zweryfikowane praktycznie w Docker Compose.

Szczegóły znajdują się w:

- [storage.md](./storage.md)

## Backups and Restore

Serwis `postgres-backup`:

- wykonuje backup `pg_dump --format=custom --compress=9`,
- uruchamia pierwszy backup po starcie,
- wykonuje backup cyklicznie według `BACKUP_CRON`,
- wysyła dump do MinIO po HTTPS,
- usuwa stare backupy zgodnie z retencją i versioningiem bucketa.

Restore backupu został zweryfikowany praktycznym testem.

Szczegóły znajdują się w:

- [backup.md](./backup.md)

## Known Limitations for 1.0.3

- Wspierany jest tylko model `fresh install only`.
- Brak oficjalnej procedury upgrade z wcześniejszych instalacji.
- `llm_service` ma limit pamięci `10GB` w Compose i może mieć zauważalny cold start podczas ładowania modelu.
- Publiczny dostęp jest domyślnie ograniczony do reverse proxy; bezpośrednie debugowanie usług wewnętrznych z hosta wymaga tymczasowego wystawienia portów lub wejścia do sieci Docker.
- Dokumentacja `1.0.3` opisuje wspierany deployment Compose, a nie pełny matrix środowisk i orkiestratorów.

## Related Documents

- [Release 1.0.3](../releases/v1.0.3.md)
- [proxy.md](./proxy.md)
- [tls.md](./tls.md)
- [storage.md](./storage.md)
- [backup.md](./backup.md)
