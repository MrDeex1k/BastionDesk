# Storage (MinIO)

Ten dokument opisuje aktualną konfigurację warstwy storage w BastionDesk.

System używa rozproszonego klastra MinIO jako S3-compatible storage dla:

- screenshotów użytkowników,
- załączników do zgłoszeń,
- raportów analityków,
- sprawozdań końcowych.

## Architektura

Storage działa jako distributed MinIO z czterema węzłami:

- `storage-1`
- `storage-2`
- `storage-3`
- `storage-4`

Każdy węzeł działa w sieci `bastiondesk-net-internal` i używa wspólnego klastra MinIO uruchamianego po HTTPS.

## Porty

Każdy kontener MinIO nasłuchuje wewnątrz sieci Docker na:

- `9000` — API MinIO,
- `9001` — konsola MinIO.

Aktualny `docker-compose.yml` nie publikuje żadnego z tych portów na hoście.
Wszystkie cztery węzły są dostępne wyłącznie w sieci `bastiondesk-net-internal`.

## Uruchamianie

Z katalogu głównego repo:

```bash
docker compose up --build storage-1 storage-2 storage-3 storage-4
```

Wymagane zmienne w `.env`:

- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `S3_BUCKET`

## Runtime klastra

Każdy węzeł startuje MinIO z konfiguracją distributed cluster:

```text
https://storage-1:9000/data
https://storage-2:9000/data
https://storage-3:9000/data
https://storage-4:9000/data
```

Przy starcie:

- tworzony jest katalog `/data/backups/postgres`,
- kopiowane jest lokalne CA do katalogu klienta `mc`,
- ustawiane są `MC_CERTS_DIR` i `SSL_CERT_FILE`,
- wykonywany jest readiness check po HTTPS,
- `storage-1` bootstrapuje bucket przez `mc mb --ignore-existing`,
- `storage-1` włącza automatycznie versioning bucketa przez `mc version enable`.

## TLS

Każdy węzeł ma własny mount certyfikatów:

- `storage-1` -> `./infra/tls/dev/storage-1:/root/.minio/certs:ro`
- `storage-2` -> `./infra/tls/dev/storage-2:/root/.minio/certs:ro`
- `storage-3` -> `./infra/tls/dev/storage-3:/root/.minio/certs:ro`
- `storage-4` -> `./infra/tls/dev/storage-4:/root/.minio/certs:ro`

MinIO działa po HTTPS z lokalnym CA wygenerowanym przez:

- [`infra/tls/generate-dev-certs.sh`](../../infra/tls/generate-dev-certs.sh)

Backend łączy się ze storage przez:

```text
https://storage-1:9000
```

przy użyciu:

- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- globalnego zaufania CA procesu przez `NODE_EXTRA_CA_CERTS` i `SSL_CERT_FILE`.

`S3_REGION` oraz `S3_TLS_CA_PATH` pozostają częścią wspólnej konfiguracji
środowiska i są używane przez narzędzia operacyjne, ale natywny klient
`Bun.S3Client` w backendzie nie przekazuje ich bezpośrednio do konstruktora.

## Healthcheck

Każdy węzeł ma healthcheck oparty o:

```text
https://localhost:9000/minio/health/live
```

z użyciem:

```bash
wget --spider --quiet --no-check-certificate
```

Podczas bootstrapu entrypoint wykonuje też readiness probe:

```text
https://localhost:9000/minio/health/ready
```

## Dane i wolumeny

Każdy węzeł ma własny persistent volume:

- `minio-data-1`
- `minio-data-2`
- `minio-data-3`
- `minio-data-4`

Każdy volume jest montowany jako:

```text
/data
```

## Bucket bootstrap

Tylko `storage-1` działa z:

```text
BOOTSTRAP_NODE=true
```

To oznacza, że tylko ten węzeł:

- wykonuje `mc alias set`,
- tworzy bucket `S3_BUCKET`, jeśli jeszcze nie istnieje,
- włącza versioning dla `S3_BUCKET`.

Pozostałe węzły startują z:

```text
BOOTSTRAP_NODE=false
```

## Backend i ścieżki plików

Backend zapisuje pliki w MinIO jako klucze obiektów. Przykładowa struktura logiczna:

```text
incidents/{incident_id}/
  screenshots/{filename}
  attachments/{filename}
  reports/{filename}
  statements/{filename}
```

To nie są katalogi w sensie POSIX, tylko prefiksy kluczy obiektów.

## Narzędzia w obrazie

Obraz storage jest budowany z:

- `coollabsio/minio` jako runtime serwera,
- `minio/mc` jako źródło klienta `mc`,
- `busybox` jako źródło `wget`.

Zapewnia to:

- `minio` jako serwer,
- `mc` do bootstrapa bucketa,
- `wget` przez `busybox` do healthchecków.

## Rozwiązywanie problemów

### Bucket nie został utworzony

Sprawdź:

- czy `storage-1` wystartował poprawnie,
- czy `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` i `S3_BUCKET` są ustawione,
- logi `storage-1`.

### Backend nie może połączyć się ze storage

Sprawdź:

- czy `S3_ENDPOINT=https://storage-1:9000`,
- czy backend ma zamontowane CA i poprawne `S3_TLS_CA_PATH`,
- czy `storage-1` i `storage-3` mają status `healthy`.

### Healthcheck MinIO nie przechodzi

Sprawdź:

- czy certyfikaty w `infra/tls/dev/storage-*` istnieją,
- czy `generate-dev-certs.sh` był uruchomiony,
- czy MinIO wystartował po HTTPS, a nie po starym HTTP.

### Jednorazowy check wykorzystania dysku

Na hoście:

```bash
docker exec bastiondesk-storage-1 sh -c '\
  export MC_CERTS_DIR=/root/.mc/certs && \
  mkdir -p /root/.mc/certs/CAs && \
  cp -f /root/.minio/certs/CAs/* /root/.mc/certs/CAs/ 2>/dev/null || true && \
  mc alias set minio https://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && \
  mc admin info --json minio' \
  | python3 - <<'PY'
import sys, json
TH = 75
info = json.load(sys.stdin)
max_pct = 0
alerts = []
for srv in info.get("info", {}).get("servers", []):
    for d in srv.get("drives", []):
        total = d.get("totalspace", 0)
        used = d.get("usedspace", 0)
        if total:
            pct = used * 100 // total
            max_pct = max(max_pct, pct)
            if pct >= TH:
                alerts.append((srv.get("endpoint"), pct))
if alerts:
    for ep, pct in alerts:
        print(f"ALERT: {ep} usage {pct}% >= {TH}%")
    sys.exit(1)
print(f"OK: max usage {max_pct}% < {TH}%")
PY
```
