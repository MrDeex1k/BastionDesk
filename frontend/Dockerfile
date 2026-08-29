FROM oven/bun:1.4.0-alpine AS builder

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN bun install --frozen-lockfile --filter bastiondesk-frontend
COPY frontend ./frontend

WORKDIR /app/frontend
RUN bun run build

FROM nginx:1.31.4-alpine3.24

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

RUN sed -i 's#pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && mkdir -p /var/cache/nginx /tmp/nginx /var/log/nginx \
    && chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d /var/cache/nginx /tmp/nginx /var/log/nginx

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
