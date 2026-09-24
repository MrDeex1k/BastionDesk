# Kontrakt tożsamości — faza 2.4

Kontrakt z fazy 2 jest podłączony produkcyjnie w fazie 5 przez Elysia gateway
oraz mTLS. Konfigurację, upgrade, rollback i rotację opisuje
[faza 5](phase-5-identity.md); decyzja: [ADR-0006](../adr/0006-auth-gateway.md).

## Przepływ

1. Przeglądarka wysyła dotychczasowe cookie sesji do tego samego originu.
2. Bridge sprawdza origin/CSRF dla mutacji, odrzuca cross-site i odczytuje sesję
   bez cookie cache. Czyta aktualne konto, aktywną organizację i członkostwo.
3. Auth podpisuje JWT przez server-only API Better Auth. Bridge buduje nowy
   nagłówek Authorization; nie przekazuje browser Authorization, cookies ani
   nagłówków `x-user-*` do Core.
4. Core lokalnie weryfikuje podpis z kanonicznego JWKS oraz claims.
5. Core przez port `ReadCurrentIdentity` sprawdza aktualną sesję i członkostwo
   u właściciela auth. Zwrócone subject, session ID i organizacja muszą zgadzać
   się z tokenem; rola pochodzi z bieżącego odczytu, nigdy z JWT.
6. Moduł domenowy sprawdza RBAC i tenant zasobu. Dla ryzykownej operacji ponawia
   sprawdzenie polityki tuż przed efektem.

Gateway `auth/gateway.ts` implementuje kontrolę CSRF związaną z bieżącą sesją.
GET/HEAD/OPTIONS/QUERY nie mogą mieć skutków ubocznych. Forwardowanie prowadzi
do stałego upstreamu, z allowlistą nagłówków treści, idempotencji i śledzenia.
JWT, cookies i klucze nie trafiają do logów, trace ani publicznych odpowiedzi.

## Profil JWT v1

| Element | Kontrakt |
| --- | --- |
| JOSE `alg` | Wyłącznie `EdDSA`, klucze Ed25519 |
| JOSE `kid` | Wymagany; identyfikator klucza Better Auth |
| `iss` | Stały wewnętrzny HTTPS issuer instalacji: `https://auth-service:3443/api/auth`, bez końcowego slash |
| JWKS | Dokładnie `<issuer>/jwks`; URL nie pochodzi z tokenu |
| `aud` | Jeden string `bastiondesk-core`; tablice i inne audience odrzucane |
| `sub`, `sid`, `org_id` | ID użytkownika, ID rekordu sesji (nie sekret cookie), aktywna organizacja |
| `iat`, `exp` | Sekundy Unix; dodatni okres, najwyżej 60 s, nie dłużej niż sesja |
| `jti` | Losowy UUID każdej emisji |
| Inne claims | Odrzucane; brak emaila, ról, cookie i całego obiektu user |

Tolerancja zegara wynosi 5 s, więc token może być zaakceptowany kryptograficznie
do 5 s po exp. Bieżąca sesja musi jednak nadal być ważna. Token nie jest
jednorazowy: `jti` służy identyfikacji, nie deduplikacji komend ani automatycznemu
wykrywaniu replay. Idempotencję określa osobny kontrakt operacji.

Verifier używa jose i allowlisty algorytmów; odrzuca brak claims, zły issuer,
audience, czas, podpis, nieznany kid oraz nagłówki `jku`, `jwk`, `x5u`.
Nigdy nie pobiera kluczy z adresu wskazanego w tokenie. Własne `transport`
w fabryce służy konfiguracji zaufanego połączenia do tego samego kanonicznego
JWKS, np. z mTLS wewnątrz instalacji; nie może pochodzić od klienta.

## Aktualność tożsamości i port wewnętrzny

Właściciel auth implementuje `AuthStatePort.findIdentity` na podstawie
bieżącego połączenia session → user → member dla aktywnej organizacji.
Sesja nie może być usunięta ani wygasła, użytkownik musi być aktywny i mieć
zweryfikowany email, członkostwo musi istnieć. Nieznana rola jest błędem,
nie rolą domyślną. Bieżący snapshot nie jest cache'owany w Core.

