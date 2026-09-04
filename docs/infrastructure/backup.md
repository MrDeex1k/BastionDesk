# PostgreSQL Backups

Ten dokument opisuje serwis `postgres-backup` używany do automatycznego wykonywania backupów PostgreSQL i wysyłania ich do MinIO.

## Cel

Serwis:

- wykonuje backup bazy `PostgreSQL`,
- zapisuje go jako obiekt w MinIO,
- uruchamia pierwszy backup przy starcie kontenera,
- wykonuje kolejne backupy cyklicznie według harmonogramu cron,
- usuwa stare backupy zgodnie z retencją, w tym wszystkie ich wersje w bucketcie z włączonym versioningiem.

## Architektura

Serwis `postgres-backup` działa jako osobny kontener w Docker Compose.

Kontener działa jako użytkownik `postgres`, a nie jako `root`.

Nie korzysta z `PgBouncer`. Łączy się bezpośrednio do:

- `database`

Jest to świadoma decyzja, ponieważ `pg_dump` powinien pracować na bezpośrednim połączeniu z PostgreSQL, a nie przez pooler.

## Harmonogram

Domyślnie backup jest wykonywany:

```text
codziennie o 03:00 UTC
```

Zmienna:

```text
BACKUP_CRON=0 3 * * *
```

Przy starcie kontenera wykonywany jest też natychmiastowy backup:

```text
BACKUP_RUN_ON_START=true
```

## Format backupu

Backup jest wykonywany przez:

```text
pg_dump --format=custom --compress=9
```

Dzięki temu:

- plik jest skompresowany,
- restore można wykonywać przez `pg_restore`,
- format jest wygodniejszy niż zwykły dump SQL dla większych baz.

## Lokalizacja w MinIO

Backupy trafiają do bucketa:

- `S3_BUCKET`

pod prefiksem:

```text
postgres/daily/{YYYY}/{MM}/
```

Przykładowa ścieżka:

```text
postgres/daily/2026/05/bastiondesk-2026-05-14T03-00-00Z.dump
```

Prefiks można zmienić przez:

```text
BACKUP_S3_PREFIX
```

## Retencja

Domyślnie serwis usuwa backupy starsze niż:

```text
30 dni
```

Zmienna:

```text
BACKUP_RETENTION_DAYS=30
```

Uwaga:

- versioning bucketa MinIO pozostaje włączony,
- retencja backupów usuwa stare obiekty przez `mc rm --versions`, aby kasować także ich historyczne wersje,
- versioning chroni przed przypadkowym nadpisaniem lub usunięciem obiektów.

## TLS i uwierzytelnianie

Serwis korzysta z:

- CA dla PostgreSQL i MinIO z `infra/tls/dev/ca`
- certyfikatu klienta PostgreSQL z `infra/tls/dev/pgbouncer/client.crt`
- klucza klienta PostgreSQL z `infra/tls/dev/pgbouncer/client.key`

Połączenie do PostgreSQL działa po:

```text
hostssl + clientcert=verify-full
```

Połączenie do MinIO działa po:

```text
HTTPS
```

## Healthcheck

Serwis zapisuje timestamp ostatniego poprawnego backupu w:

```text
/state/last-success.epoch
```

Healthcheck uznaje serwis za zdrowy, jeśli ostatni sukces nie jest starszy niż:

```text
BACKUP_MAX_AGE_SECONDS=129600
```

czyli domyślnie `36h`.

## Ważne zmienne środowiskowe

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DB_TLS_CA_PATH`
- `DB_TLS_CERT_PATH`
- `DB_TLS_KEY_PATH`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_TLS_CA_PATH`
- `BACKUP_CRON`
- `BACKUP_RUN_ON_START`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_S3_PREFIX`
- `BACKUP_MAX_AGE_SECONDS`

## Restore

Przykładowy restore wymaga:

1. pobrania wybranego pliku dump z MinIO,
2. uruchomienia pustej lub przygotowanej docelowej bazy,
3. odtworzenia przez `pg_restore`.

Przykładowo:

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --dbname "postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=verify-full" \
  bastiondesk-2026-05-14T03-00-00Z.dump
```

Powtarzalny test fazy 0 uruchamia się poleceniem:

```bash
bun run test:baseline:restore
```

Test tworzy oznaczone fixture dwóch organizacji, wymusza backup, pobiera dump z
MinIO i odtwarza go do tymczasowego PostgreSQL 18 na `tmpfs`, bez dostępu do
sieci. Następnie porównuje liczności wszystkich tabel publicznych, relacje
tenantów, incydenty, ścieżki plików i audyt. Kontener oraz fixture źródłowe są
usuwane także po błędzie. Test wykonuje również kontrolowaną próbę uploadu do
nieistniejącego bucketa i potwierdza, że znacznik sukcesu nie jest aktualizowany,
a przeterminowany stan nie przechodzi healthchecku.

Pierwszy wersjonowany wynik dla baseline'u `1.0.3` znajduje się w
[`../baseline/1.0.3-restore.md`](../baseline/1.0.3-restore.md).
