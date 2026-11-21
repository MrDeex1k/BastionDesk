# Deployment Guide

Dokument opisuje uruchomienie bieżącego kodu po fazie 5, z manifestami nadal
w wersji `1.0.3`. Przegląd konfiguracji: 5 listopada 2026. Procedura obejmuje
migracje Core, trwałych zadań i JWKS oraz osobny gateway auth.

## Supported Mode

Bazową ścieżką pozostaje self-hosted Docker Compose i świeża instalacja
całego stosu. Wydany baseline `1.0.3` miał model `fresh install only`.
Bieżący kod ma jawny migrator oraz procedurę przejścia auth z fazy 4 do 5,
ale nie deklaruje obsługi upgrade z dowolnej historycznej rewizji.

Dla nowej instalacji przygotuj nową bazę, wolumeny i sekrety/certyfikaty.
Dla istniejącej instalacji zachowaj sekrety, dane i tożsamości zgodnie z
[instrukcją migracji](../database/migrations.md) i
[runbookiem fazy 5](../backend/phase-5-identity.md); najpierw zweryfikuj
zgodność schematu oraz procedurę na kopii. Generator certyfikatów świeżej
instalacji nie jest procedurą rotacji działającego środowiska.

Częściowe wdrożenia i alternatywne orkiestratory nie są oficjalną ścieżką
wydania.

## What Gets Deployed

Docker Compose uruchamia następujące usługi:

- `database` - PostgreSQL
- `pgbouncer` - pooler połączeń do PostgreSQL
- `postgres-backup` - harmonogram backupów bazy do MinIO
- `storage-1` do `storage-4` - distributed MinIO po HTTPS
- `llm_service` - klasyfikacja incydentów przez lokalny model
- `backend` - NestJS Core/Effect hostowany przez Express, API domenowe po mTLS
- `auth-service` - Elysia 2 + Better Auth, publiczny gateway API i wewnętrzne JWT/JWKS
- `rabbitmq` - dostarczanie zadań przez AMQPS
- `classifier-worker` - relay i trwała klasyfikacja incydentów
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
- `CSRF_SECRET`
- `RABBITMQ_USER` i `RABBITMQ_PASSWORD`
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
- `rabbitmq`
- `storage-1` do `storage-4`

Generator tworzy także oddzielne samopodpisane tożsamości `backend` i
`auth-service` w `identity/` oraz publiczne certyfikaty peerów w
`identity/trust/`. Ta granica mTLS nie korzysta ze wspólnego CA usług danych.

Instrukcja i układ plików są opisane w:

- [tls.md](./tls.md)

### Production

W środowisku produkcyjnym generator developerski nie powinien być traktowany
jako docelowe PKI. Należy przygotować certyfikaty i model zaufania dla:

- PostgreSQL / PgBouncer
- classifier-worker -> `llm_service`
- backend -> MinIO
- MinIO nodes
- worker -> RabbitMQ
- auth-service <-> Core, z przypiętymi tożsamościami peerów według runbooka fazy 5

## Build and Start

Z katalogu głównego repo:

```bash
cp .env.example .env
sh infra/tls/generate-dev-certs.sh
docker compose build
docker compose up -d --wait database
```

Przed uruchomieniem Core, auth i workera wykonaj `plan` i `apply` zgodnie z
[instrukcją migracji](../database/migrations.md), również dla świeżej bazy.
Core i worker wymagają `0001_core_operations` oraz `0002_durable_jobs`; bez nich
kończą start błędem `CORE_MIGRATIONS_REQUIRED`. Auth wymaga tabeli `jwks`
z `0003_auth_jwks`. Integracja Wazuh wymaga tabeli `wazuh_sources`
z `0004_wazuh_sources`. Migrator jest uruchamiany przez operatora.

Migrator potrzebuje bezpośredniego połączenia do `database:5432` oraz własnego
certyfikatu klienta zgodnego z użytkownikiem PostgreSQL. Przykład uruchomienia
w sieci Compose po przygotowaniu chronionego pliku `.env.migrator` i certyfikatów:

```bash
docker compose run --rm --no-deps --env-from-file .env.migrator \
  --volume /absolute/path/migrator:/certs/migrator:ro \
  backend bun src/migrations/cli.ts plan
# Po weryfikacji planu uruchom to samo polecenie z apply zamiast plan.
docker compose up -d
```

