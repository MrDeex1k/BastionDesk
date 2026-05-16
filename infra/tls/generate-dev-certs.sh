#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
OUT_DIR="${ROOT_DIR}/dev"
CA_DIR="${OUT_DIR}/ca"
POSTGRES_USER="${POSTGRES_USER:-bastiondesk_superadmin}"

mkdir -p "${CA_DIR}"

if [ ! -f "${CA_DIR}/ca.key" ]; then
	openssl genrsa -out "${CA_DIR}/ca.key" 4096
fi

if [ ! -f "${CA_DIR}/ca.crt" ]; then
	openssl req -x509 -new -nodes \
		-key "${CA_DIR}/ca.key" \
		-sha256 \
		-days 3650 \
		-out "${CA_DIR}/ca.crt" \
		-subj "/CN=BastionDesk Dev CA"
fi

generate_cert() {
	name="$1"
	common_name="$2"
	san="$3"
	dir="${OUT_DIR}/${name}"

	mkdir -p "${dir}"
	cat > "${dir}/openssl.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions = req_ext
prompt = no

[dn]
CN = ${common_name}

[req_ext]
subjectAltName = ${san}
extendedKeyUsage = serverAuth,clientAuth
EOF

	openssl genrsa -out "${dir}/tls.key" 2048
	openssl req -new \
		-key "${dir}/tls.key" \
		-out "${dir}/tls.csr" \
		-config "${dir}/openssl.cnf"
	openssl x509 -req \
		-in "${dir}/tls.csr" \
		-CA "${CA_DIR}/ca.crt" \
		-CAkey "${CA_DIR}/ca.key" \
		-CAcreateserial \
		-out "${dir}/tls.crt" \
		-days 825 \
		-sha256 \
		-extensions req_ext \
		-extfile "${dir}/openssl.cnf"
	cp "${CA_DIR}/ca.crt" "${dir}/ca.crt"
	rm -f "${dir}/tls.csr" "${dir}/openssl.cnf"
}

generate_storage_cert() {
	name="$1"
	generate_cert "${name}" "${name}" "DNS:storage-1,DNS:storage-2,DNS:storage-3,DNS:storage-4,DNS:localhost"
	mv "${OUT_DIR}/${name}/tls.crt" "${OUT_DIR}/${name}/public.crt"
	mv "${OUT_DIR}/${name}/tls.key" "${OUT_DIR}/${name}/private.key"
	mkdir -p "${OUT_DIR}/${name}/CAs"
	cp "${CA_DIR}/ca.crt" "${OUT_DIR}/${name}/CAs/ca.crt"
	rm -f "${OUT_DIR}/${name}/ca.crt"
}

generate_cert "backend" "backend" "DNS:backend,DNS:localhost"
mv "${OUT_DIR}/backend/tls.crt" "${OUT_DIR}/backend/client.crt"
mv "${OUT_DIR}/backend/tls.key" "${OUT_DIR}/backend/client.key"

generate_cert "llm_service" "llm_service" "DNS:llm_service,DNS:localhost"
mv "${OUT_DIR}/llm_service/tls.crt" "${OUT_DIR}/llm_service/server.crt"
mv "${OUT_DIR}/llm_service/tls.key" "${OUT_DIR}/llm_service/server.key"

generate_cert "database" "database" "DNS:database,DNS:localhost"
mv "${OUT_DIR}/database/tls.crt" "${OUT_DIR}/database/server.crt"
mv "${OUT_DIR}/database/tls.key" "${OUT_DIR}/database/server.key"

generate_cert "pgbouncer" "pgbouncer" "DNS:pgbouncer,DNS:localhost"
mv "${OUT_DIR}/pgbouncer/tls.crt" "${OUT_DIR}/pgbouncer/server.crt"
mv "${OUT_DIR}/pgbouncer/tls.key" "${OUT_DIR}/pgbouncer/server.key"

generate_cert "pgbouncer-client" "${POSTGRES_USER}" "DNS:pgbouncer,DNS:localhost"
mv "${OUT_DIR}/pgbouncer-client/tls.crt" "${OUT_DIR}/pgbouncer/client.crt"
mv "${OUT_DIR}/pgbouncer-client/tls.key" "${OUT_DIR}/pgbouncer/client.key"
rm -rf "${OUT_DIR}/pgbouncer-client"

generate_storage_cert "storage-1"
generate_storage_cert "storage-2"
generate_storage_cert "storage-3"
generate_storage_cert "storage-4"

chmod 600 \
	"${CA_DIR}/ca.key" \
	"${OUT_DIR}/backend/client.key" \
	"${OUT_DIR}/llm_service/server.key" \
	"${OUT_DIR}/database/server.key" \
	"${OUT_DIR}/pgbouncer/server.key" \
	"${OUT_DIR}/pgbouncer/client.key" \
	"${OUT_DIR}/storage-1/private.key" \
	"${OUT_DIR}/storage-2/private.key" \
	"${OUT_DIR}/storage-3/private.key" \
	"${OUT_DIR}/storage-4/private.key"