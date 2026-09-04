#!/bin/sh
set -eu

BASELINE_RUN_ID="${BASELINE_RUN_ID:-$(date -u +%Y%m%d%H%M%S)-$$}"
case "${BASELINE_RUN_ID}" in
	*[!a-zA-Z0-9_-]* | "")
		printf '%s\n' "[baseline-restore] FAIL: BASELINE_RUN_ID may contain only letters, digits, _ and -" >&2
		exit 1
		;;
esac

BASELINE_TMP_DIR="$(mktemp -d)"
BASELINE_DUMP_FILE="${BASELINE_TMP_DIR}/baseline.dump"
BASELINE_SOURCE_COUNTS="${BASELINE_TMP_DIR}/source-counts.txt"
BASELINE_RESTORE_COUNTS="${BASELINE_TMP_DIR}/restore-counts.txt"
BASELINE_SOURCE_FIXTURE="${BASELINE_TMP_DIR}/source-fixture.txt"
BASELINE_RESTORE_FIXTURE="${BASELINE_TMP_DIR}/restore-fixture.txt"
BASELINE_TABLES="${BASELINE_TMP_DIR}/tables.txt"
BASELINE_INCIDENT_A="$(bun -e 'process.stdout.write(crypto.randomUUID())')"
BASELINE_INCIDENT_B="$(bun -e 'process.stdout.write(crypto.randomUUID())')"
BASELINE_RESTORE_PASSWORD="$(bun -e 'process.stdout.write(crypto.randomUUID() + crypto.randomUUID())')"
BASELINE_RESTORE_CONTAINER="bastiondesk-phase0-restore-${BASELINE_RUN_ID}"
BASELINE_FIXTURE_INSERTED=false
BASELINE_RESTORE_STARTED=false

fail() {
	printf '%s\n' "[baseline-restore] FAIL: $1" >&2
	exit 1
}

source_psql() {
	docker compose exec -T database sh -c \
		'exec psql -X --set ON_ERROR_STOP=1 --port "$POSTGRES_PORT" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "$1"' \
		_ "$1" < /dev/null
}

restore_psql() {
	docker exec "${BASELINE_RESTORE_CONTAINER}" \
		psql -X --set ON_ERROR_STOP=1 --username restore --dbname restore --tuples-only --no-align --command "$1"
}

cleanup_source_fixture() {
	docker compose exec -T database sh -c \
		'exec psql -X --set ON_ERROR_STOP=1 --port "$POSTGRES_PORT" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=run_id="$1"' \
		_ "${BASELINE_RUN_ID}" <<'SQL'
BEGIN;
DELETE FROM organization
WHERE id IN ('baseline-' || :'run_id' || '-org-a', 'baseline-' || :'run_id' || '-org-b');
DELETE FROM "user"
WHERE id LIKE 'baseline-' || :'run_id' || '-%';
COMMIT;
SQL
}

cleanup() {
	set +e
	if [ "${BASELINE_RESTORE_STARTED}" = true ]; then
		docker rm --force "${BASELINE_RESTORE_CONTAINER}" >/dev/null 2>&1
	fi
	if [ "${BASELINE_FIXTURE_INSERTED}" = true ]; then
		cleanup_source_fixture >/dev/null 2>&1
	fi
	rm -rf -- "${BASELINE_TMP_DIR}"
}
trap cleanup EXIT INT TERM

"$(dirname "$0")/smoke-compose.sh" >/dev/null

docker compose exec -T database sh -c \
	'exec psql -X --set ON_ERROR_STOP=1 --port "$POSTGRES_PORT" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=run_id="$1" --set=incident_a="$2" --set=incident_b="$3"' \
	_ "${BASELINE_RUN_ID}" "${BASELINE_INCIDENT_A}" "${BASELINE_INCIDENT_B}" \
	< "$(dirname "$0")/fixtures/phase0-restore.sql"
BASELINE_FIXTURE_INSERTED=true

source_psql "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" > "${BASELINE_TABLES}"
[ -s "${BASELINE_TABLES}" ] || fail "source database has no public tables"

while IFS= read -r table; do
	case "${table}" in
		*[!a-zA-Z0-9_]*) fail "unsafe table name returned by PostgreSQL: ${table}" ;;
	esac
	count="$(source_psql "SELECT count(*) FROM \"${table}\"")"
	printf '%s|%s\n' "${table}" "${count}" >> "${BASELINE_SOURCE_COUNTS}"
