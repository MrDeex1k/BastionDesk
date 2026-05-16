# Deployment Guide

Ten dokument opisuje wspierany sposób wdrożenia BastionDesk `1.0.0`.

## Supported Mode

Wersja `1.0.0` wspiera jeden oficjalny model wdrożenia:

- self-hosted Docker Compose,
- pełny start całego stacka z repozytorium,
- nowa instalacja typu `fresh install only`.

Nie jest obecnie wspierane:

- upgrade istniejących instalacji z wcześniejszych rewizji projektu,
- częściowe wdrożenia bez pełnego stacka,
- alternatywne orkiestratory jako oficjalna ścieżka release `1.0`.

## Fresh Install Only

Model `1.0.0` należy traktować jako:

```text
fresh install only
```

To oznacza, że przed wdrożeniem należy przygotować nową bazę danych, nowe wolumeny i nowy zestaw sekretów/certyfikatów. Dokumentacja `1.0.0` nie dostarcza procedury migracji in-place ze starszych środowisk.

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

- [.env.example](/Users/jakubbatycki/KOD/BastionDesk/.env.example)

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

## TLS and Certificates

### Development / Local Compose

Dla lokalnego Compose używany jest generator certyfikatów developerskich:

- [infra/tls/generate-dev-certs.sh](/Users/jakubbatycki/KOD/BastionDesk/infra/tls/generate-dev-certs.sh)

Generuje on lokalne CA i certyfikaty dla:

- `backend`
- `llm_service`
- `database`
- `pgbouncer`
- `storage-1` do `storage-4`

Instrukcja i układ plików są opisane w:

- [tls.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/tls.md)

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

Mapowania hosta używane obecnie przez Compose:

- `4567 -> nginx:8080` - główna aplikacja
- `3333 -> backend:3333` - bezpośredni backend API
- `${POSTGRES_PORT} -> database:${POSTGRES_PORT}` - PostgreSQL
- `${PGBOUNCER_PORT} -> pgbouncer:${PGBOUNCER_PORT}` - PgBouncer
- `9000 -> storage-1:9000` - MinIO API
- `9001 -> storage-1:9001` - MinIO Console

W produkcji warto ograniczyć ekspozycję usług danych i zostawić publicznie tylko reverse proxy albo świadomie kontrolowaną warstwę dostępu.

## Runtime Verification

Po wdrożeniu warto sprawdzić:

1. `docker compose ps` pokazuje zdrowe usługi krytyczne.
2. Frontend otwiera się pod `http://localhost:4567`.
3. Backend odpowiada pod `http://localhost:3333/health`.
4. Upload i download plików działają przez MinIO po HTTPS.
5. Logowanie, tworzenie organizacji i zgłaszanie incydentu przechodzą poprawnie.
6. `postgres-backup` ma status `healthy`.

## Storage

Warstwa storage używa distributed MinIO po HTTPS.

Najważniejsze założenia:

- bucket `S3_BUCKET` jest tworzony automatycznie przez `storage-1`,
- versioning bucketa jest włączany przy bootstrapie,
- backend korzysta z natywnego `Bun.S3Client`,
- upload i download plików zostały zweryfikowane praktycznie w Docker Compose.

Szczegóły znajdują się w:

- [storage.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/storage.md)

## Backups and Restore

Serwis `postgres-backup`:

- wykonuje backup `pg_dump --format=custom --compress=9`,
- uruchamia pierwszy backup po starcie,
- wykonuje backup cyklicznie według `BACKUP_CRON`,
- wysyła dump do MinIO po HTTPS,
- usuwa stare backupy zgodnie z retencją i versioningiem bucketa.

Restore backupu został zweryfikowany praktycznym testem.

Szczegóły znajdują się w:

- [backup.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/backup.md)

## Known Limitations for 1.0.0

- Wspierany jest tylko model `fresh install only`.
- Brak oficjalnej procedury upgrade z wcześniejszych instalacji.
- `llm_service` ma limit pamięci `10GB` w Compose i może mieć zauważalny cold start podczas ładowania modelu.
- Compose eksponuje także porty infrastrukturalne; środowisko publiczne powinno to zawęzić do własnych potrzeb.
- Dokumentacja `1.0.0` opisuje wspierany deployment Compose, a nie pełny matrix środowisk i orkiestratorów.

## Related Documents

- [proxy.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/proxy.md)
- [tls.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/tls.md)
- [storage.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/storage.md)
- [backup.md](/Users/jakubbatycki/KOD/BastionDesk/docs/infrastructure/backup.md)
