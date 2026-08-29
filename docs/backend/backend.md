# BastionDesk — backend API

Backend jest serwerem **Express 5** uruchamianym przez **Bun**. Odpowiada za
Better Auth, autoryzację organizacyjną, obsługę incydentów, komunikację z LLM,
MinIO/S3 oraz wysyłkę emaili.

## Struktura projektu

```text
backend/
├── src/
│   ├── index.ts                         # konfiguracja i start Express
│   ├── lib/
│   │   ├── auth.ts                      # Better Auth i pluginy
│   │   ├── csrf.ts                      # tokeny CSRF
│   │   ├── database.ts                  # Bun SQL oraz pg Pool
│   │   ├── email.ts                     # email weryfikacyjny i reset hasła
│   │   ├── env.ts                       # odczyt i walidacja środowiska
│   │   ├── llm-client.ts                # klient gRPC/mTLS klasyfikatora
│   │   ├── organization-helpers-plugin.ts
│   │   ├── passkey-check-plugin.ts
│   │   ├── permissions.ts               # role i access control
│   │   └── storage.ts                   # natywny klient Bun S3
│   ├── middleware/                      # auth, CSRF, rate limit i błędy
│   ├── routes/
│   │   ├── auth/                        # rejestracja z organizacją
│   │   ├── admin/                       # incydenty i analityka admina
│   │   ├── analyst/                     # workflow analityka
│   │   ├── shared/                      # współdzielona obsługa plików
│   │   └── incidents.ts                 # API incydentów pracownika i legacy
│   ├── templates/
│   │   ├── email-verification.ts
│   │   └── password-reset.ts
│   ├── types/
│   └── utils/
│       ├── email-sender.ts              # klient Nodemailer/SMTP
│       └── validation.ts                # schematy Zod
├── Dockerfile
├── package.json
└── tsconfig.json
```

W repozytorium nie ma obecnie osobnego katalogu `services/` ani szablonu emaila
z zaproszeniem do organizacji.

## Połączenie z bazą danych

Moduł `src/lib/database.ts` utrzymuje dwa typy połączeń przez PgBouncer i TLS:

- natywne `Bun.SQL` dla tagged template literals i transakcji;
- `pg.Pool` dla parametryzowanych zapytań tekstowych z placeholderami `$1`,
  `$2`, używanych przez większość routingu incydentów.

Better Auth tworzy dodatkowy `pg.Pool` we własnej konfiguracji. Wszystkie te
połączenia korzystają z `DATABASE_URL` lub danych PgBouncera oraz z certyfikatów
określonych przez `DB_TLS_CA_PATH`, `DB_TLS_CERT_PATH` i `DB_TLS_KEY_PATH`.

Przykład Bun SQL:

```typescript
import { sql, transaction } from "./lib/database";

const users = await sql`SELECT * FROM "user" WHERE "isActive" = ${true}`;

await transaction(async (tx) => {
  await tx`UPDATE member SET role = ${"analityk"} WHERE id = ${memberId}`;
});
```

Przykład helpera opartego na `pg.Pool`:

```typescript
import { queryOne } from "./lib/database";

const incident = await queryOne(
  'SELECT * FROM incidents WHERE id = $1 AND "organizationId" = $2',
  [incidentId, organizationId],
);
```

## Email przez SMTP

Backend używa Nodemailera z ogólną konfiguracją SMTP. Nie jest przywiązany do
Gmaila; może korzystać z dowolnego kompatybilnego serwera skonfigurowanego przez:

```dotenv
SMTP_HOST=...
SMTP_PORT=...
SMTP_SECURE=...
SMTP_USER=...
SMTP_APP_PASSWORD=...
EMAIL_FROM_NAME=...
EMAIL_FROM_ADDRESS=...
```

Obecnie zaimplementowane są dwa szablony i callbacki Better Auth:

- weryfikacja adresu email po rejestracji;
- reset hasła.

Konfiguracja `organization()` nie przekazuje obecnie callbacku
`sendInvitationEmail`, dlatego dokumentacja nie powinna zakładać wysyłki emaila
przez standardowy endpoint zaproszenia organizacyjnego.

Sygnatury funkcji serwisu email przyjmują obiekt użytkownika, URL i token:

```typescript
await sendVerificationEmail({ user, url, token });
await sendResetPasswordEmail({ user, url, token });
```

`GET /api/email/health` sprawdza połączenie SMTP i zwraca HTTP `200` dla
działającego połączenia lub `503` w przypadku błędu.

## Autoryzacja i organizacje

Konfiguracja w `src/lib/auth.ts` obejmuje:

