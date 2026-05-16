#!/bin/sh
set -eu

mkdir -p /etc/pgbouncer

cat > /etc/pgbouncer/userlist.txt <<EOF
"${POSTGRES_USER}" "${POSTGRES_PASSWORD}"
EOF

cat > /etc/pgbouncer/pgbouncer.ini <<EOF
[databases]
${POSTGRES_DB} = host=${POSTGRES_HOST} port=${POSTGRES_PORT} dbname=${POSTGRES_DB}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = ${PGBOUNCER_PORT}
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
admin_users = ${POSTGRES_USER}
stats_users = ${POSTGRES_USER}
pool_mode = session
max_client_conn = 200
default_pool_size = 20
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits,options

client_tls_sslmode = verify-full
client_tls_ca_file = /certs/ca/ca.crt
client_tls_cert_file = /certs/pgbouncer/server.crt
client_tls_key_file = /certs/pgbouncer/server.key

server_tls_sslmode = verify-full
server_tls_ca_file = /certs/ca/ca.crt
server_tls_cert_file = /certs/pgbouncer/client.crt
server_tls_key_file = /certs/pgbouncer/client.key
EOF

exec pgbouncer /etc/pgbouncer/pgbouncer.ini