FROM oven/bun:1.3.5-alpine AS base

WORKDIR /app

# Kopiuj tylko pliki zależności i zainstaluj produkcyjne zależności przez bun
COPY package*.json ./
RUN bun install

# Skopiuj resztę plików aplikacji
COPY . .

EXPOSE 3333

CMD ["bun", "run", "start"]
