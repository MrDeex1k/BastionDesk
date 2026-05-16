#!/bin/sh
set -eu

: "${BACKUP_CRON:=0 3 * * *}"
: "${BACKUP_RUN_ON_START:=true}"
: "${BACKUP_STATE_DIR:=/state}"
: "${CRONTAB_DIR:=/var/lib/postgresql/crontabs}"

mkdir -p "${CRONTAB_DIR}" "${BACKUP_STATE_DIR}" /tmp/backups /tmp/mc-certs/CAs

cat > "${CRONTAB_DIR}/postgres" <<EOF
${BACKUP_CRON} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2
EOF

if [ "${BACKUP_RUN_ON_START}" = "true" ]; then
	/usr/local/bin/backup.sh
fi

exec crond -f -l 2 -c "${CRONTAB_DIR}"
