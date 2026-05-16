# Reverse Proxy (NGINX)

Ten dokument opisuje aktualną konfigurację reverse proxy dla BastionDesk.

## Rola serwisu

Serwis `nginx` jest głównym punktem wejścia do aplikacji uruchamianej przez Docker Compose. Odpowiada za:

- serwowanie frontendu,
- przekazywanie ruchu API do backendu,
- przekazywanie ruchu `/llm/` do serwisu LLM,
- jednolity punkt wejścia HTTP dla użytkownika końcowego.

## Porty

- Kontener `nginx` nasłuchuje wewnętrznie na porcie `8080`.
- Docker Compose publikuje go na hoście jako `4567`.
- Standardowy adres wejścia do aplikacji to:

```text
http://localhost:4567
```

Backend API jest dodatkowo wystawione bezpośrednio na:

```text
http://localhost:3333
```

## Routing

Konfiguracja znajduje się w:

- [nginx/nginx.conf](/Users/jakubbatycki/KOD/BastionDesk/nginx/nginx.conf)

Aktualne trasy:

- `/` -> `frontend:8080`
- `/api/` -> `backend:3333`
- `/llm/` -> `llm_service:8888`

Frontend jest osobnym kontenerem NGINX, który serwuje statyczny build Vite i obsługuje SPA fallback przez `index.html`.

## Healthcheck

Serwis `nginx` udostępnia endpoint:

```text
/healthz
```

Healthcheck kontenera sprawdza:

```text
http://127.0.0.1:8080/healthz
```

## Docker Compose

Definicja serwisu znajduje się w:

- [docker-compose.yml](/Users/jakubbatycki/KOD/BastionDesk/docker-compose.yml)

Najważniejsze założenia:

- `nginx` ma `restart: unless-stopped`,
- startuje dopiero po uzyskaniu `healthy` przez `backend`, `frontend` i `llm_service`,
- działa jako użytkownik `nginx`,
- korzysta z port mappingu `4567:8080`.

## Budowanie i uruchamianie

Z katalogu głównego repo:

```bash
docker compose build nginx
docker compose up nginx
```

W praktyce proxy jest zwykle uruchamiane razem z całym stackiem:

```bash
docker compose up
```

## Rozwiązywanie problemów

### Port 4567 jest zajęty

Zmień mapowanie portu w [docker-compose.yml](/Users/jakubbatycki/KOD/BastionDesk/docker-compose.yml) albo zwolnij port lokalnie.

### Frontend nie otwiera się przez proxy

Sprawdź:

- czy `frontend` ma status `healthy`,
- czy `nginx` ma status `healthy`,
- czy wejście następuje przez `http://localhost:4567`.

### API działa bezpośrednio, ale nie działa przez proxy

Sprawdź:

- czy `backend` działa na `3333`,
- czy w [nginx/nginx.conf](/Users/jakubbatycki/KOD/BastionDesk/nginx/nginx.conf) trasa `/api/` wskazuje na `backend:3333`,
- logi kontenera `nginx`.

### LLM routing nie działa

Sprawdź:

- czy `llm_service` ma status `healthy`,
- czy `nginx` proxyuje `/llm/` do `llm_service:8888`,
- czy serwis LLM wystartował poprawnie z certyfikatami i zależnościami modelu.
