# BastionDesk - Baza Danych PostgreSQL 18

Dokumentacja bazy danych dla projektu BastionDesk z obsługą biblioteki **Better-Auth**.

## Struktura folderów

```
database/
├── Dockerfile              # Obraz Docker dla PostgreSQL 18
├── init-sql/               # Skrypty inicjalizacyjne SQL
│   ├── 01-init.sql        # Rozszerzenia + rola + baza danych
│   ├── 02-create-auth.sql # Schemat autoryzacji Better-Auth
│   └── 03-create-app.sql  # Schemat aplikacji (zgłoszenia/incydenty)
└── Dokumentacja bazy danych znajduje się teraz w `docs/database/database.md`
```

---

## Funkcjonalności

- ✅ **Podstawowa autoryzacja** (email/password)
- ✅ **PassKeys (WebAuthn/U2F)** - klucze sprzętowe (YubiKey, Titan, itp.)
- ✅ **HaveIBeenPwned** - sprawdzanie kompromitacji haseł
- ✅ **Last Login Method** - śledzenie metody ostatniego logowania
- ✅ **Organizacje** - multi-tenancy z rolami
- ✅ **Zespoły (Teams)** - grupowanie użytkowników w organizacji
- ✅ **System zgłoszeń** - zarządzanie incydentami z workflow analizy
- ✅ **Audit logging** - automatyczne logowanie zmian statusu zgłoszeń

---

## Role użytkowników

System wykorzystuje **3 role**:

|     Rola    |           Opis           |                                  Uprawnienia                                 |
|-------------|--------------------------|------------------------------------------------------------------------------|
|   `admin`   | Administrator/Właściciel | Pełne uprawnienia - zarządzanie organizacją, członkami, zespołami, raportami |
|  `analityk` |      Analityk danych     |                Dostęp do raportów i analityk, podgląd organizacji            |
| `pracownik` |         Pracownik        |                  Podstawowy dostęp do organizacji (tylko odczyt)             |

---

## Typy wyliczeniowe

### `incident_status` - Statusy zgłoszeń

| Status | Opis |
|--------|------|
| `pending` | Nowe zgłoszenie oczekuje na obsługę |
| `analyzing` | Zgłoszenie w trakcie analizy przez AI lub Analityka |
| `needs_info` | Analityk potrzebuje więcej informacji od użytkownika |
| `resolved` | Zgłoszenie zostało rozwiązane |
| `rejected` | Zgłoszenie zostało odrzucone |

---

## Tabele

### 1. `user` - Użytkownicy

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `email` | `text` | Email (unikalny) |
| `name` | `text` | Nazwa wyświetlana |
| `email_verified` | `boolean` | Czy email zweryfikowany |
| `image` | `text` | URL avatara |
| `is_active` | `boolean` | Czy konto aktywne |
| `password_compromised` | `boolean` | Czy hasło w HIBP |
| `password_last_checked_at` | `timestamptz` | Ostatnie sprawdzenie HIBP |
| `last_login_method` | `text` | Ostatnia metoda: `password`, `passkey`, `oauth` |
| `last_login_at` | `timestamptz` | Czas ostatniego logowania |

### 2. `session` - Sesje

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `user_id` | `text` | FK do user |
| `token` | `text` | Token sesji (unikalny) |
| `expires_at` | `timestamptz` | Wygasanie |
| `active_organization_id` | `text` | Aktywna organizacja |
| `active_team_id` | `text` | Aktywny zespół |

### 3. `account` - Konta

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `user_id` | `text` | FK do user |
| `provider_id` | `text` | Dostawca (credential, google, github) |
| `password` | `text` | Hash hasła |

### 4. `passkey` - Klucze WebAuthn/U2F

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `user_id` | `text` | FK do user |
| `name` | `text` | Nazwa klucza (np. "YubiKey 5") |
| `public_key` | `text` | Klucz publiczny (base64) |
| `credential_id` | `text` | ID credential WebAuthn |
| `counter` | `integer` | Counter anty-replay |
| `device_type` | `text` | `platform` lub `cross-platform` |
| `transports` | `text` | JSON: `usb`, `nfc`, `ble`, `internal` |
| `aaguid` | `text` | AAGUID autentyfikatora |

### 5. `organization` - Organizacje

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `name` | `text` | Nazwa organizacji |
| `slug` | `text` | Slug URL (unikalny) |
| `logo` | `text` | URL logo |
| `metadata` | `jsonb` | Dodatkowe metadane |

### 6. `member` - Członkowie organizacji

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `organization_id` | `text` | FK do organization |
| `user_id` | `text` | FK do user |
| `role` | `text` | `admin`, `analityk`, `pracownik` |

### 7. `team` - Zespoły

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `organization_id` | `text` | FK do organization |
| `name` | `text` | Nazwa zespołu |

### 8. `team_member` - Członkowie zespołów

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `team_id` | `text` | FK do team |
| `user_id` | `text` | FK do user |

