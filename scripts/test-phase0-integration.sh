#!/bin/sh
set -eu

BASELINE_BASE_URL="${BASELINE_BASE_URL:-http://localhost:4567}"
BASELINE_TMP_DIR="$(mktemp -d)"
BASELINE_BODY_FILE="${BASELINE_TMP_DIR}/body.json"
BASELINE_COOKIE_FILE="${BASELINE_TMP_DIR}/cookies.txt"

cleanup() {
	rm -rf -- "${BASELINE_TMP_DIR}"
}
trap cleanup EXIT INT TERM

fail() {
	printf '%s\n' "[baseline-integration] FAIL: $1" >&2
	exit 1
}

assert_status() {
	actual="$1"
	expected="$2"
	label="$3"
	[ "${actual}" = "${expected}" ] || fail "${label}: expected HTTP ${expected}, got ${actual}"
}

assert_error_code() {
	expected="$1"
	actual="$(bun -e 'const body = JSON.parse(await Bun.stdin.text()); process.stdout.write(body?.error?.code ?? "")' < "${BASELINE_BODY_FILE}")"
	[ "${actual}" = "${expected}" ] || fail "expected error code ${expected}, got ${actual:-<empty>}"
}

status="$(curl --silent --show-error --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api")"
assert_status "${status}" "200" "API metadata"
version="$(bun -e 'const body = JSON.parse(await Bun.stdin.text()); process.stdout.write(body?.version ?? "")' < "${BASELINE_BODY_FILE}")"
[ "${version}" = "1.0.3" ] || fail "expected API version 1.0.3, got ${version:-<empty>}"

status="$(curl --silent --show-error --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api/incidents/my")"
assert_status "${status}" "401" "unauthenticated incident list"
assert_error_code "UNAUTHORIZED"

status="$(curl --silent --show-error --request POST --form 'userDescription=baseline' --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api/incidents")"
assert_status "${status}" "403" "missing CSRF token"
assert_error_code "CSRF_ORIGIN_INVALID"

status="$(curl --silent --show-error --cookie-jar "${BASELINE_COOKIE_FILE}" --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api/csrf")"
assert_status "${status}" "200" "CSRF bootstrap"
csrf_token="$(bun -e 'const body = JSON.parse(await Bun.stdin.text()); process.stdout.write(body?.data?.token ?? "")' < "${BASELINE_BODY_FILE}")"
[ -n "${csrf_token}" ] || fail "CSRF bootstrap returned no token"

status="$(curl --silent --show-error --request POST --cookie "${BASELINE_COOKIE_FILE}" --header "Origin: ${BASELINE_BASE_URL}" --header "X-CSRF-Token: ${csrf_token}" --form 'userDescription=baseline' --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api/incidents")"
assert_status "${status}" "401" "valid CSRF without session"
assert_error_code "UNAUTHORIZED"

status="$(curl --silent --show-error --request POST --cookie "${BASELINE_COOKIE_FILE}" --header 'Origin: https://untrusted.example' --header "X-CSRF-Token: ${csrf_token}" --form 'userDescription=baseline' --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api/incidents")"
assert_status "${status}" "403" "untrusted origin"
assert_error_code "CSRF_ORIGIN_INVALID"

status="$(curl --silent --show-error --request QUERY --header 'Content-Type: application/json' --data '{}' --output "${BASELINE_BODY_FILE}" --write-out '%{http_code}' "${BASELINE_BASE_URL}/api/admin/incidents")"
assert_status "${status}" "401" "unauthenticated admin QUERY"
assert_error_code "UNAUTHORIZED"

printf '%s\n' "[baseline-integration] PASS: API metadata, auth boundary and CSRF boundary"
