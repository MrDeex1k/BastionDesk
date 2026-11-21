#!/bin/sh
set -eu

arch="${1:?target architecture required}"
output="${2:?output path required}"
release="RELEASE.2025-08-13T08-35-41Z"
case "${arch}" in
  amd64) checksum="01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891" ;;
  arm64) checksum="14c8c9616cfce4636add161304353244e8de383b2e2752c0e9dad01d4c27c12c" ;;
  *) printf 'Unsupported MinIO Client architecture: %s\n' "${arch}" >&2; exit 1 ;;
esac
curl --fail --location --retry 3 --output "${output}" \
  "https://github.com/minio/mc/releases/download/${release}/mc.linux-${arch}.${release}"
printf '%s  %s\n' "${checksum}" "${output}" | sha256sum -c -
chmod 0755 "${output}"
