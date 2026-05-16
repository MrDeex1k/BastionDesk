FROM minio/mc:RELEASE.2025-08-13T08-35-41Z AS mc-src

FROM postgres:18.3-alpine

COPY --from=mc-src /usr/bin/mc /usr/local/bin/mc

COPY postgres_backup/backup.sh /usr/local/bin/backup.sh
COPY postgres_backup/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY postgres_backup/healthcheck.sh /usr/local/bin/healthcheck.sh

RUN chmod +x \
    /usr/local/bin/backup.sh \
    /usr/local/bin/entrypoint.sh \
    /usr/local/bin/healthcheck.sh \
    && mkdir -p /state /var/lib/postgresql/crontabs \
    && chown -R postgres:postgres /state /var/lib/postgresql/crontabs

VOLUME ["/state"]

USER postgres

HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
  CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
