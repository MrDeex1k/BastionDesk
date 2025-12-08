FROM busybox:1.36.1-musl AS wget-src

FROM quay.io/minio/minio:latest

# Provide wget via busybox for healthchecks (minio base image lacks package manager)
COPY --from=wget-src /bin/busybox /bin/busybox
RUN ln -sf /bin/busybox /bin/wget

# Expose MinIO API and Console ports (default inside container)
EXPOSE 9000 9001