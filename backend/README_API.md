# BastionDesk - API Documentation

Dokumentacja API dla aplikacji BastionDesk. Zawiera szczegółowe informacje o endpointach, strukturach JSON odpowiedzi oraz kodach błędów.

## Przegląd API

### Formaty danych

#### Daty i czas
Wszystkie pola dat w API są zwracane jako **ciągi znaków w formacie ISO 8601** bez informacji o strefie czasowej (ponieważ baza danych przechowuje `timestamp` zamiast `timestamptz`):

```json
{
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T13:30:00.000Z",
  "dataZgloszenia": "2024-01-01T10:15:30.000Z"
}
```

**Uwagi:**
- Wszystkie daty są w UTC
- Format: `YYYY-MM-DDTHH:mm:ss.sssZ`
- Wysyłanie dat do API również powinno być w tym formacie

BastionDesk API jest podzielone na kilka głównych modułów:

### 🔐 **Autoryzacja (Better-Auth)**
- **Ścieżka bazowa:** `/api/auth/*`
- **Opis:** Kompletne rozwiązanie autoryzacyjne z obsługą email/hasło, PassKeys, organizacji i zarządzania użytkownikami
- **Dokumentacja:** [Better-Auth Documentation](https://better-auth.com/)

### 👤 **Pracownicy (Employees)**
- **Ścieżka bazowa:** `/api/employee/*`
- **Uprawnienia:** `pracownik`, `analityk`, `admin`
- **Funkcjonalności:**
  - Zgłaszanie incydentów
  - Przeglądanie własnych zgłoszeń
  - Pobieranie raportów i sprawozdań

### 🔍 **Analitycy (Analysts)**
- **Ścieżka bazowa:** `/api/analyst/*`
- **Uprawnienia:** `analityk`, `admin`
- **Funkcjonalności:**
  - Przeglądanie incydentów w organizacji
  - Analiza i rozwiązywanie problemów
  - Tworzenie raportów i sprawozdań

### 👑 **Administratorzy (Admins)**
- **Ścieżka bazowa:** `/api/admin/*`
- **Uprawnienia:** `admin`
- **Funkcjonalności:**
  - Przeglądanie wszystkich incydentów w organizacji (z filtrowaniem i paginacją)
  - Szczegółowe statystyki: liczba zgłoszeń, rozwiązań, średni czas
  - Szczegółowe metryki: serie czasowe, top użytkownicy i analitycy
  - Pełny dostęp do wszystkich plików w organizacji

### ⚙️ **System**
- **Health Check:** `GET /health` - Status aplikacji i bazy danych
- **API Info:** `GET /api` - Informacje o dostępnych endpointach

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
- [Incidents API - Pracownicy](#incidents-api-pracownicy)
  - [Zgłaszanie incydentu](#zgłaszanie-incydentu)
  - [Pobieranie własnych incydentów](#pobieranie-własnych-incydentów)
  - [Szczegóły incydentu](#szczegóły-incydentu)
  - [Pobieranie raportów](#pobieranie-raportów)
  - [Pobieranie sprawozdań](#pobieranie-sprawozdań)
- [Incidents API - Analitycy](#incidents-api-analitycy)
  - [Incydenty przypisane](#incydenty-przypisane)
  - [Incydenty nieprzypisane](#incydenty-nieprzypisane)
- [Incidents API - Administratorzy](#incidents-api-administratorzy)
  - [Wszystkie incydenty](#wszystkie-incydenty)
  - [Szczegóły incydentu](#szczegóły-incydentu-admin)
  - [Statystyki incydentów](#statystyki-incydentów)
  - [Szczegółowe metryki](#szczegółowe-metryki)
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

#### `POST /api/auth/sign-up-with-organization/email`

**Opis:** Rejestruje użytkownika oraz tworzy organizację w tym samym kroku. Użytkownik automatycznie otrzymuje rolę `admin` w utworzonej organizacji.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe",
  "organizationName": "Moja Firma",
  "organizationSlug": "moja-firma",
  "organizationLogo": "https://example.com/logo.png"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/auth/sign-up-with-organization/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe",
    "organizationName": "Moja Firma",
    "organizationSlug": "moja-firma"
  }'
```

**Response (Success):**
```json
{
  "user": {
    "id": "user_abc123def456",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "session": {
    "id": "session_xyz789",
    "userId": "user_abc123def456"
  },
  "organization": {
    "id": "org_123456",
    "name": "Moja Firma",
    "slug": "moja-firma"
  },
  "member": {
    "userId": "user_abc123def456",
    "organizationId": "org_123456",
    "role": "admin"
  }
}
```

**Uwagi:**
- Endpoint opakowuje standardowe funkcje Better-Auth: `signUpEmail` + `organization.create`
- Cookies sesyjne są ustawiane tak samo jak w standardowym `/api/auth/sign-up/email`

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
    "status": "Zgłoszony"
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

## Incidents API - Pracownicy

Wszystkie endpointy dla pracowników wymagają autoryzacji z rolą `pracownik` lub wyższą. Dostęp mają tylko do własnych incydentów w ramach swojej organizacji.

### Zgłaszanie incydentu

#### `POST /api/employee/incidents`

**Opis:** Tworzy nowe zgłoszenie incydentu przez pracownika.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "userDescription": "Opis problemu - co się stało, jakie objawy...",
  "userScreenshotPath": "incidents/uuid/screenshots/screenshot1.png",
  "userScreenshotMetadata": {
    "bucket": "bastiondesk-bucket",
    "filename": "screenshot1.png",
    "mimeType": "image/png",
    "size": 102400
  },
  "userAttachmentPath": "incidents/uuid/attachments/log.txt",
  "userAttachmentMetadata": {
    "bucket": "bastiondesk-bucket",
    "filename": "log.txt",
    "mimeType": "text/plain",
    "size": 5120
  }
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/employee/incidents \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "userDescription": "Aplikacja zawiesza się przy logowaniu",
    "userScreenshotPath": "incidents/uuid/screenshots/error.png",
    "userScreenshotMetadata": {
      "bucket": "bastiondesk-bucket",
      "filename": "error.png",
      "mimeType": "image/png",
      "size": 245760
    },
    "userAttachmentPath": null,
    "userAttachmentMetadata": null
  }'
```

**Response (Success - 201):**
```json
{
  "success": true,
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "dataZgloszenia": "2024-01-01T12:00:00.000Z",
    "status": "Zgłoszony",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "filesUploaded": {
      "screenshots": 1,
      "attachments": 0
    }
  }
}
```

**Uwagi:**
- Pliki są automatycznie uploadowane do storage (MinIO/S3) podczas tworzenia zgłoszenia
- Screenshoty są dostępne pod ścieżką: `incidents/{incidentId}/screenshots/{filename}`
- Załączniki są dostępne pod ścieżką: `incidents/{incidentId}/attachments/{filename}`
- Metadane plików są przechowywane w bazie danych dla szybkiego dostępu

### Pobieranie własnych incydentów

#### `GET /api/employee/incidents`

**Opis:** Pobiera listę własnych incydentów pracownika z paginacją, filtrowaniem i sortowaniem.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `page` (number, optional) - Numer strony (domyślnie: 1)
- `limit` (number, optional) - Liczba wyników na stronę (domyślnie: 20, max: 100)
- `status` (string, optional) - Filtrowanie po statusie (`Zgłoszony`, `Raport w trakcie`, `Raport złożony`, `Sprawozdanie w trakcie`, `Sprawozdanie złożone`, `Odrzucone`)
- `sortBy` (string, optional) - Pole sortowania (`createdAt`, `updatedAt`, `status`, `dataZgloszenia`) - domyślnie: `createdAt`
- `sortOrder` (string, optional) - Kierunek sortowania (`asc`, `desc`) - domyślnie: `desc`

**Przykład curl:**
```bash
curl "http://localhost:3333/api/employee/incidents?page=1&limit=10&status=Zgłoszony&sortBy=createdAt&sortOrder=desc" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_abc123",
      "organizationId": "org_xyz789",
      "status": "Zgłoszony",
      "userDescription": "Aplikacja zawiesza się przy logowaniu",
      "userScreenshotPath": null,
      "userScreenshotMetadata": null,
      "userAttachmentPath": null,
      "userAttachmentMetadata": null,
      "analystId": null,
      "analystNote": null,
      "czyRozwiazany": false,
      "dataRozwiazania": null,
      "analystReportPath": null,
      "analystReportMetadata": null,
      "analystReportData": null,
      "analystStatementPath": null,
      "analystStatementMetadata": null,
      "analystStatementData": null,
      "llmCategory": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

### Szczegóły incydentu

#### `GET /api/employee/incidents/:id`

**Opis:** Pobiera szczegółowe informacje o własnym incydencie.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl http://localhost:3333/api/employee/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "dataZgloszenia": "2024-01-01T12:00:00.000Z",
    "userId": "user_abc123",
    "organizationId": "org_xyz789",
    "status": "Raport w trakcie",
    "userDescription": "Aplikacja zawiesza się przy logowaniu",
    "userScreenshotPath": null,
    "userScreenshotMetadata": null,
    "userAttachmentPath": null,
    "userAttachmentMetadata": null,
    "analystId": "user_analyst456",
    "analystNote": "Sprawdzam logi systemowe...",
    "czyRozwiazany": false,
    "dataRozwiazania": null,
    "analystReport": null,
    "analystReportData": null,
    "analystStatement": null,
    "analystStatementData": null,
    "llmCategory": "Żółty",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T13:30:00.000Z"
  }
}
```

### Pobieranie raportów

#### `GET /api/employee/incidents/:id/reports`

**Opis:** Pobiera raporty analityka dla własnego incydentu.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl http://localhost:3333/api/employee/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "technical_analysis": "Analiza techniczna problemu...",
    "findings": "Znalezione przyczyny...",
    "recommendations": "Zalecenia rozwiązania..."
  }
}
```

### Pobieranie sprawozdań

#### `GET /api/employee/incidents/:id/statements`

**Opis:** Pobiera sprawozdania analityka dla własnego incydentu.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl http://localhost:3333/api/employee/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/statements \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "resolution_summary": "Podsumowanie rozwiązania...",
    "actions_taken": "Podjęte działania...",
    "preventive_measures": "Środki zapobiegawcze..."
  }
}
```

## Incidents API - Analitycy

Wszystkie endpointy dla analityków wymagają autoryzacji z rolą `analityk` lub wyższą. Dostęp do wszystkich incydentów w ramach swojej organizacji.

### Incydenty przypisane

#### `GET /api/analyst/incidents/assigned`

**Opis:** Pobiera incydenty przypisane do aktualnego analityka.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `page` (number, optional) - Numer strony (domyślnie: 1)
- `limit` (number, optional) - Liczba wyników na stronę (domyślnie: 20, max: 100)
- `status` (string, optional) - Filtrowanie po statusie

**Przykład curl:**
```bash
curl "http://localhost:3333/api/analyst/incidents/assigned?page=1&limit=10&status=Raport w trakcie" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_employee123",
      "organizationId": "org_xyz789",
      "status": "Raport w trakcie",
      "userDescription": "Problem z aplikacją",
      "analystId": "user_analyst456",
      "analystNote": "Sprawdzam logi systemowe...",
      "czyRozwiazany": false,
      "userName": "Jan Kowalski",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

### Incydenty nieprzypisane

#### `GET /api/analyst/incidents/unassigned`

**Opis:** Pobiera nieprzypisane incydenty w organizacji analityka.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:** takie same jak dla endpointu `/assigned`

**Przykład curl:**
```bash
curl "http://localhost:3333/api/analyst/incidents/unassigned?page=1&limit=5" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_employee123",
      "organizationId": "org_xyz789",
      "status": "Zgłoszony",
      "userDescription": "Problem z synchronizacją danych",
      "analystId": null,
      "userName": "Jan Kowalski",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 2,
    "totalPages": 1
  }
}
```

### Przypisanie incydentu

#### `POST /api/analyst/incidents/:id/assign`

**Opis:** Przypisuje nieprzypisane zgłoszenie do bieżącego analityka i zmienia status na "Raport w trakcie".

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/assign \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Zgłoszenie zostało przypisane do Ciebie",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "analystId": "user_analyst456",
    "status": "Raport w trakcie"
  }
}
```

### Oddanie incydentu do puli

#### `POST /api/analyst/incidents/:id/unassign`

**Opis:** Oddaje przypisane zgłoszenie z powrotem do puli nieprzypisanych incydentów.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/unassign \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Zgłoszenie zostało oddane do puli",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "analystId": null,
    "status": "Zgłoszony"
  }
}
```

### Zmiana statusu

#### `PUT /api/analyst/incidents/:id/status`

**Opis:** Zmienia status zgłoszenia zgodnie z dozwolonymi przejściami.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Request Body:**
```json
{
  "status": "Raport złożony"
}
```

**Dozwolone przejścia statusów:**
- `Zgłoszony` → `Raport w trakcie`, `Odrzucone`
- `Raport w trakcie` → `Raport złożony`
- `Raport złożony` → `Sprawozdanie w trakcie`
- `Sprawozdanie w trakcie` → `Sprawozdanie złożone`

**Przykład curl:**
```bash
curl -X PUT http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/status \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{"status": "Raport złożony"}'
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Status zgłoszenia został zaktualizowany",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "oldStatus": "Raport w trakcie",
    "newStatus": "Raport złożony"
  }
}
```

### Zapisywanie notatek

#### `PUT /api/analyst/incidents/:id/notes`

**Opis:** Dodaje lub aktualizuje notatki analityka dotyczące zgłoszenia.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Request Body:**
```json
{
  "notes": "Sprawdziłem logi systemowe. Problem wydaje się być związany z konfiguracją bazy danych..."
}
```

**Przykład curl:**
```bash
curl -X PUT http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/notes \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{"notes": "Sprawdziłem logi systemowe..."}'
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Notatki zostały zaktualizowane",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "analystNote": "Sprawdziłem logi systemowe..."
  }
}
```

### Oznaczenie jako rozwiązane

#### `PUT /api/analyst/incidents/:id/resolve`

**Opis:** Oznacza zgłoszenie jako rozwiązane i ustawia datę rozwiązania. Rozwiązanie incydentu jest niezależne od statusu i może być wykonane w dowolnym momencie.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl -X PUT http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/resolve \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Zgłoszenie zostało oznaczone jako rozwiązane",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "czyRozwiazany": true,
    "dataRozwiazania": "2024-01-01T14:30:00.000Z"
  }
}
```

**Uwagi:**
- Rozwiązanie incydentu jest niezależne od raportu i sprawozdania
- Można oznaczyć jako rozwiązane w dowolnym statusie
- Po oznaczeniu jako rozwiązane, incydent nie może być ponownie otwarty

### Szczegóły incydentu

#### `GET /api/analyst/incidents/:id`

**Opis:** Pobiera szczegółowe informacje o dowolnym incydencie w organizacji analityka.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "dataZgloszenia": "2024-01-01T12:00:00.000Z",
    "userId": "user_employee123",
    "organizationId": "org_xyz789",
    "status": "Raport złożony",
    "userDescription": "Problem z aplikacją",
    "userScreenshotData": [],
    "userAttachmentData": [],
    "analystId": "user_analyst456",
    "analystNote": "Problem rozwiązany poprzez restart serwera bazy danych",
    "czyRozwiazany": false,
    "analystReportPath": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports/analysis.pdf",
    "analystReportMetadata": {
      "path": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports/analysis.pdf",
      "bucket": "bastiondesk-bucket",
      "filename": "analysis.pdf",
      "mimeType": "application/pdf",
      "size": 245760
    },
    "userName": "Jan Kowalski",
    "analystName": "Anna Nowak"
  }
}
```

### Wgrywanie raportu

#### `POST /api/analyst/incidents/:id/reports`

**Opis:** Przesyła raport analityka dotyczący zgłoszenia i zmienia status na "Raport złożony".

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Request Body:**
```json
{
  "reportData": {
    "filename": "analysis_report.pdf",
    "data": "base64_encoded_pdf_data",
    "mimeType": "application/pdf"
  }
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "reportData": {
      "filename": "analysis_report.pdf",
      "data": "base64_encoded_pdf_data_here",
      "mimeType": "application/pdf"
    }
  }'
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Raport został przesłany",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "analystReportPath": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports/analysis.pdf",
    "analystReportMetadata": {
      "path": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports/analysis_report.pdf",
      "bucket": "bastiondesk-bucket",
      "filename": "analysis_report.pdf",
      "mimeType": "application/pdf",
      "size": 245760
    },
    "analystReportData": "2024-01-01T14:00:00.000Z",
    "status": "Raport złożony"
  }
}
```

### Wgrywanie sprawozdania

#### `POST /api/analyst/incidents/:id/statements`

**Opis:** Przesyła sprawozdanie analityka dotyczące zgłoszenia i zmienia status na "Sprawozdanie złożone".

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
Content-Type: application/json
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Request Body:**
```json
{
  "statementData": {
    "filename": "final_statement.docx",
    "data": "base64_encoded_docx_data",
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/statements \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session=session_token_here" \
  -d '{
    "statementData": {
      "filename": "final_statement.docx",
      "data": "base64_encoded_docx_data_here",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
  }'
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Sprawozdanie zostało przesłane",
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "analystStatementPath": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/statements/final_statement.docx",
    "analystStatementMetadata": {
      "bucket": "bastiondesk-bucket",
      "filename": "final_statement.docx",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size": 189440
    },
    "analystStatementData": "2024-01-01T15:00:00.000Z",
    "status": "Sprawozdanie złożone"
  }
}
```

## Incidents API - Analitycy

Wszystkie endpointy dla analityków wymagają autoryzacji z rolą `analityk` lub wyższą. Dostęp do wszystkich incydentów w ramach swojej organizacji.

### Incydenty przypisane

#### `GET /api/analyst/incidents/assigned`

**Opis:** Pobiera incydenty przypisane do aktualnego analityka.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `page` (number, optional) - Numer strony (domyślnie: 1)
- `limit` (number, optional) - Liczba wyników na stronę (domyślnie: 20, max: 100)
- `status` (string, optional) - Filtrowanie po statusie
- `sortBy` (string, optional) - Pole sortowania (domyślnie: `createdAt`)
- `sortOrder` (string, optional) - Kierunek sortowania (domyślnie: `desc`)

**Przykład curl:**
```bash
curl "http://localhost:3333/api/analyst/incidents/assigned?page=1&limit=10&status=Raport w trakcie" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_employee123",
      "organizationId": "org_xyz789",
      "status": "Raport w trakcie",
      "userDescription": "Aplikacja zawiesza się przy logowaniu",
      "userScreenshotPath": null,
      "userScreenshotMetadata": null,
      "userAttachmentPath": null,
      "userAttachmentMetadata": null,
      "analystId": "user_analyst456",
      "analystNote": "Sprawdzam logi systemowe...",
      "czyRozwiazany": false,
      "dataRozwiazania": null,
      "analystReportPath": null,
      "analystReportMetadata": null,
      "analystReportData": null,
      "analystStatementPath": null,
      "analystStatementMetadata": null,
      "analystStatementData": null,
      "llmCategory": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T13:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

### Incydenty nieprzypisane

#### `GET /api/analyst/incidents/unassigned`

**Opis:** Pobiera nieprzypisane incydenty w organizacji analityka.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:** takie same jak dla endpointu `/assigned`

**Przykład curl:**
```bash
curl "http://localhost:3333/api/analyst/incidents/unassigned?page=1&limit=5" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_employee123",
      "organizationId": "org_xyz789",
      "status": "Zgłoszony",
      "userDescription": "Problem z synchronizacją danych",
      "userScreenshotPath": null,
      "userScreenshotMetadata": null,
      "userAttachmentPath": null,
      "userAttachmentMetadata": null,
      "analystId": null,
      "analystNote": null,
      "czyRozwiazany": false,
      "dataRozwiazania": null,
      "analystReportPath": null,
      "analystReportMetadata": null,
      "analystReportData": null,
      "analystStatementPath": null,
      "analystStatementMetadata": null,
      "analystStatementData": null,
      "llmCategory": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 2,
    "totalPages": 1
  }
}
```

## Incidents API - Administratorzy

Wszystkie endpointy dla administratorów wymagają autoryzacji z rolą `admin`. Dostęp do wszystkich incydentów w ramach swojej organizacji.

### Wszystkie incydenty

#### `GET /api/admin/incidents`

**Opis:** Pobiera wszystkie incydenty w organizacji administratora z paginacją, filtrowaniem i sortowaniem.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `page` (number, optional) - Numer strony (domyślnie: 1)
- `limit` (number, optional) - Liczba wyników na stronę (domyślnie: 20, max: 100)
- `status` (string, optional) - Filtrowanie po statusie (`Zgłoszony`, `Raport w trakcie`, `Raport złożony`, `Sprawozdanie w trakcie`, `Sprawozdanie złożone`, `Odrzucone`)
- `userId` (string, optional) - Filtrowanie po ID użytkownika
- `analystId` (string, optional) - Filtrowanie po ID analityka (`null` dla nieprzypisanych)
- `sortBy` (string, optional) - Pole sortowania (`createdAt`, `updatedAt`, `status`, `dataZgloszenia`, `userId`, `analystId`) - domyślnie: `createdAt`
- `sortOrder` (string, optional) - Kierunek sortowania (`asc`, `desc`) - domyślnie: `desc`

**Przykład curl:**
```bash
curl "http://localhost:3333/api/admin/incidents?page=1&limit=10&status=Zgłoszony&sortBy=createdAt&sortOrder=desc" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_employee123",
      "organizationId": "org_xyz789",
      "status": "Zgłoszony",
      "userDescription": "Problem z aplikacją",
      "userScreenshotPath": null,
      "userScreenshotMetadata": null,
      "userAttachmentPath": null,
      "userAttachmentMetadata": null,
      "analystId": null,
      "analystNote": null,
      "czyRozwiazany": false,
      "dataRozwiazania": null,
      "analystReportPath": null,
      "analystReportMetadata": null,
      "analystReportData": null,
      "analystStatementPath": null,
      "analystStatementMetadata": null,
      "analystStatementData": null,
      "llmCategory": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "userName": "Jan Kowalski",
      "analystName": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### Szczegóły incydentu (admin)

#### `GET /api/admin/incidents/:id`

**Opis:** Pobiera szczegółowe informacje o dowolnym incydencie w organizacji administratora.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl http://localhost:3333/api/admin/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "dataZgloszenia": "2024-01-01T12:00:00.000Z",
    "userId": "user_employee123",
    "organizationId": "org_xyz789",
    "status": "Raport w trakcie",
    "userDescription": "Problem z aplikacją",
    "userScreenshotData": [],
    "userAttachmentData": [],
    "analystId": "user_analyst456",
    "analystNote": "Sprawdzam logi systemowe...",
    "czyRozwiazany": false,
    "dataRozwiazania": null,
    "analystReport": null,
    "analystReportData": null,
    "analystStatement": null,
    "analystStatementData": null,
    "llmCategory": "Żółty",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T13:30:00.000Z",
    "userName": "Jan Kowalski",
    "analystName": "Anna Nowak"
  }
}
```

### Statystyki incydentów

#### `GET /api/admin/analytics/stats`

**Opis:** Pobiera podstawowe statystyki incydentów dla organizacji administratora.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Przykład curl:**
```bash
curl http://localhost:3333/api/admin/analytics/stats \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "totalIncidents": 150,
    "resolvedIncidents": 120,
    "resolvedPercentage": 80,
    "avgResolutionTime": {
      "days": 2,
      "hours": 4,
      "minutes": 30,
      "seconds": 15,
      "totalSeconds": 183015
    },
    "statusBreakdown": [
      { "status": "Zgłoszony", "count": 5 },
      { "status": "Raport w trakcie", "count": 10 },
      { "status": "Raport złożony", "count": 15 },
      { "status": "Sprawozdanie w trakcie", "count": 20 },
      { "status": "Sprawozdanie złożone", "count": 85 },
      { "status": "Odrzucone", "count": 15 }
    ],
    "categoryBreakdown": [
      { "category": "Zielony", "count": 50 },
      { "category": "Żółty", "count": 70 },
      { "category": "Czerwony", "count": 30 }
    ]
  }
}
```

### Szczegółowe metryki

#### `GET /api/admin/analytics/metrics`

**Opis:** Pobiera szczegółowe metryki czasowe i statystyki użytkowników dla organizacji administratora.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `period` (number, optional) - Okres w dniach (domyślnie: 30, max: 365)

**Przykład curl:**
```bash
curl "http://localhost:3333/api/admin/analytics/metrics?period=30" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2024-11-10T00:00:00.000Z"
    },
    "timeSeries": {
      "incidentsCreated": [
        { "date": "2024-11-10", "count": 5 },
        { "date": "2024-11-11", "count": 8 }
      ],
      "incidentsResolved": [
        { "date": "2024-11-12", "count": 3 },
        { "date": "2024-11-13", "count": 6 }
      ],
      "avgResolutionTimeHours": [
        { "date": "2024-11-12", "avg_time_hours": 24.5 },
        { "date": "2024-11-13", "avg_time_hours": 18.2 }
      ]
    },
    "topUsers": [
      { "userId": "user_123", "userName": "Jan Kowalski", "count": 15 },
      { "userId": "user_456", "userName": "Anna Nowak", "count": 12 }
    ],
    "topAnalysts": [
      { "analystId": "user_789", "analystName": "Piotr Wiśniewski", "resolved": 25 },
      { "analystId": "user_101", "analystName": "Maria Jankowska", "resolved": 22 }
    ]
  }
}
```

## Incidents API - Administratorzy

Wszystkie endpointy dla administratorów wymagają autoryzacji z rolą `admin`. Administratorzy mają pełny dostęp do wszystkich incydentów w ramach swojej organizacji.

### Wszystkie incydenty

#### `GET /api/admin/incidents`

**Opis:** Pobiera wszystkie incydenty w organizacji administratora z paginacją, filtrowaniem i sortowaniem.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `page` (number, optional) - Numer strony (domyślnie: 1)
- `limit` (number, optional) - Liczba wyników na stronę (domyślnie: 20, max: 100)
- `status` (string, optional) - Filtrowanie po statusie
- `userId` (string, optional) - Filtrowanie po ID użytkownika
- `analystId` (string, optional) - Filtrowanie po ID analityka (`null` dla nieprzypisanych)
- `sortBy` (string, optional) - Pole sortowania (`createdAt`, `updatedAt`, `status`, `dataZgloszenia`, `userId`, `analystId`) - domyślnie: `createdAt`
- `sortOrder` (string, optional) - Kierunek sortowania (`asc`, `desc`) - domyślnie: `desc`

**Przykład curl:**
```bash
curl "http://localhost:3333/api/admin/incidents?page=1&limit=10&status=Zgłoszony&sortBy=createdAt&sortOrder=desc" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
      "dataZgloszenia": "2024-01-01T12:00:00.000Z",
      "userId": "user_employee123",
      "organizationId": "org_xyz789",
      "status": "Zgłoszony",
      "userDescription": "Problem z aplikacją",
      "analystId": null,
      "czyRozwiazany": false,
      "userName": "Jan Kowalski",
      "analystName": null,
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

### Szczegóły incydentu (admin)

#### `GET /api/admin/incidents/:id`

**Opis:** Pobiera szczegółowe informacje o dowolnym incydencie w organizacji administratora.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Path Parameters:**
- `id` (string, wymagane) - UUID incydentu

**Przykład curl:**
```bash
curl http://localhost:3333/api/admin/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d",
    "dataZgloszenia": "2024-01-01T12:00:00.000Z",
    "userId": "user_employee123",
    "organizationId": "org_xyz789",
    "status": "Raport złożony",
    "userDescription": "Problem z aplikacją",
    "userScreenshotPath": null,
    "userScreenshotMetadata": null,
    "userAttachmentPath": null,
    "userAttachmentMetadata": null,
    "analystId": "user_analyst456",
    "analystNote": "Problem rozwiązany poprzez restart serwera",
    "czyRozwiazany": true,
    "dataRozwiazania": "2024-01-01T14:30:00.000Z",
    "analystReportPath": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports/analysis.pdf",
    "analystReportMetadata": {
      "path": "incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/reports/analysis.pdf",
      "bucket": "bastiondesk-bucket",
      "filename": "analysis.pdf",
      "mimeType": "application/pdf",
      "size": 245760
    },
    "userName": "Jan Kowalski",
    "analystName": "Anna Nowak"
  }
}
```

### Statystyki incydentów

#### `GET /api/admin/analytics/stats`

**Opis:** Pobiera podstawowe statystyki incydentów dla organizacji administratora.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Przykład curl:**
```bash
curl http://localhost:3333/api/admin/analytics/stats \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "totalIncidents": 150,
    "resolvedIncidents": 120,
    "resolvedPercentage": 80,
    "avgResolutionTime": {
      "days": 2,
      "hours": 4,
      "minutes": 30,
      "seconds": 15,
      "totalSeconds": 183015
    },
    "statusBreakdown": [
      { "status": "Zgłoszony", "count": 5 },
      { "status": "Raport w trakcie", "count": 10 },
      { "status": "Raport złożony", "count": 15 },
      { "status": "Sprawozdanie w trakcie", "count": 20 },
      { "status": "Sprawozdanie złożone", "count": 85 },
      { "status": "Odrzucone", "count": 15 }
    ],
    "categoryBreakdown": [
      { "category": "Zielony", "count": 50 },
      { "category": "Żółty", "count": 70 },
      { "category": "Czerwony", "count": 30 }
    ]
  }
}
```

### Szczegółowe metryki

#### `GET /api/admin/analytics/metrics`

**Opis:** Pobiera szczegółowe metryki czasowe i statystyki użytkowników dla organizacji administratora.

**Nagłówki:**
```
Authorization: Bearer <token> lub Cookie: better-auth.session=<session_token>
```

**Query Parameters:**
- `period` (number, optional) - Okres w dniach (domyślnie: 30, max: 365)

**Przykład curl:**
```bash
curl "http://localhost:3333/api/admin/analytics/metrics?period=30" \
  -H "Cookie: better-auth.session=session_token_here"
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2024-11-10T00:00:00.000Z"
    },
    "timeSeries": {
      "incidentsCreated": [
        { "date": "2024-11-10", "count": 5 },
        { "date": "2024-11-11", "count": 8 }
      ],
      "incidentsResolved": [
        { "date": "2024-11-12", "count": 3 },
        { "date": "2024-11-13", "count": 6 }
      ],
      "avgResolutionTimeHours": [
        { "date": "2024-11-12", "avg_time_hours": 24.5 },
        { "date": "2024-11-13", "avg_time_hours": 18.2 }
      ]
    },
    "topUsers": [
      { "userId": "user_123", "userName": "Jan Kowalski", "count": 15 },
      { "userId": "user_456", "userName": "Anna Nowak", "count": 12 }
    ],
    "topAnalysts": [
      { "analystId": "user_789", "analystName": "Piotr Wiśniewski", "resolved": 25 },
      { "analystId": "user_101", "analystName": "Maria Jankowska", "resolved": 22 }
    ]
  }
}
```

## Pobieranie plików

System umożliwia pobieranie plików (screenshotów, załączników, raportów i sprawozdań) z odpowiednią kontrolą dostępu.

### Kontrola dostępu do plików

| Rola | Dostęp do plików |
|------|------------------|
| **Pracownik** | Tylko własne pliki z własnych incydentów |
| **Analityk** | Pliki z incydentów przypisanych do niego lub pliki analityków (raporty/sprawozdania) z jego organizacji |
| **Administrator** | Wszystkie pliki z organizacji |

### Typy plików

- `screenshots` - Screenshoty przesłane przez pracowników
- `attachments` - Załączniki przesłane przez pracowników  
- `reports` - Raporty przesłane przez analityków
- `statements` - Sprawozdania przesłane przez analityków

### Endpointy pobierania plików

#### Pracownicy
```
GET /api/employee/incidents/:id/files/:type/:filename
```

#### Analitycy
```
GET /api/analyst/incidents/:id/files/:type/:filename
```

#### Administratorzy
```
GET /api/admin/incidents/:id/files/:type/:filename
```

### Przykład użycia

```bash
# Pobieranie screenshotu przez pracownika
curl "http://localhost:3333/api/employee/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/files/screenshots/error.png" \
  -H "Cookie: better-auth.session=session_token_here" \
  --output error.png

