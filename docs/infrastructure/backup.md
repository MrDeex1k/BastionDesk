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
MinIO i odtwarza go do tymczasowego PostgreSQL na `tmpfs`, bez dostępu do
sieci. Następnie porównuje liczności wszystkich tabel publicznych, relacje
tenantów, incydenty, ścieżki plików i audyt. Kontener oraz fixture źródłowe są
usuwane także po błędzie. Test wykonuje również kontrolowaną próbę uploadu do
nieistniejącego bucketa i potwierdza, że znacznik sukcesu nie jest aktualizowany,
a przeterminowany stan nie przechodzi healthchecku.

Pierwszy wersjonowany wynik dla baseline'u `1.0.3` znajduje się w
[`../baseline/1.0.3-restore.md`](../baseline/1.0.3-restore.md).

## Aktualizacja PostgreSQL 18 do 19

Serwer i klient backupu w Compose mają wersję 19.0. Dane PostgreSQL 18
przenieś na nowy wolumen przez logiczny dump i restore. Przećwicz procedurę
na kopii i zaplanuj okno serwisowe. Zachowaj dotychczasowy wolumen, obraz,
konfigurację, certyfikaty i dostęp do MinIO. Jeśli instalacja używa dodatkowych
ról lub tablespace'ów, przenieś też obiekty globalne z `pg_dumpall --globals-only`.

1. Na dotychczasowej rewizji zatrzymaj stos i uruchom samą bazę 18. Zapisz
   definicję bazy i dump poza jej wolumenem, a następnie zatrzymaj serwer.
   Odtworzenie do istniejącej bazy za pomocą `pg_restore --single-transaction`
   pomija ustawienia, komentarz i uprawnienia na poziomie bazy.

   ```sh
   docker compose stop
   docker compose up -d --wait database
   umask 077
   docker compose exec -T database sh -ec \
     'exec pg_dump --schema-only --create -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     > bastiondesk-pg18-schema.sql
   docker compose exec -T database sh -ec \
     'exec pg_dump -Fc -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     > bastiondesk-pg18.dump
   docker compose stop database
   ```

2. Na rewizji z PostgreSQL 19 utwórz obok `docker-compose.yml` pusty katalog
   `empty-postgres-init` oraz plik `compose.pg19.yml` z nową, unikalną dla
   instalacji nazwą wolumenu. Pusty katalog wyłącza inicjalizację schematu przez
   skrypty startowe. Schemat odtworzy dump.

   ```yaml
   services:
     database:
       volumes:
         - ./empty-postgres-init:/docker-entrypoint-initdb.d:ro
   volumes:
     postgres-data:
       name: bastiondesk-postgres-19-data
   ```

3. Uruchom samą bazę 19 i odtwórz dump do pustej bazy. Zachowaj wartości
   `POSTGRES_USER`, `POSTGRES_DB` i konfigurację TLS z poprzedniej instalacji.
   Jeśli używasz niestandardowego kodowania lub reguł porównywania tekstu, utwórz
   docelową bazę z ustawieniami zgodnymi ze źródłem przed odtworzeniem.

   ```sh
   docker compose -f docker-compose.yml -f compose.pg19.yml up -d --build --wait database
   docker compose -f docker-compose.yml -f compose.pg19.yml exec -T database sh -ec \
     'exec pg_restore --single-transaction -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < bastiondesk-pg18.dump
   docker compose -f docker-compose.yml -f compose.pg19.yml exec -T database sh -ec \
     'exec vacuumdb --analyze-in-stages -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```

4. Przed uruchomieniem aplikacji odtwórz ustawienia i uprawnienia bazy.
   Z `bastiondesk-pg18-schema.sql` skopiuj do `bastiondesk-pg19-db-settings.sql`
   polecenia odtwarzające ustawienia, komentarz i uprawnienia bazy
   (`ALTER DATABASE ... SET`, `ALTER ROLE ... IN DATABASE ... SET`,
   `COMMENT ON DATABASE`, `GRANT` i `REVOKE` na bazie). Zachowaj ich kolejność,
   aby odtworzyć także ograniczenia takie jak cofnięcie `CONNECT` dla `PUBLIC`.
   Przejrzyj plik i zastosuj go, jeśli zawiera polecenia:

   ```sh
   docker compose -f docker-compose.yml -f compose.pg19.yml exec -T database sh -ec \
     'exec psql -X -v ON_ERROR_STOP=1 --single-transaction -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
     < bastiondesk-pg19-db-settings.sql
   ```

5. Przygotuj `.env.migrator` i certyfikaty zgodnie z
   [instrukcją dla Compose](deploy.md#build-and-start). Uruchom migrator
   wewnątrz sieci Compose, używając pliku wskazującego wolumen PostgreSQL 19.

   ```sh
   docker compose -f docker-compose.yml -f compose.pg19.yml run --rm --no-deps --build \
     --env-from-file .env.migrator \
     --volume /absolute/path/migrator:/certs/migrator:ro \
     backend bun src/migrations/cli.ts plan
   ```

   Po sprawdzeniu planu uruchom to samo polecenie z `apply` i zweryfikuj dane.
   Uruchom stos z tym samym plikiem `compose.pg19.yml`, przebuduj usługę backupu
   i potwierdź nowy dump oraz jego odtworzenie. Używaj tego pliku przy kolejnych
   wdrożeniach, aby wskazywać wolumen PostgreSQL 19.

Przed wznowieniem zapisów możesz wrócić do starej rewizji i konfiguracji
Compose wskazującej wolumen PostgreSQL 18. Po wznowieniu zapisów stary
wolumen nie zawiera nowych zmian, więc powrót wymaga ich uzgodnienia.
