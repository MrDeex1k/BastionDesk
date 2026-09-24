# ADR 0006: oddzielny właściciel tożsamości

Auth działa jako osobny proces Elysia 2 z Better Auth; zachowuje publiczny origin,
cookies, sekret sesji i RP ID WebAuthn, a gateway wymienia sesję na JWT wyłącznie
po stronie serwera. Core weryfikuje asymetryczny JWT przez kanoniczny JWKS oraz
aktualny stan sesji i membership przez mTLS, bez importowania instancji Better Auth.

## Discovery 5.1 (2026-09-23)

Przypięto Elysia `2.0.0-beta.16`, Better Auth i `@better-auth/passkey` `1.7.5`.
Elysia 2 nadal jest betą (npm dist-tag `next`); akceptujemy ten status zgodnie
z wcześniejszą decyzją projektu. Test `identity/better-auth.test.ts` wykonuje
rzeczywisty handler przez Elysia: cookies, organizacje, JWT, rotacja, logout,
zmiana roli i blokada konta. Klucze JWT przechowuje plugin Better Auth w bazie,
z szyfrowanym kluczem prywatnym; publiczne endpointy nie wydają tokenów Core.

WebAuthn pozostaje na dotychczasowym RP ID i origin; nie zmieniamy formatu
`credentialId`, liczników ani kluczy publicznych istniejących PassKeys.
OIDC jest obsługiwany przez Better Auth, ale włączenie konkretnego providera
wymaga osobnej decyzji o issuer, client credentials, account linking i membership.
Nie tworzymy automatycznie członkostwa na podstawie domeny e-mail.

Źródła: [Elysia 2](https://elysiajs.com/blog/elysia-20),
[JWT Better Auth](https://www.better-auth.com/docs/plugins/jwt),
[Passkey](https://www.better-auth.com/docs/plugins/passkey),
[OIDC](https://www.better-auth.com/docs/plugins/generic-oauth).
