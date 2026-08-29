# BastionDesk — baza danych PostgreSQL 18

Dokumentacja odpowiada aktualnym skryptom inicjalizacyjnym znajdującym się w
`database/init-sql/`. Schemat składa się z tabel Better Auth oraz tabel
aplikacyjnych do obsługi zgłoszeń/incydentów.

## Źródło prawdy

Kolejność inicjalizacji bazy:

```text
database/
├── Dockerfile
├── config/
│   ├── pg_hba.conf
│   └── postgresql.conf
└── init-sql/
    ├── 01-init.sql        # rozszerzenia, rola i baza danych
    ├── 02-create-auth.sql # schemat Better Auth
    └── 03-create-app.sql  # schemat zgłoszeń/incydentów
```

Aktualny projekt nie używa Drizzle ani osobnego systemu migracji. Aplikacja
korzysta z natywnego Bun SQL oraz `pg`, a Better Auth z własnego połączenia
`pg.Pool` ([backend/src/lib/database.ts](../../backend/src/lib/database.ts),
[backend/src/lib/auth.ts](../../backend/src/lib/auth.ts)).

## Funkcjonalności obecnego schematu

- ✅ email/password przez Better Auth
- ✅ PassKeys (WebAuthn/U2F)
- ✅ sprawdzanie kompromitacji haseł przez HaveIBeenPwned
- ✅ organizacje, członkowie i role
- ✅ zespoły i zaproszenia
- ✅ zgłoszenia/incydenty z workflow analizy
- ✅ ścieżki i metadane plików przechowywanych w MinIO/S3
- ✅ kategoryzacja zgłoszenia przez LLM
- ✅ audyt zmian statusu zgłoszeń

Nie jest to jeszcze schemat SOAR. Baza nie zawiera tabel alertów, zdarzeń,
zasobów, IOC, enrichmentu TI, skanów artefaktów, scoringu ryzyka, playbooków,
approval flow, akcji/rollbacków ani telemetryki. Te elementy są częścią
roadmapy opisanej w [future-soar-platform.md](../future-soar-platform.md).

## Typy wyliczeniowe

| Typ | Wartości | Zastosowanie |
|---|---|---|
| `user_role` | `pracownik`, `analityk`, `admin` | Zdefiniowany dla ról organizacyjnych; kolumna `member.role` pozostaje typu `text`. |
| `invitation_status` | `pending`, `accepted`, `rejected`, `canceled` | Zdefiniowany dla zaproszeń; kolumna `invitation.status` pozostaje typu `text`. |
| `"IncidentStatus"` | `Zgłoszony`, `Raport w trakcie`, `Raport złożony`, `Sprawozdanie w trakcie`, `Sprawozdanie złożone`, `Odrzucone` | Workflow zgłoszenia. |
| `"IncidentCategory"` | `Czerwony`, `Żółty`, `Zielony` | Kategoria/priorytet nadany przez LLM. |

Uwaga: typy `user_role` i `invitation_status` są obecnie zadeklarowane w SQL,
ale odpowiadające im kolumny używają `text`, więc baza nie wymusza tych wartości
na poziomie typu kolumny.

## Role użytkowników

| Rola | Zakres |
|---|---|
| `admin` | Zarządzanie organizacją, członkami, zespołami, incydentami, raportami i analityką. |
| `analityk` | Obsługa incydentów, raporty i analityka w ramach organizacji. |
| `pracownik` | Tworzenie i odczyt własnych zgłoszeń oraz podstawowy dostęp do organizacji. |

Źródłem definicji uprawnień aplikacyjnych jest
[`backend/src/lib/permissions.ts`](../../backend/src/lib/permissions.ts).
Uprawnienia mogą być także zapisane jako JSON w tabeli `organization_role`.

## Tabele Better Auth

### `user` — użytkownicy

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `name` | `text` | Nazwa użytkownika, opcjonalna. |
| `email` | `text` | Wymagany, unikalny adres email. |
| `"emailVerified"` | `boolean` | Czy email został zweryfikowany; domyślnie `false`. |
| `image` | `text` | Obraz/avatar, opcjonalny. |
| `"isActive"` | `boolean` | Czy konto jest aktywne; domyślnie `true`. |
| `"passwordCompromised"` | `boolean` | Wynik sprawdzenia hasła w HIBP. |
| `"passwordLastCheckedAt"` | `timestamp` | Czas ostatniego sprawdzenia HIBP. |
| `"lastLoginMethod"` | `text` | Ostatnia metoda, np. `password`, `passkey`, `oauth`. |
| `"lastLoginAt"` | `timestamp` | Czas ostatniego udanego logowania. |
| `"createdAt"` | `timestamp` | Czas utworzenia. |
| `"updatedAt"` | `timestamp` | Czas ostatniej aktualizacji. |

