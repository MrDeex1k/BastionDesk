# Storage (MinIO)

Ten serwis dostarcza S3‑kompatybilne storage w oparciu o oficjalny obraz MinIO.

## Uruchamianie
- W `.env` ustaw: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_BUCKET` (nazwa bucketu do automatycznego utworzenia).
- Uruchom: `docker-compose up --build storage`.
- API MinIO: port hosta `9000`; konsola: port `9001`.
- Przy starcie:
  - tworzony jest folder `/data/backups/postgres` w wolumenie,
  - wykonywana jest konfiguracja `mc` i **automatyczne utworzenie bucketa** `S3_BUCKET` (`mc mb --ignore-existing minio/$S3_BUCKET`).
- W obrazie jest `wget` (healthcheck) oraz `mc` (bootstrap bucketu).

## Dane i wolumeny
- Wolumen `minio-data` jest montowany pod `/data` w kontenerze.
- Przykładowa struktura dla incydentów:
  ```
  /data/incidents/{incident_id}/
    element1
    element2
    element3
  ```

## Healthcheck
- W `docker-compose.yml` zdefiniowany jest healthcheck oparty o `wget --spider http://localhost:9000/minio/health/live`.

## Backend (S3 endpoint)
- Backend łączy się z MinIO pod `http://storage:9000` (sieć `bastiondesk-net-internal`).
- Region (`S3_REGION`) może pozostać dowolny (np. `us-east-1`), wymagany tylko przez klienta S3 do podpisywania.