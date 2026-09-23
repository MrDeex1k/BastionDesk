# ADR-0003 — serwerowy bridge tożsamości i bieżąca autoryzacja

Status: przyjęte dla kontraktu i prototypu fazy 2.4, 23 września 2026.

Przeglądarka zachowuje sesję Better Auth w cookie HttpOnly. Zaufany bridge
po stronie serwera weryfikuje sesję i politykę żądania, wystawia krótkotrwały
JWT oraz przekazuje go do Core we własnym nagłówku Authorization. JWT nie
trafia do przeglądarki, localStorage ani dodatkowego cookie. Core weryfikuje
EdDSA/Ed25519 przez przypięty JWKS i dla każdego żądania pyta auth o aktualną
sesję, organizację i członkostwo. Nie przechowuje lokalnej projekcji ról
w pierwszej wersji.

## Powód i koszt

Sam JWT nie odzwierciedla wylogowania i zmiany roli przed wygaśnięciem.
Sprawdzenie bieżącego stanu ogranicza ten okres do trwającego żądania, kosztem
zależności Core od dostępności auth i dodatkowego odczytu. Awaria lub timeout
kończy się odmową, bez awaryjnego korzystania ze starej roli. Operacje wysokiego
ryzyka nadal potrzebują sprawdzenia polityki bezpośrednio przed efektem.

Wybrano EdDSA/Ed25519 po rzeczywistym podpisaniu przez Better Auth 1.7.5
i weryfikacji przez jose 6.2.12 na Bun 1.4.2. ES256 pozostaje opcją dla przyszłego
środowiska z innymi wymaganiami kryptograficznymi; nie dodajemy go do allowlisty.

Token ma TTL 60 s, tolerancję czasu 5 s, pojedyncze audience
`bastiondesk-core` i minimalne claims. Cache JWKS trwa 30 s, timeout zależności
2 s, rotacja kluczy 24 h, okres zachowania starego klucza 300 s.
Parametry i scenariusz przełączenia są opisane w
[kontrakcie tożsamości](../backend/identity-contract.md).

## Better Auth i transport

Plugin JWT potrafi publikować JWKS, podpisywać po stronie serwera i szyfrować
klucze prywatne. Jego publiczne `/token` wyłączamy przez `disabledPaths`,
a nagłówek JWT sesji przez `disableSettingJwtHeader`. Nie zmieniamy
cookieCache sesji w całej aplikacji; bridge korzysta z
`getSession({query:{disableCookieCache:true}})` i bieżącego odczytu auth.
Potwierdzono to testem z realnym pluginem i pamięciowym adapterem Better Auth.
Referencja: [JWT plugin](https://better-auth.com/docs/plugins/jwt).

Docelową warstwą HTTP jest **Elysia 2**, zgodnie z decyzją właściciela.
Przed odbiorem 2.5 potwierdzono `.mount(auth.handler)` na przypiętej wersji
**2.0.0-beta.14**, Better Auth **1.7.5**, jose **6.2.12** i Bun **1.4.2**.
Scenariusz obejmuje cookies, sesje, odrzucenie obcego originu, podpisywanie
serwerowe, weryfikację przez JWKS pobrany przez Elysia, rotację i revocation.
Zmiana frameworka nie wymagała zmiany kontraktu ani kodu bridge/verifier.

To oficjalna beta, nie stabilne 2.0; wcześniejszy brak dopasowania `elysia@2`
nie oznaczał braku prerelease. Wersję i zależności izolowanego prototypu
utrwala `scripts/spikes/elysia2/{package.json,bun.lock}`. Wymagany peer
`exact-mirror` przypięto do 1.2.6; wersja 0.2.7 z prototypu Elysia 1 nie jest
zgodna z Elysia 2. Nie używamy ruchomego tagu `next`. Przed fazą 5 ponownie
oceniamy aktualne wydanie 2.x i testujemy upgrade przypiętej wersji.
Referencje: [Elysia 2 beta](https://elysiajs.com/blog/elysia-20),
[Better Auth mount](https://better-auth.com/docs/integrations/elysia).

Prototyp nie włącza pluginu w obecnym `lib/auth.ts`, nie przenosi endpointów
i nie zmienia danych istniejącej instalacji. Włączenie przy pierwszym module
Core wymaga trwałej tabeli kluczy, wewnętrznego transportu mTLS oraz testu
restartu i odtworzenia kluczy. Produkcyjne wydzielenie auth pozostaje fazą 5.