### `session` — sesje

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `token` | `text` | Wymagany i unikalny token sesji. |
| `"expiresAt"` | `timestamp` | Czas wygaśnięcia sesji. |
| `"ipAddress"` | `text` | Adres IP, opcjonalny. |
| `"userAgent"` | `text` | User-Agent, opcjonalny. |
| `"activeOrganizationId"` | `text` | Aktywna organizacja w sesji. |
| `"activeTeamId"` | `text` | Aktywny zespół w sesji. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

### `account` — konta uwierzytelniające

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `"accountId"` | `text` | Identyfikator konta u dostawcy. |
| `"providerId"` | `text` | Dostawca, np. `credential` lub provider OAuth. |
| `password` | `text` | Dane hasła zarządzane przez Better Auth. |
| `"accessToken"`, `"refreshToken"`, `"idToken"` | `text` | Opcjonalne tokeny integracji z providerem. |
| `"accessTokenExpiresAt"`, `"refreshTokenExpiresAt"` | `timestamp` | Czas wygaśnięcia tokenów. |
| `scope` | `text` | Zakresy uprawnień providera. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

Obecna konfiguracja Better Auth nie włącza jeszcze providerów Google, Apple ani
Microsoft; obecność kolumn OAuth w tej tabeli zapewnia jedynie zgodny model
danych.

### `verification` — tokeny weryfikacyjne

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `identifier` | `text` | Identyfikator celu weryfikacji. |
| `value` | `text` | Wartość tokenu. |
| `"expiresAt"` | `timestamp` | Czas wygaśnięcia. |
| `"userId"` | `text` | Opcjonalny FK do `user`. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

### `passkey` — klucze WebAuthn/U2F

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `name` | `text` | Nazwa klucza, opcjonalna. |
| `"publicKey"` | `text` | Wymagany klucz publiczny. |
| `"credentialId"` | `text` | Wymagany, unikalny identyfikator WebAuthn. |
| `counter` | `integer` | Licznik anty-replay; domyślnie `0`. |
| `"deviceType"` | `text` | Typ urządzenia, np. `platform` lub `cross-platform`. |
| `"backedUp"` | `boolean` | Czy credential ma backup; domyślnie `false`. |
| `transports` | `text` | Transporty WebAuthn, przechowywane jako JSON array. |
| `aaguid` | `text` | Identyfikator typu autentyfikatora. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

### `organization` — organizacje

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `name` | `text` | Wymagana nazwa organizacji. |
| `slug` | `text` | Wymagany, unikalny slug. |
| `logo` | `text` | URL/logo, opcjonalne. |
| `metadata` | `jsonb` | Dodatkowe metadane. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

### `member` — członkowie organizacji

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"organizationId"` | `text` | FK do `organization`, `ON DELETE CASCADE`. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `role` | `text` | Rola, domyślnie `pracownik`. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

Unikalność: `("organizationId", "userId")`.

### `team` — zespoły

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"organizationId"` | `text` | FK do `organization`, `ON DELETE CASCADE`. |
| `name` | `text` | Wymagana nazwa zespołu. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

### `team_member` — członkowie zespołów

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"teamId"` | `text` | FK do `team`, `ON DELETE CASCADE`. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `"createdAt"` | `timestamp` | Czas dodania do zespołu. |

Unikalność: `("teamId", "userId")`.

### `invitation` — zaproszenia

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"organizationId"` | `text` | FK do `organization`, `ON DELETE CASCADE`. |
| `email` | `text` | Email zapraszanej osoby. |
| `role` | `text` | Rola po akceptacji; domyślnie `member`. |
| `status` | `text` | Domyślnie `pending`; obsługiwane wartości opisuje `invitation_status`. |
| `"inviterId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `"teamId"` | `text` | Opcjonalny FK do `team`, `ON DELETE SET NULL`. |
| `"expiresAt"` | `timestamp` | Czas wygaśnięcia zaproszenia. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

### `organization_role` — role i uprawnienia

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"organizationId"` | `text` | FK do `organization`, `ON DELETE CASCADE`. |
| `role` | `text` | Nazwa roli. |
| `permission` | `jsonb` | Obiekt zasobów i akcji; domyślnie `{}`. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

