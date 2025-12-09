# BastionDesk - API Documentation

Dokumentacja API dla aplikacji BastionDesk. Zawiera szczegółowe informacje o endpointach, strukturach JSON odpowiedzi oraz kodach błędów.

## Spis treści

- [Health Check](#health-check)
- [Better-Auth Endpoints](#better-auth-endpoints)
  - [Sign Up (Rejestracja)](#sign-up-rejestracja)
  - [Sign In (Logowanie)](#sign-in-logowanie)
  - [Session (Sesja)](#session-sesja)
  - [Password Management (Zarządzanie hasłem)](#password-management-zarządzanie-hasłem)
  - [Organization (Organizacja)](#organization-organizacja)
  - [PassKey (Klucze sprzętowe)](#passkey-klucze-sprzętowe)
  - [Sign Out (Wylogowanie)](#sign-out-wylogowanie)
- [Kody błędów](#kody-błędów)

## Health Check

### `GET /health`

**Opis:** Sprawdza status aplikacji i połączenie z bazą danych.

**Przykład curl:**
```bash
curl http://localhost:3333/health
```

**Response (Success):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "bastiondesk-backend"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "bastiondesk-backend",
  "error": "Database connection failed"
}
```

## Better-Auth Endpoints

Wszystkie endpointy autoryzacji są dostępne pod ścieżką `/api/auth/*`. Better-Auth automatycznie zarządza sesjami poprzez HTTP cookies.

### Sign Up (Rejestracja)

#### `POST /api/auth/sign-up/email`

**Opis:** Rejestruje nowego użytkownika z adresem email i hasłem.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'
```

**Response (Success):**
```json
{
  "user": {
    "id": "user_abc123def456",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  },
  "session": {
    "id": "session_xyz789",
    "userId": "user_abc123def456",
    "token": "session_token_here",
    "expiresAt": "2024-01-08T12:00:00.000Z",
    "ipAddress": "127.0.0.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Sign In (Logowanie)

#### `POST /api/auth/sign-in/email`

**Opis:** Loguje istniejącego użytkownika używając adresu email i hasła.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

**Response (Success):**
```json
{
  "user": {
    "id": "user_abc123def456",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  },
  "session": {
    "id": "session_xyz789",
    "userId": "user_abc123def456",
    "token": "session_token_here",
    "expiresAt": "2024-01-08T12:00:00.000Z",
    "ipAddress": "127.0.0.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Session (Sesja)

#### `GET /api/auth/session`

**Opis:** Pobiera informacje o aktualnej sesji użytkownika.

**Przykład curl:**
```bash
curl http://localhost:3333/api/auth/session \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success - zalogowany użytkownik):**
```json
{
  "user": {
    "id": "user_abc123def456",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  },
  "session": {
    "id": "session_xyz789",
    "userId": "user_abc123def456",
    "token": "session_token_here",
    "expiresAt": "2024-01-08T12:00:00.000Z",
    "ipAddress": "127.0.0.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Response (Success - niezalogowany użytkownik):**
```json
{
  "user": null,
  "session": null
}
```

### Password Management (Zarządzanie hasłem)

#### `POST /api/auth/request-password-reset`

**Opis:** Wysyła email z linkiem do resetowania hasła. Jeśli użytkownik o podanym adresie email istnieje, otrzyma wiadomość z linkiem do resetowania hasła.

**Request Body:**
```json
{
  "email": "user@example.com",
  "redirectTo": "https://app.example.com/reset-password"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "redirectTo": "https://app.example.com/reset-password"
  }'
```

**Response (Success):**
```json
{
  "message": "Jeśli podany adres email istnieje w systemie, wiadomość z linkiem do resetowania hasła została wysłana."
}
```

#### `POST /api/auth/reset-password`

**Opis:** Resetuje hasło użytkownika używając tokenu otrzymanego w emailu. Token jest zawarty w linku przesłanym na adres email użytkownika.

**Request Body:**
```json
{
  "newPassword": "newSecurePassword123!",
  "token": "reset_token_from_email_link"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "newPassword": "newSecurePassword123!",
    "token": "reset_token_from_email_link"
  }'
```

**Response (Success):**
```json
{
  "message": "Hasło zostało pomyślnie zresetowane."
}
```

#### `POST /api/auth/change-password`

**Opis:** Zmienia hasło zalogowanego użytkownika. Wymaga podania aktualnego hasła w celu weryfikacji tożsamości.

**Request Body:**
```json
{
  "newPassword": "newSecurePassword123!",
  "currentPassword": "currentPassword123!",
  "revokeOtherSessions": false
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "newPassword": "newSecurePassword123!",
    "currentPassword": "currentPassword123!",
    "revokeOtherSessions": false
  }'
```

**Response (Success):**
```json
{
  "message": "Hasło zostało pomyślnie zmienione."
}
```

### Organization (Organizacja)

#### `POST /api/auth/organization/create`

**Opis:** Tworzy nową organizację.

**Request Body:**
```json
{
  "name": "Moja Firma",
  "slug": "moja-firma"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/organization/create \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "name": "Moja Firma",
    "slug": "moja-firma"
  }'
```

**Response (Success):**
```json
{
  "organization": {
    "id": "org_abc123",
    "name": "Moja Firma",
    "slug": "moja-firma",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "metadata": {}
  },
  "member": {
    "id": "member_xyz789",
    "userId": "user_abc123def456",
    "organizationId": "org_abc123",
    "role": "admin",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

#### `GET /api/auth/organization/list`

**Opis:** Pobiera listę organizacji użytkownika.

**Przykład curl:**
```bash
curl http://localhost:3333/api/auth/organization/list \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
[
  {
    "id": "org_abc123",
    "name": "Moja Firma",
    "slug": "moja-firma",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "metadata": {},
    "role": "admin"
  }
]
```

#### `GET /api/auth/organization/full`

**Opis:** Pobiera pełną informację o aktywnej organizacji wraz z członkami.

**Przykład curl:**
```bash
curl http://localhost:3333/api/auth/organization/full \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "id": "org_abc123",
  "name": "Moja Firma",
  "slug": "moja-firma",
  "createdAt": "2024-01-01T12:00:00.000Z",
  "metadata": {},
  "members": [
    {
      "id": "member_xyz789",
      "userId": "user_abc123def456",
      "organizationId": "org_abc123",
      "role": "admin",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "user": {
        "id": "user_abc123def456",
        "email": "user@example.com",
        "name": "John Doe",
        "emailVerified": true,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    }
  ]
}
```

#### `POST /api/auth/organization/invite-member`

**Opis:** Wysyła zaproszenie do dołączenia do organizacji. Użytkownik otrzymuje email z linkiem do rejestracji i automatycznego dołączenia do organizacji.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "role": "pracownik"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/organization/invite-member \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "email": "newuser@example.com",
    "role": "pracownik"
  }'
```

**Response (Success):**
```json
{
  "invitation": {
    "id": "inv_abc123",
    "email": "newuser@example.com",
    "role": "pracownik",
    "organizationId": "org_xyz789",
    "expiresAt": "2024-01-08T12:00:00.000Z",
    "status": "pending"
  }
}
```

#### `POST /api/auth/organization/add-member`

**Opis:** Dodaje istniejącego użytkownika bezpośrednio do organizacji (bez zaproszenia).

**Request Body:**
```json
{
  "userId": "user_existing123",
  "role": "pracownik"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/organization/add-member \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "userId": "user_existing123",
    "role": "pracownik"
  }'
```

**Response (Success):**
```json
{
  "member": {
    "id": "member_new456",
    "userId": "user_existing123",
    "organizationId": "org_xyz789",
    "role": "pracownik",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "user": {
      "id": "user_existing123",
      "email": "existing@example.com",
      "name": "Existing User",
      "emailVerified": true,
      "createdAt": "2024-01-01T10:00:00.000Z",
      "updatedAt": "2024-01-01T10:00:00.000Z"
    }
  }
}
```

#### `GET /api/auth/organization/list-members`

**Opis:** Pobiera paginowaną listę wszystkich członków organizacji.

**Query Parameters:**
- `limit` (number, optional) - Liczba członków do zwrócenia (domyślnie: 100)
- `offset` (number, optional) - Przesunięcie (domyślnie: 0)
- `sortBy` (string, optional) - Pole do sortowania (domyślnie: "createdAt")
- `sortDirection` ("asc" | "desc", optional) - Kierunek sortowania (domyślnie: "desc")

**Przykład curl:**
```bash
curl "http://localhost:3333/api/auth/organization/list-members?limit=10&sortBy=createdAt&sortDirection=desc" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "members": [
    {
      "id": "member_xyz789",
      "userId": "user_abc123def456",
      "organizationId": "org_xyz789",
      "role": "admin",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "user": {
        "id": "user_abc123def456",
        "email": "admin@example.com",
        "name": "Admin User",
        "emailVerified": true,
        "createdAt": "2024-01-01T10:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    },
    {
      "id": "member_new456",
      "userId": "user_existing123",
      "organizationId": "org_xyz789",
      "role": "pracownik",
      "createdAt": "2024-01-01T13:00:00.000Z",
      "user": {
        "id": "user_existing123",
        "email": "worker@example.com",
        "name": "Worker User",
        "emailVerified": true,
        "createdAt": "2024-01-01T11:00:00.000Z",
        "updatedAt": "2024-01-01T11:00:00.000Z"
      }
    }
  ],
  "total": 2,
  "limit": 10,
  "offset": 0
}
```

#### `POST /api/auth/organization/update-member-role`

**Opis:** Aktualizuje rolę członka organizacji.

**Request Body:**
```json
{
  "memberId": "member_new456",
  "role": "analityk"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/organization/update-member-role \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "memberId": "member_new456",
    "role": "analityk"
  }'
```

**Response (Success):**
```json
{
  "member": {
    "id": "member_new456",
    "userId": "user_existing123",
    "organizationId": "org_xyz789",
    "role": "analityk",
    "createdAt": "2024-01-01T13:00:00.000Z",
    "user": {
      "id": "user_existing123",
      "email": "worker@example.com",
      "name": "Worker User",
      "emailVerified": true,
      "createdAt": "2024-01-01T11:00:00.000Z",
      "updatedAt": "2024-01-01T13:00:00.000Z"
    }
  }
}
```

#### `POST /api/auth/organization/remove-member`

**Opis:** Usuwa członka z organizacji.

**Request Body:**
```json
{
  "memberIdOrEmail": "member_new456"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/organization/remove-member \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "memberIdOrEmail": "member_new456"
  }'
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Członek został usunięty z organizacji"
}
```

#### `GET /api/auth/organization/get-active-member`

**Opis:** Pobiera informacje o aktualnym członkowstwie użytkownika w aktywnej organizacji.

**Przykład curl:**
```bash
curl http://localhost:3333/api/auth/organization/get-active-member \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "id": "member_xyz789",
  "userId": "user_abc123def456",
  "organizationId": "org_xyz789",
  "role": "admin",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

### PassKey (Klucze sprzętowe)

#### `POST /api/auth/passkey/register`

**Opis:** Rozpoczyna rejestrację nowego klucza sprzętowego (WebAuthn).

**Request Body:**
```json
{
  "name": "Mój YubiKey"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/passkey/register \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "name": "Mój YubiKey"
  }'
```

**Response (Success - krok 1):**
```json
{
  "challenge": "challenge_data_here",
  "rp": {
    "name": "BastionDesk",
    "id": "localhost"
  },
  "user": {
    "id": "user_abc123def456",
    "name": "user@example.com",
    "displayName": "John Doe"
  },
  "pubKeyCredParams": [
    {
      "alg": -7,
      "type": "public-key"
    }
  ],
  "timeout": 60000,
  "attestation": "direct"
}
```

#### `POST /api/auth/passkey/sign-in`

**Opis:** Rozpoczyna logowanie za pomocą klucza sprzętowego.

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/passkey/sign-in \
  -H "Content-Type: application/json"
```

**Response (Success - krok 1):**
```json
{
  "challenge": "challenge_data_here",
  "allowCredentials": [
    {
      "type": "public-key",
      "id": "credential_id_here"
    }
  ],
  "timeout": 60000,
  "userVerification": "preferred"
}
```

### Sign Out (Wylogowanie)

#### `POST /api/auth/sign-out`

**Opis:** Wylogowuje aktualnego użytkownika i kończy sesję.

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/sign-out \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true
}
```

## Kody błędów

### Ogólne kody błędów

| Kod | Status HTTP | Opis |
|-----|-------------|------|
| `UNAUTHORIZED` | 401 | Brak autoryzacji - użytkownik niezalogowany |
| `FORBIDDEN` | 403 | Brak uprawnień do wykonania akcji |
| `NOT_FOUND` | 404 | Zasób nie został znaleziony |
| `VALIDATION_ERROR` | 400 | Błędne dane wejściowe |
| `INTERNAL_ERROR` | 500 | Błąd serwera |

### Kody błędów Better-Auth

| Kod | Status HTTP | Opis |
|-----|-------------|------|
| `EMAIL_NOT_VERIFIED` | 403 | Email użytkownika nie został zweryfikowany |
| `INVALID_EMAIL_OR_PASSWORD` | 401 | Nieprawidłowy email lub hasło |
| `EMAIL_ALREADY_EXISTS` | 409 | Użytkownik z tym adresem email już istnieje |
| `PASSWORD_TOO_WEAK` | 400 | Hasło jest zbyt słabe (minimum 12 znaków) |
| `PASSWORD_COMPROMISED` | 400 | Hasło zostało znalezione w wyciekach danych |
| `INVALID_CREDENTIALS` | 401 | Nieprawidłowe dane logowania |
| `SESSION_EXPIRED` | 401 | Sesja wygasła |
| `ORGANIZATION_NOT_FOUND` | 404 | Organizacja nie została znaleziona |
| `USER_NOT_MEMBER` | 403 | Użytkownik nie jest członkiem organizacji |
| `ROLE_NOT_ALLOWED` | 403 | Użytkownik nie ma wymaganej roli |
| `INVALID_RESET_TOKEN` | 400 | Nieprawidłowy lub wygasły token resetowania hasła |
| `PASSWORD_RESET_TOO_MANY_REQUESTS` | 429 | Zbyt wiele próśb resetowania hasła |
| `CURRENT_PASSWORD_INCORRECT` | 400 | Aktualne hasło jest nieprawidłowe |
| `PASSWORD_RESET_SUCCESS` | 200 | Hasło zostało pomyślnie zresetowane |

### Przykładowe odpowiedzi błędów

**Błąd autoryzacji:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Wymagane zalogowanie"
  }
}
```

**Błąd walidacji:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Nieprawidłowe dane wejściowe",
    "details": {
      "email": "Nieprawidłowy format adresu email",
      "password": "Hasło musi mieć minimum 12 znaków"
    }
  }
}
```

**Błąd Better-Auth:**
```json
{
  "error": {
    "code": "INVALID_EMAIL_OR_PASSWORD",
    "message": "Nieprawidłowy email lub hasło"
  }
}
```
