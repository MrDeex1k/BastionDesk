# Aktualizacja zależności — 21 września 2026

Zaktualizowano zależności JavaScript w głównym workspace, frontendzie i backendzie
przez `bun run deps:update`, z istniejącą 24-godzinną karencją. Manifesty
zachowują dokładne wersje, a rozwiązanie zapisano w `bun.lock`. Istotne zmiany
obejmują OxLint 1.83.0, OxFMT 0.68.0, React 19.3.0, Vite 8.3.0, Better Auth
1.7.5 i Turbo 2.11.2.

W `llm_service` zaktualizowano dokładne piny do najnowszych wersji zgodnych
z Pythonem 3.13, indeksem PyTorch CPU i `exclude-newer = "24 hours"`.
Zmieniono grpcio i grpcio-tools na 1.84.0, huggingface-hub na 1.32.0,
transformers na 5.17.0 oraz uvicorn na 0.53.0. FastAPI 0.141.1 i PyTorch
2.14.0 pozostają bez zmian. Odświeżono także zależności przechodnie w `uv.lock`.

Tagi obrazów sprawdzono bez karencji. NGINX podniesiono do
`1.31.6-alpine3.24`, obraz UV do `0.12.17-python3.13-trixie-slim`, a Mailpit
do `v1.31.2`. MinIO Client zachowuje ostatni tag wydawcy
`RELEASE.2025-08-13T08-35-41Z`, ale pochodzi teraz z `quay.io/minio/mc`,
ponieważ repozytorium `minio/mc` na Docker Hub zostało wycofane. Pozostałe
przypięte obrazy — Bun, PostgreSQL, BusyBox, PgBouncer i MinIO — nie mają
nowszych zgodnych tagów w używanych liniach.

Do OxLint frontendu dodano `@shadcn/lint` 0.1.1. Reguły
`no-inline-styles` i `no-unknown-classes` działają jako błędy. Druga wykryła
brakujące klasy animacji; dodano `tw-animate-css` 1.4.0 i import w `App.css`.
Reguły wymagające decyzji o kontraktach komponentów, kolorach i wartościach
arbitralnych nie zostały włączone.

Weryfikacja: `bun run check`, `bun run test`, `bun run build` (wykonany przed
prośbą o pominięcie buildów), `uv lock --locked`, `uv lock --upgrade --dry-run`,
`docker compose ... config --quiet`, `git diff --check` oraz odczyt manifestów
zmienionych obrazów. Nie budowano obrazów Docker; demon Docker nie działał.
