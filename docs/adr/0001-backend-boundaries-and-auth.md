# ADR-0001 — Granice backendu i kontrakt tożsamości

- Status: accepted direction; implementation details require validation
- Data: 2026-09-02
- Zakres: backend BastionDesk po wersji 1.0.3

## Kontekst

Aktualny backend jest pojedynczym serwisem Express uruchamianym przez Bun.
Express, Better Auth, API domenowe, dostęp do PostgreSQL, storage i integracja
z LLM znajdują się w jednym deployable. Middleware odczytuje sesję i aktywną
organizację bezpośrednio przez instancję Better Auth.

Docelowa platforma SOAR wymaga wyraźnej granicy pomiędzy tożsamością a core
domenowym, a także workerów obsługujących niezawodne, audytowalne workflowy.

## Decyzja

### 1. Dwa główne serwisy

#### Auth service

Osobny serwis oparty na **Elysia 2 + Better Auth** jest właścicielem:

- logowania, haseł i weryfikacji emaila;
- sesji, PassKeys/WebAuthn i resetu hasła;
- organizacji, membershipów i ról;
- OIDC/social login, jeśli zostanie włączony;
- emisji access tokenów i publikacji JWKS.

Auth service jest jedynym właścicielem kluczy prywatnych. Nie udostępnia ich
NestJS ani workerom.

#### NestJS Core

Główny core oparty na **NestJS** jest właścicielem:

- incydentów, alertów i security events;
- assetów, IOC, artefaktów i enrichmentu;
- korelacji, scoringu, polityk i playbooków;
- approval, active response, rollback i audytu;
- domenowego API oraz publikowania zdarzeń.

NestJS nie importuje Better Auth i nie implementuje haseł, sesji ani PassKeys.
Nie korzysta bezpośrednio z tabel auth jako z kontraktu domenowego.

### 2. JWT + JWKS jako wspólny kontrakt zaufania

JWT i JWKS są używane razem:

- JWT jest krótkoterminowym access tokenem;
- JWKS jest publicznym endpointem z kluczami do weryfikacji podpisu;
- obowiązuje jeden issuer auth service i jeden kanoniczny endpoint JWKS;
- NestJS cache’uje JWKS i weryfikuje claims `iss`, `aud`, `sub`, `iat`, `exp`
  oraz nagłówek JOSE `kid`;
- access token jest przeznaczony dla konkretnego odbiorcy, np.
  `aud=bastiondesk-core`;
- refresh token i zarządzanie sesją pozostają po stronie auth service;
- używane są klucze asymetryczne — nie współdzielimy sekretu HMAC pomiędzy
  serwisami;
- rotacja kluczy wykorzystuje `kid` i okres przejściowy dla poprzednich kluczy;
- dokładny algorytm, preferencyjnie EdDSA/Ed25519 lub alternatywnie ES256, musi
  przejść spike kompatybilności z wybraną wersją Elysia i Better Auth.

Claims organizacji i uprawnień są minimalne. `org_id` oraz scope mogą przenosić
aktywny kontekst, ale NestJS zawsze wymusza tenant scope. Operacje wysokiego
ryzyka wymagają dodatkowej weryfikacji aktualnego membershipu, polityk,
approval i blast radius.

Sesja przeglądarkowa używa HttpOnly/Secure cookies. Tokenów nie zapisujemy w
`localStorage`. Jeżeli access JWT jest transportowany cookie, zachowujemy CSRF,
CORS i origin validation. Mechanizm token exchange lub bezpiecznego dołączenia
JWT do żądania core wymaga osobnego testu integracyjnego.

Token użytkownika nie jest poświadczeniem usługi. Komunikacja service-to-service
może używać mTLS oraz osobnych service tokenów z innym `audience`.

### 3. EffectTS jako warstwa wykonawcza core

**EffectTS** jest używany w nowym kodzie NestJS Core i workerów do:

- modelowania use case’ów jako `Effect<A, E, R>`;
- jawnego wstrzykiwania portów przez Context/Layer;
- typowanych błędów domenowych i integracyjnych;
- timeoutów, retry, cancellation i kontrolowanej współbieżności;
- testowania workflowów z testowymi implementacjami portów.

EffectTS nie jest osobnym serwisem i nie zastępuje NestJS jako frameworka HTTP.
Nie jest też wymagany do podstawowego przepływu Elysia + Better Auth. Nie
przepisujemy automatycznie frontendu, legacy Expressa, Bun SQL, Zod ani
adapterów integracyjnych.

## Strategia migracji

1. Zamknąć i zmierzyć baseline 1.0.3.
2. Wprowadzić kontrakty domenowe, event envelope, tenant scope i kontrakt
   JWT/JWKS.
3. Uruchomić Elysia 2 + Better Auth obok Expressa; przenieść ścieżki auth.
4. Dodać verifier JWT/JWKS do NestJS oraz przejściowo do ścieżek, które muszą
   działać przed pełnym przełączeniem.
5. Uruchomić NestJS Core obok Expressa i migrować moduły przez adaptery.
6. Przełączać ruch przez NGINX po osiągnięciu parity funkcjonalnego,
   bezpieczeństwa i obserwowalności.
7. Usunąć Better Auth z Expressa.
8. Wygasić Express dopiero po przeniesieniu wszystkich odpowiedzialności core.

Approval człowieka, joby i stan workflowu są trwałe w PostgreSQL. Nie wolno
utrzymywać oczekującego approval wyłącznie w pamięci fibra Effect.

## Konsekwencje

Pozytywne:

- auth i core mają osobne granice zaufania;
- core może być rozwijany niezależnie od mechanizmu logowania;
- NestJS porządkuje moduły domenowe, a EffectTS porządkuje workflowy i integracje;
- publiczny klucz JWKS pozwala weryfikować token bez współdzielenia sekretu.

Koszty:

- dwa deployable i dodatkowe kontrakty operacyjne;
- migracja cookies, CSRF, membershipów i istniejących użytkowników;
- cache oraz rotacja JWKS;
- konieczność utrzymywania zgodności API w okresie przejściowym;
- większy narzut poznawczy przez NestJS i EffectTS.

## Decyzje pozostawione do spike’ów

- dokładny mechanizm browser token exchange;
- wersje Elysia 2, Better Auth i EffectTS kompatybilne z Bun;
- wybór EdDSA/Ed25519 albo ES256;
- model lokalnej projekcji membershipów w NestJS;
- revocation access tokenów i dodatkowa kontrola dla active response;
- dokładna topologia NGINX, ścieżek i sieci wewnętrznej.

## Referencje

- [Better Auth — Elysia integration](https://better-auth.com/docs/integrations/elysia)
- [Better Auth — JWT and JWKS plugin](https://better-auth.com/docs/plugins/jwt)
- [Roadmapa BastionDesk](../future-soar-platform.md)