# Pobieranie raportu przez analityka
curl "http://localhost:3333/api/analyst/incidents/0192d1f8-5c8e-7b1a-8f2d-3e4f5a6b7c8d/files/reports/analysis.docx" \
  -H "Cookie: better-auth.session=session_token_here" \
  --output analysis.docx
```

### Odpowiedzi błędów

**Brak dostępu:**
```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Brak dostępu do tego pliku"
  }
}
```

**Plik nie znaleziony:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Plik nie został znaleziony"
  }
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

### Kody błędów aplikacji (Incidents)

| Kod | Status HTTP | Opis |
|-----|-------------|------|
| `NO_ORGANIZATION` | 400 | Użytkownik nie należy do żadnej organizacji |
| `MISSING_ID` | 400 | Brak wymaganego identyfikatora |
| `INVALID_ID` | 400 | Nieprawidłowy format identyfikatora (UUID) |
| `INVALID_SORT_FIELD` | 400 | Nieprawidłowe pole sortowania |
| `INVALID_SORT_ORDER` | 400 | Nieprawidłowy kierunek sortowania |
| `INCIDENT_NOT_FOUND` | 404 | Zgłoszenie nie zostało znalezione lub brak dostępu |
| `CREATE_INCIDENT_ERROR` | 500 | Nie udało się utworzyć zgłoszenia |
| `GET_INCIDENTS_ERROR` | 500 | Nie udało się pobrać zgłoszeń |
| `GET_INCIDENT_ERROR` | 500 | Nie udało się pobrać szczegółów zgłoszenia |
| `GET_REPORTS_ERROR` | 500 | Nie udało się pobrać raportów |
| `GET_STATEMENTS_ERROR` | 500 | Nie udało się pobrać sprawozdań |
| `GET_ASSIGNED_INCIDENTS_ERROR` | 500 | Nie udało się pobrać przypisanych zgłoszeń |
| `GET_UNASSIGNED_INCIDENTS_ERROR` | 500 | Nie udało się pobrać nieprzypisanych zgłoszeń |
| `ORGANIZATION_ACCESS_DENIED` | 403 | Brak dostępu do zgłoszenia z innej organizacji |
| `ORGANIZATION_CHECK_ERROR` | 500 | Błąd sprawdzania dostępu do organizacji |
| `MISSING_INCIDENT_ID` | 400 | Brak identyfikatora incydentu |
| `INSUFFICIENT_PERMISSIONS` | 403 | Niewystarczające uprawnienia |
| `MISSING_PARAMETERS` | 400 | Brak wymaganych parametrów |
| `INVALID_FILE_TYPE` | 400 | Nieprawidłowy typ pliku |
| `ACCESS_DENIED` | 403 | Brak dostępu do pliku |
| `DOWNLOAD_ERROR` | 500 | Nie udało się pobrać pliku |
| `INVALID_SORT_FIELD` | 400 | Nieprawidłowe pole sortowania |
| `INVALID_SORT_ORDER` | 400 | Nieprawidłowy kierunek sortowania |
| `GET_STATS_ERROR` | 500 | Nie udało się pobrać statystyk |
| `INVALID_PERIOD` | 400 | Nieprawidłowy okres czasu |
| `GET_METRICS_ERROR` | 500 | Nie udało się pobrać metryk |
| `INCIDENT_ALREADY_ASSIGNED` | 409 | Zgłoszenie jest już przypisane do innego analityka |
| `INVALID_INCIDENT_STATUS` | 400 | Zgłoszenie ma nieodpowiedni status do przypisania |
| `ASSIGN_INCIDENT_ERROR` | 500 | Nie udało się przypisać zgłoszenia |
| `INCIDENT_NOT_ASSIGNED` | 403 | Zgłoszenie nie jest przypisane do Ciebie |
| `CANNOT_UNASSIGN_FINAL_STATUS` | 400 | Nie można oddać zgłoszenia w końcowym statusie |
| `UNASSIGN_INCIDENT_ERROR` | 500 | Nie udało się oddać zgłoszenia do puli |
| `MISSING_STATUS` | 400 | Brak nowego statusu |
| `INVALID_STATUS` | 400 | Nieprawidłowy status |
| `INVALID_STATUS_TRANSITION` | 400 | Nieprawidłowe przejście statusu |
| `CANNOT_MODIFY_STATUS` | 403 | Brak uprawnień do zmiany statusu tego zgłoszenia |
| `UPDATE_STATUS_ERROR` | 500 | Nie udało się zaktualizować statusu zgłoszenia |
| `INVALID_NOTES` | 400 | Notatki muszą być tekstem |
| `NOTES_TOO_LONG` | 400 | Notatki mogą mieć maksymalnie 10000 znaków |
| `CANNOT_MODIFY_NOTES` | 403 | Brak uprawnień do edycji notatek tego zgłoszenia |
| `UPDATE_NOTES_ERROR` | 500 | Nie udało się zaktualizować notatek |
| `CANNOT_RESOLVE_INCIDENT` | 403 | Brak uprawnień do oznaczenia zgłoszenia jako rozwiązanego |
| `ALREADY_RESOLVED` | 400 | Zgłoszenie jest już oznaczone jako rozwiązane |
| `RESOLVE_INCIDENT_ERROR` | 500 | Nie udało się oznaczyć zgłoszenia jako rozwiązanego |
| `MISSING_REPORT_DATA` | 400 | Brak danych raportu |
| `CANNOT_UPLOAD_REPORT` | 403 | Brak uprawnień do uploadu raportu dla tego zgłoszenia |
| `REPORT_UPLOAD_ERROR` | 500 | Nie udało się przesłać raportu |
| `UPLOAD_REPORT_ERROR` | 500 | Nie udało się przesłać raportu |
| `MISSING_STATEMENT_DATA` | 400 | Brak danych sprawozdania |
| `CANNOT_UPLOAD_STATEMENT` | 403 | Brak uprawnień do uploadu sprawozdania dla tego zgłoszenia |
| `CANNOT_UPLOAD_STATEMENT_WITH_STATUS` | 400 | Sprawozdanie można uploadować tylko gdy raport jest już złożony |
| `STATEMENT_UPLOAD_ERROR` | 500 | Nie udało się przesłać sprawozdania |
| `UPLOAD_STATEMENT_ERROR` | 500 | Nie udało się przesłać sprawozdania |

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