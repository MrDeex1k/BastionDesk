#!/bin/sh
set -eu
# Copy host-owned secrets before the official entrypoint drops root privileges.
mkdir -p /certs/rabbitmq
cp /certs/rabbitmq-source/tls.crt /certs/rabbitmq/tls.crt
cp /certs/rabbitmq-source/tls.key /certs/rabbitmq/tls.key
chown rabbitmq:rabbitmq /certs/rabbitmq/tls.key
chmod 600 /certs/rabbitmq/tls.key
exec /usr/local/bin/docker-entrypoint.sh "$@"
