# BastionDesk - Backend API

Serwer backendowy oparty na **Express** + **Bun** z autoryzacją **Better-Auth**.

## Struktura projektu

```
backend/
├── src/
│   ├── index.ts              # Entry point - serwer Express
│   ├── lib/
│   │   ├── auth.ts           # Konfiguracja Better-Auth
│   │   ├── database.ts       # Bun SQL - natywny sterownik PostgreSQL
│   │   ├── email.ts          # Funkcje wysyłki emaili
│   │   ├── env.ts            # Zarządzanie zmiennymi środowiskowymi
│   │   └── permissions.ts    # Role i uprawnienia (AC)
│   ├── middleware/           # Middleware (auth, error handling)
│   ├── routes/               # Routing API
│   ├── services/             # Logika biznesowa
│   ├── templates/            # HTML templates dla emaili
│   │   ├── email-verification.ts
│   │   ├── password-reset.ts
│   │   └── invitation.ts
│   ├── types/                # Definicje typów TypeScript
│   │   └── index.ts
│   └── utils/                # Funkcje pomocnicze
│       ├── email-sender.ts   # Singleton NodeMailer
│       └── validation.ts     # Schematy Zod
├── package.json
├── tsconfig.json
└── README_BACKEND.md
```

## Połączenie z bazą danych

### Natywny sterownik Bun SQL

Backend wykorzystuje **natywny sterownik Bun SQL** do połączenia z PostgreSQL. Jest to wysokowydajny sterownik wbudowany w Bun, który używa tagged template literals.

```typescript
import { sql, transaction } from "@/lib/database";

// Proste zapytanie
const users = await sql`SELECT * FROM users WHERE active = ${true}`;

// Zapytanie z parametrami
const user = await sql`SELECT * FROM users WHERE id = ${userId}`;

// Transakcje
await transaction(async (tx) => {
  await tx`INSERT INTO users (name) VALUES (${"John"})`;
  await tx`INSERT INTO logs (action) VALUES (${"user_created"})`;
});
```

### Better-Auth

Better-Auth używa **pg Pool** (node-postgres) dla własnych operacji autoryzacyjnych. To oddzielne połączenie zapewnia kompatybilność z biblioteką Better-Auth.

## System Email (NodeMailer + Gmail SMTP)

Backend zawiera kompletny system wysyłki emaili oparty na **NodeMailer** z konfiguracją **Gmail SMTP**. System obsługuje wszystkie kluczowe funkcjonalności Better-Auth oraz zaproszenia do organizacji.

### Funkcjonalności email

- **Weryfikacja email** - automatyczna wysyłka po rejestracji
- **Reset hasła** - bezpieczny flow resetowania hasła z tokenami
- **Zaproszenia do organizacji** - email z linkiem aktywacyjnym
- **Responsywne templates** - HTML templates zgodne z designem aplikacji
- **Bezpieczeństwo** - ochrona przed timing attacks, walidacja tokenów

### Konfiguracja SMTP

Wymagane zmienne środowiskowe:

```bash
# SMTP Configuration
SMTP_HOST=...
SMTP_PORT=...
SMTP_SECURE=...
SMTP_USER=...
SMTP_APP_PASSWORD=...

# Email From
EMAIL_FROM_NAME=...
EMAIL_FROM_ADDRESS=...
```

### Przykład użycia

```typescript
import { sendVerificationEmail, sendResetPasswordEmail, sendOrganizationInvitation } from "@/lib/email";

// Weryfikacja email
await sendVerificationEmail({
  userName: "Jan Kowalski",
  userEmail: "jan@example.com",
  verificationUrl: "https://app.bastiondesk.com/verify?token=..."
});

// Reset hasła
await sendResetPasswordEmail({
  userName: "Jan Kowalski",
  userEmail: "jan@example.com",
  resetUrl: "https://app.bastiondesk.com/reset-password?token=..."
});

// Zaproszenie do organizacji
await sendOrganizationInvitation({
  userName: "Jan Kowalski",
  userEmail: "jan@example.com",
  organizationName: "Firma ABC",
  invitationUrl: "https://app.bastiondesk.com/invite?token=..."
});
```

### Architektura email

- **`email-sender.ts`** - Singleton wrapper dla NodeMailer z lazy initialization
- **`email.ts`** - Główny serwis z funkcjami wysyłki dla Better-Auth
- **`templates/`** - HTML templates z responsywnym design
- **Integracja Better-Auth** - automatyczna wysyłka emaili przez callbacki

## Funkcjonalności autoryzacji

- **Email/Password** - podstawowa autoryzacja z weryfikacją email
- **Password Management** - resetowanie i zmiana haseł z emailami
- **PassKeys (WebAuthn/U2F)** - klucze sprzętowe (YubiKey, Titan)
- **HaveIBeenPwned** - sprawdzanie kompromitacji haseł
- **Organizacje** - multi-tenancy z rolami i zaproszeniami email
- **Zarządzanie członkami** - zaproszenia, dodawanie, usuwanie i zmiana ról
- **Zespoły (Teams)** - grupowanie użytkowników

## Role użytkowników

| Rola       | Opis                     | Uprawnienia                                         |
|------------|--------------------------|-----------------------------------------------------|
| `admin`    | Administrator/Właściciel | Pełne uprawnienia do organizacji, członków, raportów |
| `analityk` | Analityk danych          | Dostęp do raportów i analityk                       |
| `pracownik`| Pracownik                | Podstawowy dostęp (tylko odczyt)                    |