- email i hasło, z obowiązkową weryfikacją emaila;
- hasła o długości od 10 do 128 znaków;
- sesję ważną 7 dni, odświeżaną co 24 godziny, z pięciominutowym cookie cache;
- PassKeys/WebAuthn;
- kontrolę skompromitowanych haseł HaveIBeenPwned;
- organizacje i role `admin`, `analityk`, `pracownik`;
- limit 5 organizacji na użytkownika;
- własny endpoint dodawania członka po emailu;
- własny publiczny endpoint sprawdzający dostępność PassKey dla emaila.

Role aplikacyjne:

| Rola | Aktualny zakres |
|---|---|
| `admin` | Zarządzanie organizacją i członkami, wszystkie incydenty organizacji, analityka i operacje administracyjne. |
| `analityk` | Lista incydentów przypisanych i wolnych, przypisanie, status, notatki, rozwiązanie, raporty i sprawozdania. |
| `pracownik` | Tworzenie incydentów oraz odczyt własnych zgłoszeń i dostępnych dla niego plików. |

Szczegółowy kontrakt HTTP znajduje się w [api.md](./api.md). Endpointy
generowane przez Better Auth należy wywoływać przez `authClient`, zwłaszcza
wielostopniowe operacje WebAuthn. Najważniejsze aktualne ścieżki sesji i resetu
hasła to:

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/auth/get-session` | GET | Aktualna sesja Better Auth. |
| `/api/auth/request-password-reset` | POST | Wysłanie linku resetującego. |
| `/api/auth/reset-password` | POST | Ustawienie nowego hasła. |
| `/api/auth/sign-up-with-organization/email` | POST | Własny flow rejestracji i utworzenia organizacji. |
| `/api/auth/organization/add-member-by-email` | POST | Własny helper dodający istniejącego użytkownika. |
| `/api/auth/passkey/check-availability` | POST | Własny helper UX sprawdzający liczbę PassKeys. |

## Warstwy ochronne HTTP

Serwer konfiguruje Helmet, allowlistę CORS, limit body `50mb`, rate limiting i
walidację Zod. Dla modyfikujących operacji aplikacyjnych pod `/api/incidents`,
`/api/admin` i `/api/analyst` wymagany jest token z `GET /api/csrf` przesyłany
w nagłówku `X-CSRF-Token`. Metoda `QUERY` jest traktowana jako bezpieczna w
modelu CSRF i służy do przekazywania walidowanych zapytań administratora w JSON.

## Healthcheck i metadane API

`GET /health` sprawdza bazę danych i SMTP. Zwraca HTTP `200` tylko wtedy, gdy
oba połączenia działają; w przeciwnym razie zwraca HTTP `503` i
`status: "degraded"`.

```json
{
  "status": "ok",
  "timestamp": "2026-08-29T12:00:00.000Z",
  "service": "bastiondesk-backend",
  "checks": {
    "database": "connected",
    "email": "connected"
  }
}
```

`GET /api` zwraca nazwę API, wersję `1.0.3` i podstawowe grupy endpointów.
Endpoint `/health` nie jest przekazywany przez publiczny reverse proxy w
aktualnym Compose; healthcheck kontenera wywołuje go lokalnie na porcie `3333`.

## Storage i LLM

`src/lib/storage.ts` używa natywnego `Bun.S3Client`. W Compose endpointem jest
`https://storage-1:9000`, bucket tworzy `storage-1`, a zaufanie do lokalnego CA
proces otrzymuje przez `NODE_EXTRA_CA_CERTS` i `SSL_CERT_FILE`.

Klucze plików są budowane pod prefiksem incydentu, np.
`incidents/{id}/attachments/{filename}`. API pobierania sprawdza organizację,
rolę i relację użytkownika z incydentem przed odczytem obiektu.

Klasyfikacja opisu odbywa się przez klienta gRPC na
`LLM_GRPC_TARGET=llm_service:8443` z mTLS. Kontrakt znajduje się w
[`proto/incident_classifier.proto`](../../proto/incident_classifier.proto).

## Uruchomienie

Wspierany sposób uruchomienia całego backendowego środowiska to Docker Compose z
katalogu głównego repozytorium:

```bash
cp .env.example .env
sh infra/tls/generate-dev-certs.sh
docker compose up --build backend
```

Jeśli `POSTGRES_USER` ma wartość inną niż domyślna, trzeba przekazać ją również
do `generate-dev-certs.sh`, ponieważ skrypt nie wczytuje `.env` automatycznie.

Backend nie działa samodzielnie bez dostępnych usług zależnych i certyfikatów:
PgBouncer/PostgreSQL, `llm_service`, MinIO oraz SMTP. Compose nie publikuje portu
`3333` na hoście; publiczny ruch `/api/*` przechodzi przez nginx pod
`http://localhost:4567`.

Do pracy developerskiej, po przygotowaniu `.env`, certyfikatów i usług
zależnych:

```bash
bun install --frozen-lockfile
bun run --cwd backend dev
bun run --cwd backend typecheck
bun run --cwd backend test
```