Transport `ReadCurrentIdentity`: wewnętrzny GET `/internal/identity/resolve`,
dostępny wyłącznie przez mTLS z przypiętym certyfikatem Core. Nagłówek Authorization
zawiera JWT wcześniej zweryfikowany przez Core; auth weryfikuje go ponownie i
zwraca bezpośrednio `LiveIdentity` albo HTTP 401/503. Publiczny router nie montuje
tego endpointu. Kanoniczny JWKS to dokładnie `<issuer>/jwks`, również przez mTLS.

`LiveIdentity`: subject, sessionId, organizationId, role i sessionExpiresAt.
Przy zmianie roli następny odczyt widzi nową rolę. Zmiana organizacji, usunięcie
członkostwa, wyłączenie konta lub wylogowanie powoduje odmowę dla starego JWT.
To gwarancja na moment odczytu, nie przerwanie już rozpoczętego żądania.
Brak dostępu do tabel auth po stronie Core; implementacja portu pozostaje
wyłącznie w serwisie auth. Wspólna baza nadal używa dotychczasowej roli PostgreSQL;
Core nie odczytuje sesji ani kluczy w kodzie aplikacji.

Timeout odczytu wynosi 2 s i wysyła AbortSignal. Adapter sieciowy musi go
honorować; odrzucenie Promise nie zatrzyma samo nieanulowalnego zapytania DB.
Niepoprawna/nieaktualna tożsamość daje UNAUTHORIZED, awaria odczytu lub timeout
SERVICE_UNAVAILABLE. Błąd podpisu albo niedostępny JWKS przy braku świeżego
cache daje UNAUTHORIZED. Brak fallback do niezweryfikowanej tożsamości.

## Klucze i rotacja

Wyłącznie proces auth posiada odszyfrowane klucze prywatne; domyślne szyfrowanie
pluginu pozostaje włączone. Tabelę `jwks` (id, publicKey, privateKey, createdAt,
expiresAt, alg, crv) dodaje migracja `0003_auth_jwks.sql`.
Backup musi obejmować klucze oraz używany do ich szyfrowania sekret Better Auth.
Nie obracać tego sekretu przez przypadkowe nadpisanie — wymaga migracji szyfrowania.

- Rotacja podpisującego klucza: 24 h, uruchamiana leniwie przez plugin.
- Zachowanie publicznego starego klucza: 300 s od expiresAt klucza; więcej niż
  TTL tokenu + tolerancja zegara + cache JWKS.
- Cache JWKS w każdym Core: 30 s; odświeżenie nieznanego kid ograniczone
  cooldownem 5 s; timeout HTTP 2 s. jose nie podąża za przekierowaniami.
- `refreshKeys()` jest operacją wewnętrzną operatora, nigdy endpointem klienta.

Przy planowanej rotacji provisionować nowy klucz (server-only emisja kontrolna),
odświeżyć JWKS we wszystkich Core i dopiero kierować ruch korzystający z nowego
klucza. Leniwa rotacja bez prewarm może spowodować krótkie odmowy w okresie
cooldownu — nie gwarantujemy bezprzerwowego przełączenia bez koordynacji.
Podczas awarii JWKS świeży cache działa do upływu 30 s; po nim brak dostępu
oznacza odmowę. Usunięcie skompromitowanego klucza wymaga również odświeżenia
cache wszystkich Core lub zatrzymania ruchu; samo usunięcie z tabeli nie
unieważnia kopii cache. Zaplanować runbook awaryjny przed wdrożeniem produkcyjnym.

## Granice i testy

`identity.test.ts` sprawdza profil, cache, rotację z overlap, usunięcie klucza,
wygaśnięcie cache, awarie i timeout. `better-auth.test.ts` używa rzeczywistego
Better Auth 1.7.5, memory adaptera, sesji/cookies, organizacji, pluginu JWT
i podpisów: emisja, szyfrowanie privateKey, rotacja, świeża rola, wyłączenie
konta, usunięcie członkostwa, zmiana organizacji i logout.

Test Better Auth jest uruchamiany zawsze przez Elysia `2.0.0-beta.16`.
Probe w `scripts/spikes/elysia2/` pozostaje historycznym dowodem decyzji z fazy 2.
Testy sieciowe i przeglądarkowe fazy 5 sprawdzają trwały magazyn PostgreSQL,
restart, mTLS, reverse proxy, sesje, role oraz PassKeys; zakres i polecenia znajdują
się w [runbooku fazy 5](phase-5-identity.md). Nie dodano social loginu ani OIDC.
