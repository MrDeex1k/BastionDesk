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
BASELINE_PROJECT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
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
BASELINE_RESTORE_BACKEND="bastiondesk-phase0-restore-api-${BASELINE_RUN_ID}"
BASELINE_RESTORE_USER=""
BASELINE_FIXTURE_INSERTED=false
BASELINE_RESTORE_STARTED=false
BASELINE_RESTORE_BACKEND_STARTED=false

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
		psql -X --set ON_ERROR_STOP=1 --port 54328 --username "${BASELINE_RESTORE_USER}" --dbname restore --tuples-only --no-align --command "$1"
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
	if [ "${BASELINE_RESTORE_BACKEND_STARTED}" = true ]; then
		docker rm --force "${BASELINE_RESTORE_BACKEND}" >/dev/null 2>&1
	fi
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
BASELINE_DATABASE_IMAGE="$(docker inspect bastiondesk-postgres --format '{{.Config.Image}}')"
BASELINE_BACKEND_IMAGE="$(docker inspect bastiondesk-backend-1 --format '{{.Config.Image}}')"
BASELINE_INTERNAL_NETWORK="$(docker inspect bastiondesk-postgres --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')"
BASELINE_RESTORE_USER="$(docker exec bastiondesk-postgres sh -c 'printf %s "$POSTGRES_USER"')"
[ -n "${BASELINE_DATABASE_IMAGE}" ] || fail "could not resolve source database image"
[ -n "${BASELINE_BACKEND_IMAGE}" ] || fail "could not resolve backend image"
[ -n "${BASELINE_INTERNAL_NETWORK}" ] || fail "could not resolve internal Docker network"
[ -n "${BASELINE_RESTORE_USER}" ] || fail "could not resolve database TLS role"

docker compose exec -T database sh -c \
	'exec psql -X --set ON_ERROR_STOP=1 --port "$POSTGRES_PORT" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=run_id="$1" --set=incident_a="$2" --set=incident_b="$3"' \
	_ "${BASELINE_RUN_ID}" "${BASELINE_INCIDENT_A}" "${BASELINE_INCIDENT_B}" \
	< "$(dirname "$0")/fixtures/phase0-restore.sql"
BASELINE_FIXTURE_INSERTED=true

BASELINE_SESSION_TOKEN="baseline-${BASELINE_RUN_ID}-session-token"
BASELINE_SESSION_COOKIE="$(docker exec --env SESSION_TOKEN="${BASELINE_SESSION_TOKEN}" bastiondesk-backend-1 bun -e '
const signature = require("node:crypto").createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(process.env.SESSION_TOKEN).digest("base64");
process.stdout.write(encodeURIComponent(`${process.env.SESSION_TOKEN}.${signature}`));
')"
source_session="$(curl -sS --header "Cookie: better-auth.session_token=${BASELINE_SESSION_COOKIE}" http://127.0.0.1:4567/api/auth/get-session)"
printf '%s' "${source_session}" | RUN_ID="${BASELINE_RUN_ID}" bun -e '
let input = "";
for await (const chunk of process.stdin) input += chunk;
const body = JSON.parse(input);
if (body.user?.email !== `${process.env.RUN_ID}-employee-a@example.test`) process.exit(1);
' || fail "source API did not accept the fixture session"

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
mkdir -p "${BASELINE_TMP_DIR}/empty-init"
docker run --detach --rm \
	--name "${BASELINE_RESTORE_CONTAINER}" \
	--network "${BASELINE_INTERNAL_NETWORK}" \
	--tmpfs /var/lib/postgresql:rw,nosuid,nodev,size=512m \
	--volume "${BASELINE_TMP_DIR}/empty-init:/docker-entrypoint-initdb.d:ro" \
	--volume "${BASELINE_PROJECT_DIR}/database/config/postgresql.conf:/etc/postgresql/postgresql.conf:ro" \
	--volume "${BASELINE_PROJECT_DIR}/scripts/fixtures/phase0-restore-pg_hba.conf:/etc/postgresql/pg_hba.conf:ro" \
	--volume "${BASELINE_PROJECT_DIR}/infra/tls/dev/ca:/certs/ca:ro" \
	--volume "${BASELINE_PROJECT_DIR}/infra/tls/dev/database:/certs/database:ro" \
	--env POSTGRES_PASSWORD="${BASELINE_RESTORE_PASSWORD}" \
	--env POSTGRES_USER="${BASELINE_RESTORE_USER}" \
	--env POSTGRES_DB=restore \
	--env POSTGRES_PORT=54328 \
	"${BASELINE_DATABASE_IMAGE}" \
	postgres \
	-c config_file=/etc/postgresql/postgresql.conf \
	-c hba_file=/etc/postgresql/pg_hba.conf \
	-c port=54328 >/dev/null
BASELINE_RESTORE_STARTED=true

ready=false
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
	if docker exec "${BASELINE_RESTORE_CONTAINER}" pg_isready --port 54328 --username "${BASELINE_RESTORE_USER}" --dbname restore >/dev/null 2>&1; then
		ready=true
		break
	fi
	sleep 1
