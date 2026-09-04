#!/bin/sh
set -eu

EXPECTED_SERVICES="database llm_service pgbouncer postgres-backup backend frontend nginx storage-1 storage-2 storage-3 storage-4"
BASELINE_SMOKE_TIMEOUT_SECONDS="${BASELINE_SMOKE_TIMEOUT_SECONDS:-180}"

docker compose config --quiet
docker compose up --detach --wait --wait-timeout "${BASELINE_SMOKE_TIMEOUT_SECONDS}"

running_services="$(docker compose ps --services --status running)"
for service in ${EXPECTED_SERVICES}; do
	printf '%s\n' "${running_services}" | grep -Fxq "${service}" || {
		printf '%s\n' "[baseline-smoke] FAIL: service ${service} is not running" >&2
		exit 1
	}
done

docker compose ps --format json | bun -e '
const input = (await Bun.stdin.text()).trim();
const rows = input.startsWith("[")
  ? JSON.parse(input)
  : input.split("\n").filter(Boolean).map((line) => JSON.parse(line));
const failed = rows.filter((row) => row.Health && row.Health !== "healthy");
if (failed.length) {
  for (const row of failed) console.error(`[baseline-smoke] FAIL: ${row.Service} is ${row.Health}`);
  process.exit(1);
}
'

"$(dirname "$0")/test-phase0-integration.sh"

docker compose exec -T backend bun -e '
const response = await fetch("http://127.0.0.1:3333/health");
if (!response.ok) process.exit(1);
'

printf '%s\n' "[baseline-smoke] PASS: Compose services and backend health"
