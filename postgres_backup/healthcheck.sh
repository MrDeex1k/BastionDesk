#!/bin/sh
set -eu

STATE_DIR="${BACKUP_STATE_DIR:-/state}"
MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-129600}"
STAMP_FILE="${STATE_DIR}/last-success.epoch"

[ -f "${STAMP_FILE}" ] || exit 1

last_success="$(cat "${STAMP_FILE}")"
now="$(date +%s)"
age="$((now - last_success))"

[ "${age}" -le "${MAX_AGE_SECONDS}" ]
