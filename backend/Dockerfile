FROM oven/bun:1.4.2-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN bun install --frozen-lockfile --production --filter bastiondesk-backend

COPY --chown=bun:bun backend/ ./backend
COPY --chown=bun:bun proto ./proto
COPY --chown=bun:bun database/versioned ./database/versioned

WORKDIR /app/backend

USER bun

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e 'fetch("http://127.0.0.1:3335/health").then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))'

CMD ["bun", "run", "start"]
