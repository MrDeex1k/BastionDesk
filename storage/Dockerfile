FROM busybox:1.37.0-musl AS wget-src

FROM minio/mc:RELEASE.2025-08-13T08-35-41Z AS mc-src

FROM minio/minio:RELEASE.2025-09-07T16-13-09Z

# Provide wget via busybox for healthchecks (minio base image lacks package manager)
COPY --from=wget-src /bin/busybox /bin/busybox
RUN ln -sf /bin/busybox /bin/wget

# Provide mc (MinIO client) for bucket bootstrap
COPY --from=mc-src /usr/bin/mc /usr/bin/mc

# Expose MinIO API and Console ports (default inside container)
EXPOSE 9000 9001