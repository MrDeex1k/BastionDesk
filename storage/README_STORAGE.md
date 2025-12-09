# Storage (MinIO)

Ten serwis dostarcza S3‑kompatybilne storage w oparciu o oficjalny obraz MinIO.

## Uruchamianie (distributed, 4 węzły)
- W `.env` ustaw: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_BUCKET`.
- Start storage: `docker-compose up --build storage-1 storage-2 storage-3 storage-4`
  - Tylko `storage-1` wystawia porty hosta: API `9000`, konsola `9001`.
  - Każdy węzeł startuje z komendą `minio server http://storage-{1...4}:9000/data`.
- Przy starcie:
  - tworzony jest folder `/data/backups/postgres` w każdym węźle,
  - `storage-1` (BOOTSTRAP_NODE=true) wykona `mc alias set ...`, **utworzy bucket** `S3_BUCKET` i **włączy wersjonowanie** (`mc version enable`).
- W obrazie jest `wget` (healthcheck) oraz `mc` (bootstrap bucketu).

## Dane i wolumeny
- Wolumeny: `minio-data-1`..`minio-data-4`, każdy montowany jako `/data` w odpowiadającym węźle.
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
- Backend łączy się z MinIO pod `http://storage-1:9000` (sieć `bastiondesk-net-internal`); dowolny węzeł klastra może obsłużyć ruch.
- Region (`S3_REGION`) może pozostać dowolny (np. `us-east-1`), wymagany tylko przez klienta S3 do podpisywania.

## Wersjonowanie
- Wersjonowanie wymaga distributed/erasure-coded setup (spełnione przy 4 węzłach).
- Wersjonowanie bucketa `S3_BUCKET` włącza się automatycznie na `storage-1` podczas bootstrapu (polecenie `mc version enable`).

## Check wykorzystania dysku (>75%)
- Jednorazowy check (na hoście, z użyciem `mc` dostępnego w `storage-1`):
  ```
  docker exec bastiondesk-storage-1 sh -c '\
    mc alias set minio http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && \
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