Unikalność: `("organizationId", role)`.

### `password_history` — historia sprawdzeń haseł

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `"passwordHash"` | `text` | Wymagany hash hasła; nie przechowuje hasła jawnego. |
| `"hibpChecked"` | `boolean` | Czy wykonano sprawdzenie HIBP; domyślnie `false`. |
| `"hibpCompromised"` | `boolean` | Czy hash znaleziono w HIBP; domyślnie `false`. |
| `"hibpCount"` | `integer` | Liczba wystąpień; domyślnie `0`. |
| `"createdAt"` | `timestamp` | Czas utworzenia wpisu. |

### `login_history` — historia logowań

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `text` | Klucz główny. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `"loginMethod"` | `text` | Np. `password`, `passkey`, `oauth`, `2fa`, `backup_code`. |
| `"ipAddress"` | `text` | Adres IP, opcjonalny. |
| `"userAgent"` | `text` | User-Agent, opcjonalny. |
| `country`, `city` | `text` | Lokalizacja, opcjonalna. |
| `success` | `boolean` | Czy logowanie się udało; domyślnie `true`. |
| `"failureReason"` | `text` | Przyczyna niepowodzenia. |
| `"createdAt"` | `timestamp` | Czas logowania. |

## Tabele aplikacyjne

### `incidents` — zgłoszenia/incydenty

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `uuid` | Klucz główny, domyślnie `uuidv7()`. |
| `"dataZgloszenia"` | `timestamp` | Data zgłoszenia; domyślnie `now()`. |
| `"userId"` | `text` | FK do `user`, `ON DELETE CASCADE`. |
| `"organizationId"` | `text` | FK do `organization`, `ON DELETE CASCADE`. |
| `status` | `"IncidentStatus"` | Domyślnie `Zgłoszony`. |
| `"userDescription"` | `text` | Wymagany opis zgłoszenia. |
| `"userScreenshotPath"` | `text` | Ścieżka do opcjonalnego screenshotu w MinIO/S3. |
| `"userScreenshotMetadata"` | `jsonb` | Metadane screenshotu; domyślnie `{}`. |
| `"userAttachmentPath"` | `text` | Ścieżka do opcjonalnego załącznika w MinIO/S3. |
| `"userAttachmentMetadata"` | `jsonb` | Metadane załącznika; domyślnie `{}`. |
| `"analystId"` | `text` | Opcjonalny FK do `user`, identyfikuje analityka. |
| `"analystNote"` | `text` | Notatka analityka. |
| `"czyRozwiazany"` | `boolean` | Czy incydent rozwiązano; domyślnie `false`. |
| `"dataRozwiazania"` | `timestamp` | Data rozwiązania. |
| `"analystReportPath"` | `text` | Ścieżka raportu analityka w MinIO/S3. |
| `"analystReportMetadata"` | `jsonb` | Metadane raportu; domyślnie `{}`. |
| `"analystReportData"` | `timestamp` | Data zapisania raportu. |
| `"analystStatementPath"` | `text` | Ścieżka sprawozdania analityka w MinIO/S3. |
| `"analystStatementMetadata"` | `jsonb` | Metadane sprawozdania; domyślnie `{}`. |
| `"analystStatementData"` | `timestamp` | Data zapisania sprawozdania. |
| `"llmCategory"` | `"IncidentCategory"` | Kategoria nadana przez usługę LLM. |
| `"createdAt"`, `"updatedAt"` | `timestamp` | Znaczniki czasu. |

Model przechowuje obecnie po jednym screenshotcie i jednym załączniku. Baza
zapisuje ścieżkę oraz metadane, natomiast zawartość pliku znajduje się w
MinIO/S3.

### `incident_audit_log` — audyt zmian statusu

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `bigint` | Klucz główny generowany jako identity. |
| `"incidentId"` | `uuid` | FK do `incidents`, `ON DELETE CASCADE`. |
| `"changedBy"` | `text` | Użytkownik zmiany albo wartość systemowa. |
| `"oldStatus"` | `"IncidentStatus"` | Poprzedni status. |
| `"newStatus"` | `"IncidentStatus"` | Nowy status. |
| `"changedAt"` | `timestamp` | Czas zmiany; domyślnie `now()`. |

Aktualny audyt rejestruje zmianę statusu. Nie obejmuje jeszcze pełnej historii
decyzji, akcji automatycznych, approval flow, wyników skanów ani rollbacków.

