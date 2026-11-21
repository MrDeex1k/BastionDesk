# BastionDesk — backend API

Stan architektury sprawdzony w kodzie 5 listopada 2026. Backendowy workspace
uruchamiany przez Bun dostarcza trzy procesy z jednego obrazu:

| Usługa Compose | Entrypoint | Odpowiedzialność |
| --- | --- | --- |
| `auth-service` | `src/auth/main.ts` | Elysia 2 + Better Auth: sesje, konta, organizacje, CSRF, gateway, emisja JWT i JWKS. |
| `backend` | `src/index.ts` | NestJS Core z use case'ami Effect, hostowany przez Express; incydenty, pliki, polityki, audyt i pozostałe endpointy administracyjne. |
| `classifier-worker` | `src/messaging/main.ts` | Relay zadań, RabbitMQ, klasyfikacja gRPC, retry/DLQ i zapis wyniku. |

Manifesty nadal mają wersję `1.0.3`. Datowane raporty faz opisują przebiegi
historyczne; obecne wersje zależności określają manifesty i lockfile.

## Ruch i granice odpowiedzialności

```text
przeglądarka -> NGINX :8080 (host :4567)
  -> /api oraz /api/* -> auth-service :3340
     -> auth / CSRF / metadane API
     -> pozostałe API -> JWT przez mTLS -> backend :3333
backend -> mTLS -> auth-service :3443 (JWKS i świeża tożsamość)
```

Gateway weryfikuje sesję HttpOnly, origin i wymagany token CSRF, a następnie
wystawia krótki token dla Core. Token pozostaje po stronie serwera; cookies
przeglądarki nie są przekazywane do Core. Core weryfikuje JWT i pobiera aktualną
tożsamość przez wewnętrzne API auth. Błędy auth nie uruchamiają fallbacku do
cookies. Szczegóły: [kontrakt tożsamości](identity-contract.md),
[wdrożenie i rotacja](phase-5-identity.md).

Better Auth ma jedną instancję w `src/auth/instance.ts`. Core i worker nie
importują jej i mają wyzerowane sekrety auth w Compose. Baza i uprawnienia
PostgreSQL pozostają wspólne; nie jest to izolacja usług rolami bazy.
Express pozostaje hostem HTTP i adapterem NestJS oraz obsługuje część tras
administracyjnych. Nie obsługuje już sesji ani endpointów Better Auth.

## Struktura projektu

```text
backend/src/
├── index.ts           # host Core, middleware, mTLS i lifecycle
├── auth/              # Better Auth, aplikacja Elysia, gateway, CSRF i signup
├── identity/          # JWT/JWKS, świeża tożsamość i transport mTLS
├── core/              # domena incydentów i plików, use case'y Effect
├── adapters/          # HTTP, SQL, identity, receipts i bramka schematu
├── contracts/         # operacje, błędy, audyt i provenance
├── migrations/        # jawny runner wersjonowanego SQL
├── messaging/         # trwałe joby, broker, worker, CLI i telemetria
├── wazuh/             # źródła organizacji, szyfrowanie, HTTPS i kursory
├── routes/            # pozostały routing admina i helpery plików
├── middleware/        # weryfikacja tożsamości, rate limiting i błędy
├── lib/               # DB, storage, klient LLM, email i konfiguracja
├── templates/         # email weryfikacyjny i reset hasła
└── utils/             # walidacja, pliki i wysyłka SMTP
```

## Dane i trwałe operacje

`src/lib/database.ts` udostępnia Bun SQL oraz `pg.Pool` przez PgBouncer i TLS.
Adaptery operacji Core używają transakcji PostgreSQL. Better Auth ma własny
pool w procesie auth. Projekt nie używa Drizzle.

Migrator działa jawnie, przez bezpośrednie połączenie do PostgreSQL, poza
PgBouncerem. Świeża baza z `database/init-sql/` również wymaga migracji:

- `0001_core_operations`: `core_command_receipts` i `core_audit`;
- `0002_durable_jobs`: `core_jobs`;
- `0003_auth_jwks`: magazyn kluczy JWT;
- `0004_wazuh_sources`: konfiguracja źródeł Wazuh i zaszyfrowane hasła.

Core i worker sprawdzają 0001/0002 przed startem; auth wymaga tabeli `jwks`.
Instrukcje: [migracje](../database/migrations.md).

Zmiana incydentu, audyt sukcesu i receipt są atomowe. Utworzenie incydentu
zapisuje w tej samej transakcji zadanie klasyfikacji. Ponowienie z tym samym
`Idempotency-Key` wymaga tego samego payloadu oraz świeżej tożsamości i polityki.
Retencja receipts i jobów nie jest automatyczna: ich usunięcie wpływa na
możliwość deduplikacji. Audyt przechowuje metadane, nie pełne treści incydentów,
i nie stanowi jeszcze dziennika wszystkich decyzji przyszłego SOAR.
[Kontrakty operacji](operation-contracts.md).

## Odczyt alertów Wazuh