Plik migratora zawiera `MIGRATION_DATABASE_URL`, `MIGRATION_TLS_CA`,
`MIGRATION_TLS_CERT` i `MIGRATION_TLS_KEY` (nazwy sprawdź w instrukcji migracji).
Certyfikaty muszą być czytelne dla użytkownika kontenera. Nie zapisuj sekretów
w repozytorium.

Generator nie wczytuje automatycznie pliku `.env`. Jeśli zmienisz
`POSTGRES_USER` względem wartości domyślnej, przekaż tę samą nazwę podczas
generowania certyfikatu klienta PgBouncera:

```bash
POSTGRES_USER=<wartość-z-.env> sh infra/tls/generate-dev-certs.sh
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

Całe `/api` i `/api/*` trafia przez NGINX do `auth-service:3340`. Gateway
przekazuje żądania domenowe do `backend:3333` przez mTLS; Core pobiera JWKS
i świeżą tożsamość z wewnętrznego listenera auth na `3443`.
Szczegóły: [runbook tożsamości](../backend/phase-5-identity.md) oraz
[sekrety RabbitMQ, telemetria i replay](../backend/messaging-runbook.md).

## Runtime Verification

Po wdrożeniu warto sprawdzić:

1. `docker compose ps` pokazuje zdrowe usługi krytyczne.
2. Frontend otwiera się pod `http://localhost:4567`.
3. Logowanie i Better Auth działają przez publiczny origin `http://localhost:4567`.
4. Upload i download plików działają przez MinIO po HTTPS.
5. Zapis zgłoszenia kończy się bez oczekiwania na inferencję; działający worker
   następnie zapisuje kategorię. Sondy Core/auth nie potwierdzają pracy workera.
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

## Wazuh Indexer

Opcjonalna integracja łączy backend z zewnętrznym Indexerem po HTTPS.
Kontener backendu potrzebuje trasy do prywatnego adresu Indexera
i pliku z kluczem szyfrowania wskazanego przez `WAZUH_SOURCE_KEY_FILE`.
Po zastosowaniu migracji skonfiguruj źródło w zakładce **Alerty Wazuh**
w panelu administratora. Zmianę `WAZUH_REFRESH_INTERVAL_SECONDS` wprowadź
przez ponowne uruchomienie backendu z nowym środowiskiem.
[Klucz, CA, uprawnienia Indexera i test](../integrations/wazuh-discovery.md#wdrożenie-etapu-6).

## Backups and Restore

Serwis `postgres-backup`:

- wykonuje backup `pg_dump --format=custom --compress=9`,
- uruchamia pierwszy backup po starcie,
- wykonuje backup cyklicznie według `BACKUP_CRON`,
- wysyła dump do MinIO po HTTPS,
- usuwa stare backupy zgodnie z retencją i versioningiem bucketa.

Restore backupu został zweryfikowany praktycznym testem. Dla instalacji z Wazuh
zachowaj klucz szyfrowania źródeł w magazynie sekretów. Dump PostgreSQL zawiera
zaszyfrowaną konfigurację. Kopie samych alertów wykonuje instalacja Wazuh.

Szczegóły znajdują się w:

- [backup.md](./backup.md)

## Known Limitations

- Świeża instalacja Compose pozostaje bazową ścieżką wdrożenia.
- Migracje i runbook fazy 5 obejmują określone schematy; nie gwarantują upgrade
  dowolnej wcześniejszej instalacji.
- Start Core i workera w Compose zależy od zdrowego LLM; obsługa awarii modelu
  w działającym workflow nie usuwa tego warunku pierwszego uruchomienia.
- `llm_service` ma limit pamięci `10GB` w Compose i może mieć zauważalny cold start podczas ładowania modelu.
- Publiczny dostęp jest domyślnie ograniczony do reverse proxy; bezpośrednie debugowanie usług wewnętrznych z hosta wymaga tymczasowego wystawienia portów lub wejścia do sieci Docker.
- Dokumentacja `1.0.3` opisuje wspierany deployment Compose, a nie pełny matrix środowisk i orkiestratorów.

## Related Documents

- [Release 1.0.3](../releases/v1.0.3.md)
- [proxy.md](./proxy.md)
- [tls.md](./tls.md)
- [storage.md](./storage.md)
- [backup.md](./backup.md)
