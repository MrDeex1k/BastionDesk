FROM nginx:1.31.5-alpine3.24

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN sed -i 's#pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && mkdir -p /var/cache/nginx /tmp/nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /tmp/nginx /var/log/nginx

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
