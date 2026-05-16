FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /app

COPY backend/package.json ./
COPY backend/bun.lock ./
COPY backend/bunfig.toml ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=bun:bun backend/ ./
COPY --chown=bun:bun proto ./proto

USER bun

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e 'fetch("http://127.0.0.1:3333/health").then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))'

CMD ["bun", "run", "start"]
