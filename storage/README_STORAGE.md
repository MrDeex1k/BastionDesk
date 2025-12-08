# Storage (MinIO)

Ten serwis dostarcza S3‑kompatybilne storage w oparciu o oficjalny obraz MinIO.

## Uruchamianie
- Zdefiniuj w `.env` (w katalogu głównym) co najmniej `MINIO_ROOT_USER` i `MINIO_ROOT_PASSWORD`.
- Uruchom: `docker-compose up --build storage`.
- API MinIO jest dostępne na porcie hosta `9000`. Konsola MinIO działa na porcie `9001`.
- Przy starcie tworzony jest folder `/data/backups/postgres` na backupy PostgreSQL (współdzielony w wolumenie).

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
- W `docker-compose.yml` zdefiniowany jest healthcheck oparty o `curl http://localhost:9000/minio/health/live`.