done < "${BASELINE_TABLES}"
fixture_query="
SELECT 'member|' || o.slug || '|' || m.role || '|' || u.email
FROM member m
JOIN organization o ON o.id = m.\"organizationId\"
JOIN \"user\" u ON u.id = m.\"userId\"
WHERE o.metadata->>'runId' = '${BASELINE_RUN_ID}'
UNION ALL
SELECT 'incident|' || o.slug || '|' || owner.email || '|' || COALESCE(analyst.email, '-') || '|' || i.status::text || '|' || COALESCE(i.\"analystReportPath\", '-') || '|' || i.\"llmCategory\"::text
FROM incidents i
JOIN organization o ON o.id = i.\"organizationId\"
JOIN \"user\" owner ON owner.id = i.\"userId\"
LEFT JOIN \"user\" analyst ON analyst.id = i.\"analystId\"
WHERE o.metadata->>'runId' = '${BASELINE_RUN_ID}'
UNION ALL
SELECT 'audit|' || o.slug || '|' || COALESCE(a.\"oldStatus\"::text, '-') || '|' || a.\"newStatus\"::text || '|' || COALESCE(a.\"changedBy\", '-')
FROM incident_audit_log a
JOIN incidents i ON i.id = a.\"incidentId\"
JOIN organization o ON o.id = i.\"organizationId\"
WHERE o.metadata->>'runId' = '${BASELINE_RUN_ID}'
ORDER BY 1"
source_psql "${fixture_query}" > "${BASELINE_SOURCE_FIXTURE}"
[ "$(wc -l < "${BASELINE_SOURCE_FIXTURE}" | tr -d ' ')" = 7 ] || fail "fixture fingerprint is incomplete"

docker compose exec -T postgres-backup /usr/local/bin/backup.sh
docker compose exec -T postgres-backup /usr/local/bin/healthcheck.sh
BASELINE_BACKUP_OBJECT="$(docker compose exec -T postgres-backup sh -c 'cat "${BACKUP_STATE_DIR:-/state}/last-object.txt"' | tr -d '\r\n')"
case "${BASELINE_BACKUP_OBJECT}" in
	bastiondesk/*/postgres/daily/*/*.dump) ;;
	*) fail "backup state contains an unexpected object path" ;;
esac

	docker compose exec -T postgres-backup sh -c \
	'MC_CERTS_DIR=/tmp/mc-certs SSL_CERT_FILE="$S3_TLS_CA_PATH" exec mc cat "$1"' \
	_ "${BASELINE_BACKUP_OBJECT}" > "${BASELINE_DUMP_FILE}"
[ -s "${BASELINE_DUMP_FILE}" ] || fail "downloaded dump is empty"
docker run --detach --rm \
	--name "${BASELINE_RESTORE_CONTAINER}" \
	--network none \
	--tmpfs /var/lib/postgresql:rw,nosuid,nodev,size=512m \
	--env POSTGRES_PASSWORD="${BASELINE_RESTORE_PASSWORD}" \
	--env POSTGRES_USER=restore \
	--env POSTGRES_DB=restore \
	postgres:18.6-alpine3.24 >/dev/null
BASELINE_RESTORE_STARTED=true

ready=false
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
	if docker exec "${BASELINE_RESTORE_CONTAINER}" pg_isready --username restore --dbname restore >/dev/null 2>&1; then
		ready=true
		break
	fi
	sleep 1
done
[ "${ready}" = true ] || fail "temporary restore database did not become ready"
docker exec -i "${BASELINE_RESTORE_CONTAINER}" \
	pg_restore --exit-on-error --no-owner --no-privileges --username restore --dbname restore \
	< "${BASELINE_DUMP_FILE}"
while IFS= read -r table; do
	count="$(restore_psql "SELECT count(*) FROM \"${table}\"")"
	printf '%s|%s\n' "${table}" "${count}" >> "${BASELINE_RESTORE_COUNTS}"
done < "${BASELINE_TABLES}"
restore_psql "${fixture_query}" > "${BASELINE_RESTORE_FIXTURE}"
diff -u "${BASELINE_SOURCE_COUNTS}" "${BASELINE_RESTORE_COUNTS}" || fail "table counts differ after restore"
diff -u "${BASELINE_SOURCE_FIXTURE}" "${BASELINE_RESTORE_FIXTURE}" || fail "tenant relationships differ after restore"
tenant_a_rows="$(restore_psql "SELECT count(*) FROM incidents WHERE \"organizationId\" = 'baseline-${BASELINE_RUN_ID}-org-a' AND \"userDescription\" NOT LIKE '%TENANT_B_SECRET%'")"
tenant_b_leaks="$(restore_psql "SELECT count(*) FROM incidents WHERE \"organizationId\" = 'baseline-${BASELINE_RUN_ID}-org-a' AND \"userDescription\" LIKE '%TENANT_B_SECRET%'")"
[ "${tenant_a_rows}" = 1 ] || fail "restored tenant A query returned an unexpected row count"
[ "${tenant_b_leaks}" = 0 ] || fail "restored tenant A query contains the tenant B marker"
docker compose exec -T postgres-backup sh -c '
	set -eu
	test_dir="/tmp/phase0-restore-$1"
	trap '\''rm -rf -- "${test_dir}"'\'' EXIT INT TERM
	mkdir -p "${test_dir}/state" "${test_dir}/dump"
	printf "%s\n" 0 > "${test_dir}/state/last-success.epoch"
	if BACKUP_STATE_DIR="${test_dir}/state" BACKUP_TMP_DIR="${test_dir}/dump" BACKUP_RETENTION_DAYS=0 S3_BUCKET="missing-$1" /usr/local/bin/backup.sh >/dev/null 2>&1; then
		exit 1
	fi
	[ "$(cat "${test_dir}/state/last-success.epoch")" = 0 ]
	if BACKUP_STATE_DIR="${test_dir}/state" BACKUP_MAX_AGE_SECONDS=1 /usr/local/bin/healthcheck.sh; then
		exit 1
	fi
' _ "${BASELINE_RUN_ID}" || fail "failed backup incorrectly recorded a healthy success"
printf '%s\n' "[baseline-restore] PASS: backup ${BASELINE_BACKUP_OBJECT} restored with matching table counts, tenant relationships and failure health semantics"
