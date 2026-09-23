# ADR-0004 — przejściowy NestJS Core we wspólnym procesie

W fazie 3 NestJS Core startuje jako oddzielna aplikacja HTTP montowana przez
adapter w istniejącym Expressie. Wspólny proces ogranicza koszt migracji dwóch
rodzin legacy API; wydzielenie deployable i sieciowego JWT/mTLS pozostaje do
fazy 5. Core otrzymuje porty danych, storage i świeżej tożsamości, bez importu
instancji Better Auth oraz bez własnego odczytu tabel auth.

To etap modularnego monolitu, nie gotowa izolacja procesów. Granicą zaufania
jest wstrzyknięty port auth; nie przyjmujemy tożsamości z nagłówków klienta.
Kontrakt JWT/JWKS z ADR-0003 pozostaje właściwy dla przyszłego przejścia przez
sieć. SQL i fizyczne FK nadal są wspólne do osobnej migracji.

NestJS 12.0.4, Effect 3.22.2, Bun 1.4.2. Dekoratory Nest rejestrujemy jawnie,
aby uruchomienie testów i skryptów z różnych katalogów nie zależało od wyboru
trybu dekoratorów przez transpiler Bun. Logika domenowa używa Effect i portów;
formaty HTTP legacy pozostają odpowiedzialnością adapterów.
