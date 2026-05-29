# Reverse Proxy (NGINX)

Ten dokument opisuje aktualną konfigurację reverse proxy dla BastionDesk.

## Rola serwisu

Serwis `nginx` jest głównym punktem wejścia do aplikacji uruchamianej przez Docker Compose. Odpowiada za:

- serwowanie frontendu,
- przekazywanie ruchu API do backendu,
- jednolity punkt wejścia HTTP dla użytkownika końcowego.

## Porty

- Kontener `nginx` nasłuchuje wewnętrznie na porcie `8080`.
- Docker Compose publikuje go na hoście jako `4567`.
- Standardowy adres wejścia do aplikacji to:

```text
http://localhost:4567
```

Pozostałe usługi działają wyłącznie wewnątrz sieci Docker Compose i nie są publikowane bezpośrednio na hoście.

## Routing

Konfiguracja znajduje się w:

- [nginx/nginx.conf](/Users/jakubbatycki/KOD/BastionDesk/nginx/nginx.conf)

Aktualne trasy:

- `/` -> `frontend:8080`
- `/api/` -> `backend:3333`

Frontend jest osobnym kontenerem NGINX, który serwuje statyczny build Vite i obsługuje SPA fallback przez `index.html`.

## Security Headers

Publiczny reverse proxy ustawia nagłówki bezpieczeństwa dla warstwy edge, w tym:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Content-Security-Policy`

Ich celem jest ograniczenie clickjackingu, MIME sniffingu oraz wzmocnienie obrony warstwowej po stronie przeglądarki.

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
- startuje dopiero po uzyskaniu `healthy` przez `backend` i `frontend`,
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

### API nie działa przez proxy

Sprawdź:

- czy `backend` ma status `healthy`,
- czy w [nginx/nginx.conf](/Users/jakubbatycki/KOD/BastionDesk/nginx/nginx.conf) trasa `/api/` wskazuje na `backend:3333`,
- logi kontenera `nginx`.
