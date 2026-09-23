# Kontrakt tożsamości — faza 2.4

Wdrożono moduły `backend/src/identity/` i izolowane prototypy. Nie są jeszcze
podłączone do publicznych tras działającej aplikacji. Decyzja:
[ADR-0003](../adr/0003-identity-bridge.md).

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

`createBrowserIdentityBridge` zwraca nagłówki **wewnętrznego wywołania**, nie
Response dla przeglądarki. Callback `validateCsrf` musi wykorzystywać istniejący
walidator związany z sesją; test używa kontrolowanej fixture tego callbacku.
GET/HEAD/OPTIONS/QUERY nie mogą mieć skutków ubocznych. Forwardowanie jest
do stałego upstreamu, nie URL z żądania. Docelowy adapter przekazuje tylko
allowlistę nagłówków treści i śledzenia. JWT, cookies i klucze są wyłączone
z logów, trace i publicznych odpowiedzi.

## Profil JWT v1

| Element | Kontrakt |
| --- | --- |
| JOSE `alg` | Wyłącznie `EdDSA`, klucze Ed25519 |
| JOSE `kid` | Wymagany; identyfikator klucza Better Auth |
| `iss` | Stały publiczny HTTPS issuer instalacji: `https://<host>/api/auth`, bez końcowego slash |
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

Docelowy transport `ReadCurrentIdentity`: wewnętrzne POST
`/internal/identity/resolve`, dostępne wyłącznie dla certyfikatu Core przez mTLS,
bez publikacji przez publiczny NGINX. Body jest profilem claims po weryfikacji
podpisu w Core; odpowiedź ma `{identity: LiveIdentity | null}`, `Cache-Control:
no-store`. mTLS identyfikuje usługę, JWT użytkownika nie zastępuje tej tożsamości.
Endpoint i klient mTLS zostaną podłączone przy wydzieleniu usług w fazie 5.
Faza 3 używa rzeczywistego portu świeżej tożsamości w jednym procesie
([ADR-0004](../adr/0004-core-in-process.md)); nie ma jeszcze sieciowego hopu JWT/mTLS.

`LiveIdentity`: subject, sessionId, organizationId, role i sessionExpiresAt.
Przy zmianie roli następny odczyt widzi nową rolę. Zmiana organizacji, usunięcie
członkostwa, wyłączenie konta lub wylogowanie powoduje odmowę dla starego JWT.
To gwarancja na moment odczytu, nie przerwanie już rozpoczętego żądania.
Brak dostępu do tabel auth po stronie Core; implementacja portu pozostaje
w serwisie auth lub jego przejściowym module w Expressie.

Timeout odczytu wynosi 2 s i wysyła AbortSignal. Adapter sieciowy musi go
honorować; odrzucenie Promise nie zatrzyma samo nieanulowalnego zapytania DB.
Niepoprawna/nieaktualna tożsamość daje UNAUTHORIZED, awaria odczytu lub timeout
SERVICE_UNAVAILABLE. Błąd podpisu albo niedostępny JWKS przy braku świeżego
cache daje UNAUTHORIZED. Brak fallback do niezweryfikowanej tożsamości.

## Klucze i rotacja

Wyłącznie auth posiada prywatne klucze; domyślne szyfrowanie pluginu pozostaje
włączone. Docelowa tabela `jwks` musi odpowiadać schematowi zainstalowanego
pluginu (id, publicKey, privateKey, createdAt, expiresAt, alg, crv). Jej migrację
trzeba dołączyć przed włączeniem pluginu; prototyp korzysta z adaptera pamięciowego.
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

`scripts/spikes/phase2-elysia.mjs` sprawdza rzeczywiste `.mount(auth.handler)`
na **Elysia 2.0.0-beta.14**, Better Auth 1.7.5, jose 6.2.12 i Bun 1.4.2.
Smoke sprawdza cookies Secure/HttpOnly, brak `/token`, brak JWT w nagłówku
sesji i odrzucenie obcego originu. Następnie uruchamia pełny scenariusz
`better-auth.test.ts` z żądaniami przeglądarkowymi i JWKS obsługiwanymi przez
Elysia: minimalne claims, podpisy, rotacja, zmiana roli/organizacji, wyłączenie
konta, usunięcie członkostwa oraz logout unieważniający również wcześniej
wydany JWT. Podpisywanie pozostaje serwerowym API Better Auth.

Elysia 2 jest docelowa; beta została wybrana świadomie przed odbiorem 2.5.
Manifest i lockfile w `scripts/spikes/elysia2/` przypinają wydanie oraz jego
zależności, w tym zgodny peer `exact-mirror@1.2.6`. Nie są zależnościami
produkcyjnego backendu. Do odtworzenia z katalogu głównego repozytorium:

```sh
spike_dir=$(mktemp -d /tmp/bastiondesk-elysia2.XXXXXX)
cp scripts/spikes/elysia2/package.json scripts/spikes/elysia2/bun.lock "$spike_dir/"
./node_modules/.bin/sfw bun install --cwd "$spike_dir" --frozen-lockfile --minimum-release-age 86400
ELYSIA_SPIKE_DIR="$spike_dir" bun scripts/spikes/phase2-elysia.mjs
```

Skrypt odrzuca inną wersję Elysia, żeby przypadkowy upgrade nie zmienił zakresu
potwierdzonej zgodności. Zwykłe `bun run test` zachowuje niezależny test Better
Auth bez Elysia; powyższy probe jest dodatkową bramką zgodności frameworka.

Przed fazą 5 ponownie oceniamy aktualne wydanie 2.x. Testy używają
Request/Response w procesie i pamięciowego adaptera; nie zastępują testu
przeglądarki, TLS/mTLS, reverse proxy, trwałego key store ani restartu.
Pełne E2E fazy 3 weryfikuje Core z adapterem świeżej sesji w procesie.
Sieciowy JWT/JWKS pozostaje prototypem do wdrożenia w fazie 5. Nie dodano
social loginu ani OIDC.
