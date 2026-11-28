FROM busybox:1.38.0-musl AS wget-src

FROM postgres:19.0-alpine3.24 AS mc-src
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl
COPY download-client.sh /download-client.sh
RUN sh /download-client.sh "${TARGETARCH}" /usr/bin/mc

FROM coollabsio/minio:RELEASE.2025-10-15T17-29-55Z

# Provide wget via busybox for healthchecks (minio base image lacks package manager)
COPY --from=wget-src /bin/busybox /bin/busybox
RUN ln -sf /bin/busybox /bin/wget

# Provide mc (MinIO client) for bucket bootstrap
COPY --from=mc-src /usr/bin/mc /usr/bin/mc

# Expose MinIO API and Console ports (default inside container)
EXPOSE 9000 9001