## Uruchomienie

### Wymagania

- [Bun](https://bun.sh/) >= 1.3.5
- PostgreSQL 18+ (lub Docker)
- Node.js 24+
- Gmail account z **App Password** (dla SMTP)

### Zależności

- **Better-Auth** - autoryzacja i zarządzanie użytkownikami
- **NodeMailer** - wysyłka emaili przez SMTP
- **Bun SQL** - natywny sterownik PostgreSQL
- **Bun S3** - klient do MinIO/S3 storage
- **Zod** - walidacja danych
- **Express** - framework webowy

### Instalacja

```bash
cd backend

# Instalacja zależności
bun install

# Skopiuj i skonfiguruj zmienne środowiskowe
cp .env.example .env
# Edytuj .env i uzupełnij wartości
```

#### Konfiguracja Gmail SMTP

1. Włącz **2-Factor Authentication** na koncie Gmail
2. Wygeneruj **App Password** w ustawieniach Google Account
3. Skonfiguruj zmienne środowiskowe

### Uruchomienie developerskie

```bash
# Z hot-reload
bun run dev

# Lub bez watch mode
bun run start
```

### Sprawdzenie typów

```bash
bun run typecheck
```

## API Endpoints

### Health Check

```bash
GET /health
```

Odpowiedź:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "bastiondesk-backend"
}
```

### Better-Auth Endpoints

Wszystkie endpointy autoryzacji są dostępne pod `/api/auth/*`:

| Endpoint                          | Metoda | Opis                        |
|-----------------------------------|--------|-----------------------------|
| `/api/auth/sign-up/email`         | POST   | Rejestracja email/password  |
| `/api/auth/sign-in/email`         | POST   | Logowanie email/password    |
| `/api/auth/passkey/register`      | POST   | Rejestracja PassKey         |
| `/api/auth/sign-in/passkey`       | POST   | Logowanie PassKey           |
| `/api/auth/session`               | GET    | Pobierz aktualną sesję      |
| `/api/auth/request-password-reset`| POST   | Żądanie resetowania hasła   |
| `/api/auth/reset-password`        | POST   | Resetowanie hasła          |
| `/api/auth/change-password`       | POST   | Zmiana hasła użytkownika    |
| `/api/auth/organization/create`   | POST   | Utwórz organizację          |
| `/api/auth/organization/list`     | GET    | Lista organizacji           |
| `/api/auth/organization/invite-member`| POST | Zaproszenie członka do organizacji |
| `/api/auth/organization/add-member`| POST | Dodanie członka do organizacji |
| `/api/auth/organization/list-members`| GET | Lista członków organizacji  |
| `/api/auth/organization/update-member-role`| POST | Aktualizacja roli członka   |
| `/api/auth/organization/remove-member`| POST | Usunięcie członka z organizacji |
| `/api/auth/organization/get-active-member`| GET | Pobierz aktywnego członka   |
| `/api/auth/sign-out`              | POST   | Wylogowanie                 |

**Uwagi do email:**
- Endpointy `/api/auth/request-password-reset` i `/api/auth/reset-password` automatycznie wysyłają emaile
- `/api/auth/organization/invite-member` wysyła email z zaproszeniem
- Wszystkie emaile zawierają bezpieczne tokeny z ograniczonym czasem życia

### Email Health Check

```bash
GET /api/email/health
```

Odpowiedź:
```json
{
  "status": "ok",
  "smtp": {
    "connected": true,
    "host": "adres@hosta.pl",
    "port": "numer_portu"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Storage (MinIO / S3) - Bun native S3 client

Backend używa natywnego klienta S3 w Bun do pracy z MinIO.

Przykład użycia:

```typescript
import {
  putObject,
  getObjectBuffer,
  getObjectJson,
  deleteObject,
  presignObject,
} from "@/lib/storage";

// Zapis pliku
await putObject(`incidents/${incidentId}/file.bin`, buffer);

// Odczyt jako Buffer
const data = await getObjectBuffer(`incidents/${incidentId}/file.bin`);

// Odczyt jako JSON
const meta = await getObjectJson<{ foo: string }>(
  `incidents/${incidentId}/meta.json`
);

// Presigned URL (np. do pobierania)
const url = presignObject(`incidents/${incidentId}/file.bin`, {
  expiresIn: 3600, // 1h
  acl: "private",
});

// Usunięcie
await deleteObject(`incidents/${incidentId}/file.bin`);
```

Uwagi:
- `S3_ENDPOINT` wskazuje na `http://storage:9000` (usługa MinIO w docker-compose).
- Bucket `S3_BUCKET` jest tworzony automatycznie przy starcie serwisu `storage` (mc mb --ignore-existing).
- Prefiksy/ścieżki są częścią klucza; możesz budować je dowolnie, np. `incidents/{id}/attachments/{filename}`.
- `S3_REGION` dla MinIO może pozostać dowolny (np. `us-east-1`), jest wymagany tylko przez mechanizm podpisywania.
## Docker

```bash
# Z docker-compose (z głównego katalogu projektu)
docker-compose up -d backend

# Lub osobno
docker build -t bastiondesk-backend .
docker run -p 3333:3333 --env-file .env bastiondesk-backend
```