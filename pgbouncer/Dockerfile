FROM busybox:1.37.0-musl AS busybox-src

FROM edoburu/pgbouncer:v1.25.1-p0

COPY --from=busybox-src /bin/busybox /usr/local/bin/busybox

COPY --chmod=755 start.sh /usr/local/bin/start.sh

EXPOSE 6432

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD /bin/sh -ec '/usr/local/bin/busybox nc -z 127.0.0.1 "${PGBOUNCER_PORT:-6432}"'

ENTRYPOINT ["/usr/local/bin/start.sh"]