## Indeksy i relacje

Skrypty tworzą indeksy dla kluczy obcych, statusów, dat, wyszukiwania emaili,
providerów i najczęstszych filtrów incydentów. Najważniejsze indeksy aplikacyjne
to:

- `incidents("userId")`, `incidents("organizationId")`, `incidents(status)`,
  `incidents("createdAt" DESC)`, `incidents("analystId")` i
  `incidents("czyRozwiazany")`;
- `incident_audit_log("incidentId")`;
- unikalne indeksy dla emaila użytkownika, tokenu sesji, credentialu PassKey,
  slugu organizacji, członkostwa w organizacji/zespole i roli w organizacji.

Relacje użytkowników, organizacji, zespołów i incydentów używają kluczy obcych
z zachowaniem kaskadowym tam, gdzie rekord podrzędny nie ma sensu po usunięciu
rekordu nadrzędnego.

## Triggery i funkcje

### Better Auth (`02-create-auth.sql`)

- `trigger_set_timestamp()` aktualizuje `"updatedAt"` przed zmianą w tabelach
  `user`, `session`, `account`, `verification`, `passkey`, `organization`,
  `member`, `team`, `invitation` i `organization_role`;
- `update_user_last_login()` aktualizuje `user."lastLoginMethod"` oraz
  `user."lastLoginAt"` po udanym wpisie w `login_history`;
- `create_default_organization_roles()` tworzy domyślne role organizacji;
- `on_organization_created` uruchamia tworzenie domyślnych ról po dodaniu
  organizacji.

### Aplikacja (`03-create-app.sql`)

- `set_timestamp_incidents` aktualizuje `incidents."updatedAt"` przed zmianą;
- `log_status_change` dodaje wpis do `incident_audit_log`, gdy zmienia się
  `incidents.status`;
- `set_resolution_date_trigger` ustawia `"dataRozwiazania"`, gdy
  `"czyRozwiazany"` zmienia się z `false` na `true`.

## Konfiguracja Better Auth

Konfiguracja runtime znajduje się w
[`backend/src/lib/auth.ts`](../../backend/src/lib/auth.ts). Obecnie obejmuje:

- email/password z minimalną długością hasła 10 znaków, maksymalną 128 znaków
  i wymaganą weryfikacją emaila;
- sesje o czasie życia 7 dni, aktualizowane co 24 godziny, z cache cookie na
  5 minut;
- PassKey z konfiguracją WebAuthn z wartości środowiskowych;
- HaveIBeenPwned;
- organizacje z rolami `admin`, `analityk`, `pracownik`, limitem 5 organizacji
  na użytkownika i weryfikacją emaila przy zaproszeniach;
- pomocniczy plugin organizacji.

W obecnym kodzie nie ma jeszcze konfiguracji social loginów Google/Apple/Microsoft
ani osobnego JWT/JWKS gatewaya.

## Uruchomienie

Inicjalizacja produkcyjnego/localnego stacka odbywa się przez Docker Compose:

```bash
docker compose up -d
```

Skrypty z `database/init-sql/` są wykonywane przez obraz PostgreSQL przy
inicjalizacji pustego wolumenu danych. Przy istniejącym wolumenie zmiana pliku
SQL nie uruchomi się automatycznie ponownie.

Połączenie aplikacji z bazą odbywa się przez PgBouncer i TLS. Szczegóły
konfiguracji znajdują się w
[`docs/infrastructure/deploy.md`](../infrastructure/deploy.md) oraz
[`docs/infrastructure/tls.md`](../infrastructure/tls.md).

## Bezpieczeństwo

- hasła i dane uwierzytelniające są obsługiwane przez Better Auth;
- `password_history` przechowuje hash oraz wynik sprawdzenia HIBP, nie hasło
  jawne;
- `passkey` przechowuje klucz publiczny i metadane WebAuthn;
- tokeny sesji mają termin ważności i są powiązane z użytkownikiem;
- dane organizacji i incydentów są izolowane przez `organizationId` oraz
  kontrolę uprawnień w backendzie;
- pliki są przechowywane poza PostgreSQL, a w bazie pozostają ich ścieżki i
  metadane;
- audyt zmian statusu jest realizowany triggerem bazodanowym.

Pełna analiza plików, YARA, Threat Intelligence, korelacja alertów, scoring
ryzyka, playbooki i automatyczne reakcje nie są jeszcze częścią aktualnego
schematu.
