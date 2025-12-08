FROM oven/bun:1 AS base

WORKDIR /app

# Kopiuj tylko pliki zależności i zainstaluj produkcyjne zależności przez bun
COPY package*.json ./
RUN bun install

# Skopiuj resztę plików aplikacji
COPY . .

EXPOSE 3333

CMD ["bun", "run", "start"]