### 9. `invitation` - Zaproszenia

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `organization_id` | `text` | FK do organization |
| `email` | `text` | Email zaproszonego |
| `role` | `text` | Przypisana rola |
| `status` | `text` | `pending`, `accepted`, `rejected`, `canceled` |
| `inviter_id` | `text` | FK do user |
| `expires_at` | `timestamptz` | Wygasanie |

### 10. `organization_role` - Definicje ról

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `organization_id` | `text` | FK do organization |
| `role` | `text` | Nazwa roli |
| `permission` | `jsonb` | Uprawnienia |

**Struktura uprawnień:**
```json
{
  "organization": ["read", "update", "delete"],
  "member": ["create", "read", "update", "delete"],
  "team": ["create", "read", "update", "delete"],
  "reports": ["create", "read", "update", "delete"],
  "analytics": ["create", "read", "update"]
}
```

### 11. `password_history` - Historia haseł (HIBP)

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `user_id` | `text` | FK do user |
| `password_hash` | `text` | Hash hasła |
| `hibp_compromised` | `boolean` | Czy skompromitowane |
| `hibp_count` | `integer` | Liczba wystąpień w HIBP |

### 12. `login_history` - Historia logowań

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `text` | Klucz główny |
| `user_id` | `text` | FK do user |
| `login_method` | `text` | `password`, `passkey`, `oauth` |
| `ip_address` | `text` | Adres IP |
| `success` | `boolean` | Czy logowanie udane |
| `failure_reason` | `text` | Przyczyna niepowodzenia |

### 13. `incidents` - Zgłoszenia/Incydenty

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `UUID` | Klucz główny (uuidv7) |
| `user_id` | `text` | FK do user |
| `status` | `incident_status` | Status: `pending`, `analyzing`, `needs_info`, `resolved`, `rejected` |
| `user_description` | `text` | Opis zgłoszenia od użytkownika |
| `user_screenshot_data` | `jsonb` | Metadane screenshotów w MinIO |
| `user_attachment_data` | `jsonb` | Metadane załączników w MinIO |
| `analyst_note` | `text` | Notatki analityka |
| `analyst_report_data` | `jsonb` | Metadane raportu analityka w MinIO |
| `analyst_statement_data` | `jsonb` | Dodatkowe oświadczenia analityka |
| `llm_category` | `text` | Kategoria nadana przez LLM |
| `created_at` | `timestamp` | Data utworzenia |
| `updated_at` | `timestamp` | Data ostatniej aktualizacji |

### 14. `incident_audit_log` - Historia zmian zgłoszeń

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | `BIGINT` | Klucz główny (auto-increment) |
| `incident_id` | `UUID` | FK do incidents |
| `changed_by` | `text` | ID użytkownika lub 'SYSTEM'/'LLM' |
| `old_status` | `incident_status` | Poprzedni status |
| `new_status` | `incident_status` | Nowy status |
| `changed_at` | `timestamp` | Data zmiany |

---

## Triggery

### Autoryzacja (02-create-auth.sql)
1. **`trigger_set_timestamp`** - automatyczna aktualizacja `updated_at`
2. **`update_user_last_login`** - aktualizacja `last_login_method` i `last_login_at`
3. **`on_organization_created`** - tworzenie domyślnych ról dla nowej organizacji

### Aplikacja (03-create-app.sql)
4. **`set_timestamp_incidents`** - automatyczna aktualizacja `updated_at` dla tabeli `incidents`
5. **`log_status_change`** - automatyczne logowanie zmian statusu w `incident_audit_log`

---

## Konfiguracja Better-Auth

```typescript
import { betterAuth } from "better-auth";
import { passkey, haveIBeenPwned, organization } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  
  plugins: [
    // PassKeys (WebAuthn/U2F)
    passkey({
      rpID: "bastiondesk.com",
      rpName: "BastionDesk",
      origin: "https://bastiondesk.com",
    }),
    
    // HaveIBeenPwned
    haveIBeenPwned({
      checkOnSignUp: true,
      checkOnPasswordChange: true,
      blockCompromisedPasswords: true,
    }),
    
    // Organizacje z 3 rolami
    organization({
      roles: {
        admin: { /* pełne uprawnienia */ },
        analityk: { /* raporty i analityki */ },
        pracownik: { /* podstawowy dostęp */ },
      },
      teams: { enabled: true },
    }),
  ],
});
```

---

## Uruchomienie

```bash
# Docker Compose
docker-compose up -d database

# Lub bezpośrednio psql
psql -h localhost -U postgres -d bastiondesk \
  -f database/init-sql/01-init.sql \
  -f database/init-sql/02-create-auth.sql \
  -f database/init-sql/03-create-app.sql
```

---

## Bezpieczeństwo

- **Hasła** - hash scrypt/argon2 w tabeli `account`
- **PassKeys** - klucze publiczne (bezpieczne do przechowywania)
- **HIBP** - sprawdzanie k-anonimity (bez wysyłania pełnego hasha)
- **Sesje** - kryptograficznie bezpieczne tokeny