done
[ "${ready}" = true ] || fail "temporary restore database did not become ready"
restore_psql "ALTER ROLE \"${BASELINE_RESTORE_USER}\" WITH PASSWORD '${BASELINE_RESTORE_PASSWORD}'"
docker exec -i "${BASELINE_RESTORE_CONTAINER}" \
	pg_restore --exit-on-error --no-owner --no-privileges --port 54328 --username "${BASELINE_RESTORE_USER}" --dbname restore \
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

BASELINE_RESTORE_IP="$(docker inspect "${BASELINE_RESTORE_CONTAINER}" --format "{{with index .NetworkSettings.Networks \"${BASELINE_INTERNAL_NETWORK}\"}}{{.IPAddress}}{{end}}")"
[ -n "${BASELINE_RESTORE_IP}" ] || fail "could not resolve restored database address"
docker run --detach --rm \
	--name "${BASELINE_RESTORE_BACKEND}" \
	--network "${BASELINE_INTERNAL_NETWORK}" \
	--add-host "database:${BASELINE_RESTORE_IP}" \
	--publish 127.0.0.1::3333 \
	--env-file "${BASELINE_PROJECT_DIR}/.env" \
	--env PORT=3333 \
	--env POSTGRES_USER="${BASELINE_RESTORE_USER}" \
	--env POSTGRES_PASSWORD="${BASELINE_RESTORE_PASSWORD}" \
	--env POSTGRES_DB=restore \
	--env POSTGRES_HOST=database \
	--env PGBOUNCER_HOST=database \
	--env PGBOUNCER_PORT=54328 \
	--env DATABASE_URL="postgresql://${BASELINE_RESTORE_USER}:${BASELINE_RESTORE_PASSWORD}@database:54328/restore" \
	--env AUTH_PASSWORD_BREACH_CHECK_ENABLED=false \
	--volume "${BASELINE_PROJECT_DIR}/infra/tls/dev/ca:/certs/ca:ro" \
	--volume "${BASELINE_PROJECT_DIR}/infra/tls/dev/backend:/certs/backend:ro" \
	"${BASELINE_BACKEND_IMAGE}" >/dev/null
BASELINE_RESTORE_BACKEND_STARTED=true
docker exec --env EXPECTED_PASSWORD="${BASELINE_RESTORE_PASSWORD}" "${BASELINE_RESTORE_BACKEND}" sh -c \
	'[ "$POSTGRES_PASSWORD" = "$EXPECTED_PASSWORD" ]' || fail "restored backend received an unexpected database password"

BASELINE_API_PORT="$(docker port "${BASELINE_RESTORE_BACKEND}" 3333/tcp | sed -n 's/.*://p' | head -n 1)"
[ -n "${BASELINE_API_PORT}" ] || fail "could not resolve restored backend port"
api_ready=false
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
	if curl -sS "http://127.0.0.1:${BASELINE_API_PORT}/api" >/dev/null 2>&1; then
		api_ready=true
		break
	fi
	sleep 1
done
[ "${api_ready}" = true ] || fail "restored backend did not become ready"

curl -sS \
	--header "Cookie: better-auth.session_token=${BASELINE_SESSION_COOKIE}" \
	"http://127.0.0.1:${BASELINE_API_PORT}/api/incidents/my" \
	> "${BASELINE_TMP_DIR}/restored-api-list.json"
if ! API_RESPONSE_PATH="${BASELINE_TMP_DIR}/restored-api-list.json" \
	INCIDENT_A="${BASELINE_INCIDENT_A}" INCIDENT_B="${BASELINE_INCIDENT_B}" bun -e '
const body = await Bun.file(process.env.API_RESPONSE_PATH).json();
if (!body.success || body.pagination?.total !== 1 || body.data?.[0]?.id !== process.env.INCIDENT_A) {
  console.error(JSON.stringify(body));
  process.exit(1);
}
if (JSON.stringify(body).includes(process.env.INCIDENT_B) || JSON.stringify(body).includes("TENANT_B_SECRET")) {
  console.error(JSON.stringify(body));
  process.exit(1);
}
'; then
	docker logs --tail 100 "${BASELINE_RESTORE_BACKEND}" >&2
	printf '%s\n' "restore-ip=${BASELINE_RESTORE_IP}" >&2
	docker exec "${BASELINE_RESTORE_BACKEND}" getent hosts database >&2
	restore_psql "SELECT id || '|' || token || '|' || \"userId\" || '|' || \"activeOrganizationId\" FROM session WHERE token = '${BASELINE_SESSION_TOKEN}'" >&2
	fail "restored API did not preserve the tenant A session scope"
fi

cross_status="$(curl -sS --output "${BASELINE_TMP_DIR}/restored-api-cross.json" --write-out '%{http_code}' \
	--header "Cookie: better-auth.session_token=${BASELINE_SESSION_COOKIE}" \
	"http://127.0.0.1:${BASELINE_API_PORT}/api/incidents/${BASELINE_INCIDENT_B}")"
[ "${cross_status}" = 404 ] || fail "restored API exposed a tenant B incident"
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
printf '%s\n' "[baseline-restore] PASS: backup ${BASELINE_BACKUP_OBJECT} restored with matching counts, authenticated API tenant scope and failure health semantics"
