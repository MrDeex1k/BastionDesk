FROM busybox:1.36.1-musl AS wget-src

FROM minio/mc:latest AS mc-src

FROM quay.io/minio/minio:latest

# Provide wget via busybox for healthchecks (minio base image lacks package manager)
COPY --from=wget-src /bin/busybox /bin/busybox
RUN ln -sf /bin/busybox /bin/wget

# Provide mc (MinIO client) for bucket bootstrap
COPY --from=mc-src /usr/bin/mc /usr/bin/mc

# Expose MinIO API and Console ports (default inside container)
EXPOSE 9000 9001