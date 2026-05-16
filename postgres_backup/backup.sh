#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_PORT:?POSTGRES_PORT is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${DB_TLS_CA_PATH:?DB_TLS_CA_PATH is required}"
: "${DB_TLS_CERT_PATH:?DB_TLS_CERT_PATH is required}"
: "${DB_TLS_KEY_PATH:?DB_TLS_KEY_PATH is required}"
: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
: "${S3_TLS_CA_PATH:?S3_TLS_CA_PATH is required}"

STATE_DIR="${BACKUP_STATE_DIR:-/state}"
TMP_DIR="${BACKUP_TMP_DIR:-/tmp/backups}"
MC_CERTS_DIR="${MC_CERTS_DIR:-/tmp/mc-certs}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-postgres/daily}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${STATE_DIR}" "${TMP_DIR}" "${MC_CERTS_DIR}/CAs"
cp -f "${S3_TLS_CA_PATH}" "${MC_CERTS_DIR}/CAs/ca.crt"
export MC_CERTS_DIR
export SSL_CERT_FILE="${S3_TLS_CA_PATH}"

export PGHOST="${POSTGRES_HOST}"
export PGPORT="${POSTGRES_PORT}"
export PGUSER="${POSTGRES_USER}"
export PGPASSWORD="${POSTGRES_PASSWORD}"
export PGDATABASE="${POSTGRES_DB}"
export PGSSLMODE="verify-full"
export PGSSLROOTCERT="${DB_TLS_CA_PATH}"
export PGSSLCERT="${DB_TLS_CERT_PATH}"
export PGSSLKEY="${DB_TLS_KEY_PATH}"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
year="$(date -u +%Y)"
month="$(date -u +%m)"
filename="${POSTGRES_DB}-${timestamp}.dump"
tmp_file="${TMP_DIR}/${filename}"
remote_dir="${BACKUP_S3_PREFIX}/${year}/${month}"
remote_path="bastiondesk/${S3_BUCKET}/${remote_dir}/${filename}"

echo "[POSTGRES-BACKUP] Starting backup ${filename}"

pg_dump --format=custom --compress=9 --file="${tmp_file}"

mc alias set bastiondesk "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" >/dev/null
mc cp "${tmp_file}" "${remote_path}"

if [ "${BACKUP_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
	mc rm \
		--recursive \
		--versions \
		--force \
		--older-than "${BACKUP_RETENTION_DAYS}d" \
		"bastiondesk/${S3_BUCKET}/${BACKUP_S3_PREFIX}" >/dev/null 2>&1 || true
fi

date +%s > "${STATE_DIR}/last-success.epoch"
printf '%s\n' "${remote_path}" > "${STATE_DIR}/last-object.txt"

rm -f "${tmp_file}"

echo "[POSTGRES-BACKUP] Backup uploaded to ${remote_path}"