Publiczne `/api/wazuh/*` przechodzi przez gateway auth i trafia do Core.
Core sprawdza sesję, aktywną organizację i rolę. Backend łączy się z dedykowanym
Indexerem organizacji przez HTTPS, korzystając z konta do odczytu indeksów
`wazuh-alerts-*`. Wazuh przechowuje alerty i ustala ich retencję. Backend
pobiera podsumowania do tabeli, a pełny `_source` odczytuje na żądanie.
Paginacja używa Point in Time i `search_after`.
[Kontrakt HTTP](api.md#wazuh-api) · [Wdrożenie](../integrations/wazuh-discovery.md#wdrożenie-etapu-6).

## Klasyfikacja i obserwowalność

Żądanie utworzenia incydentu nie czeka na inferencję LLM. Osobny worker
publikuje wskaźniki jobów do RabbitMQ po AMQPS, odczytuje dane z PostgreSQL
i wywołuje `ClassifyIncident` przez gRPC/mTLS. LLM zwraca kategorię i nazwę
modelu, zgodnie z [kontraktem protobuf](../proto/incident-classifier.md).

Retry, dzierżawy, fencing i deduplikacja wyniku są trwałe w PostgreSQL.
Po awarii inferencja może się powtórzyć; zapis skutku jest deduplikowany.
Broker nie jest źródłem prawdy o wykonaniu zadania. Redis nie jest wdrożony.
OTLP jest opcjonalny i obejmuje trace oraz metryki kolejki; podstawowy Compose
nie uruchamia Prometheusa ani Grafany. [Runbook messagingu](messaging-runbook.md).

Działanie workflow przy awarii LLM jest oddzielne od warunków startu Compose:
obecna konfiguracja wymaga zdrowego `llm_service` przy uruchamianiu backendu
i workera. Nie oznacza to, że świeży stos wystartuje bez gotowego modelu.

## Autoryzacja i HTTP

Better Auth obsługuje email/hasło, weryfikację emaila, reset hasła,
PassKeys/WebAuthn, kontrolę HIBP oraz organizacje. Social login pozostaje poza
wdrożonym zakresem. Role aplikacyjne:

| Rola | Zakres |
| --- | --- |
| `admin` | Organizacja i członkowie, incydenty organizacji, analityka i administracja. |
| `analityk` | Incydenty przypisane i wolne, przypisanie, statusy, notatki, raporty i sprawozdania. |
| `pracownik` | Tworzenie i odczyt własnych zgłoszeń oraz dostępnych dla niego plików. |

Gateway zapewnia origin validation, CSRF i limiter, Better Auth własne kontrole,
a Core autoryzację domenową, scope organizacji, walidację i limiter API.
NGINX i gateway mają limit body 50 MiB; Core konfiguruje parsery i Helmet.
`QUERY` jest bezpieczną metodą odczytu w modelu CSRF; nie zastępuje autoryzacji.
[Szczegółowy kontrakt HTTP](api.md).

## Email i storage

Weryfikacja emaila i reset hasła korzystają z callbacków Better Auth oraz
Nodemailera/SMTP. Konfigurację określają zmienne `SMTP_*` i `EMAIL_FROM_*`
w `.env.example`. Wysyłka nie została przeniesiona do notification workera.
Brak callbacku `sendInvitationEmail` oznacza, że nie należy zakładać wysyłki
wiadomości przez standardowy endpoint zaproszenia do organizacji.

`src/lib/storage.ts` używa `Bun.S3Client`; w Compose celem jest distributed
MinIO po HTTPS. Odczyt wymaga scope incydentu i metadanych pliku. Nowe klucze
zawierają UUID, a metadane SHA-256 służą do fingerprintu ponowienia operacji.
Upload nie jest częścią transakcji SQL; sprzątanie osieroconych obiektów
pozostaje ograniczeniem. [Realizacja plików i audytu](phase-3-core.md).

## Healthchecki

| Adres wewnętrzny | Sprawdzany stan |
| --- | --- |
| `backend`, `http://127.0.0.1:3335/health` | Połączenie z bazą, 200/503 z pustym body; sonda Compose. |
| `auth-service`, `http://127.0.0.1:3340/health` | Połączenie z bazą, JSON `ok`/`degraded`. |
| `classifier-worker`, `http://127.0.0.1:3334` | Świeżość udanego przebiegu relay i stan zatrzymywania. |
| `backend`, `/health` na listenerze mTLS | Starszy endpoint diagnostyczny bazy i SMTP; nie jest sondą Compose. |

Publiczny `/healthz` należy do NGINX i potwierdza wyłącznie działanie proxy.
`GET /api` zwraca metadane API z gateway. `GET /api/email/health` sprawdza SMTP
po przejściu przez uwierzytelniony gateway. Wewnętrzne `/health` nie są
publikowane jako publiczne API.

## Uruchomienie i rozwój

Pełna procedura obejmuje konfigurację `.env`, certyfikaty, build, start bazy,
`plan`/`apply` migracji i dopiero start usług:
[instrukcja wdrożenia](../infrastructure/deploy.md).
Samo `docker compose up backend` nie przygotowuje migracji ani publicznego auth.

Po przygotowaniu zależności i konfiguracji polecenia developerskie to:

```bash
bun run --cwd backend dev
bun run --cwd backend start:auth
bun backend/src/messaging/main.ts
```

To trzy oddzielne procesy, uruchamiane w osobnych terminalach. Wymagają
osiągalnych usług i poprawnych adresów/certyfikatów; nazwy DNS Compose nie są
automatycznie rozwiązywane na hoście. Rootowe `bun run dev` uruchamia frontend
oraz proces Core, bez auth i workera. Compose pozostaje bazową ścieżką.

Weryfikacja zmian aplikacji: lokalne kontrole workspace'ów, kontrakty HTTP,
integracje PostgreSQL/RabbitMQ i UI/E2E odpowiednie do zmienionej granicy.
[Kontrakt testowy](../testing/phase-1-ui-e2e.md) oraz raporty
[fazy 3](phase-3-core.md), [fazy 4](phase-4-messaging.md) i
[fazy 5](phase-5-identity.md) określają zakres i datowane wyniki.
