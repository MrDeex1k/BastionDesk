# Migrator fazy 2

Migrator jest narzędziem uruchamianym jawnie, niezależnie od startu backendu.
Pierwszy obsługiwany krok to adoptowanie dokładnego schematu 1.0.3: utworzenie
`bastiondesk_meta.migrations` i zapis baseline, bez zmiany danych aplikacji.
Nie stanowi to jeszcze wydanego upgrade do 2.0.

## Źródła

- `database/init-sql/` nadal inicjalizuje świeżą bazę 1.0.3.
- `database/versioned/baseline-1.0.3.json` zawiera zamrożony fingerprint
  schematu z PostgreSQL 18.6.
- Przyszłe migracje trafiają do `database/versioned/0001_nazwa.sql`, następnie
  `0002_nazwa.sql` itd., bez luk i zmian istniejących plików.
- `database/migrations/001-*` oraz `002-*` to historyczne ręczne korekty
  Better Auth. Runner ich nie skanuje ani nie uruchamia automatycznie.

Nowa baza i istniejąca baza muszą przed adoptowaniem odpowiadać temu samemu
baseline. Dodatkowa kolumna `account.issuer` lub inne historyczne różnice
wymagają osobnej, przeglądanej ścieżki upgrade; nie są automatycznie usuwane.

## Połączenie i polecenia

Ustawić `MIGRATION_DATABASE_URL` dla **bezpośredniego PostgreSQL**, z kontem
uprawnionym do DDL. Nie korzystać z PgBouncera. Runner nie korzysta awaryjnie
z aplikacyjnego `DATABASE_URL`.

Dla zwykłego środowiska podać `MIGRATION_TLS_CA`, `MIGRATION_TLS_CERT` oraz
`MIGRATION_TLS_KEY` wskazujące pliki mTLS. Weryfikacja serwera jest włączona.
URL nie może zawierać parametrów, które mogłyby nadpisać konfigurację SSL.
Wyłącznie dla izolowanego localhost można jawnie ustawić
`MIGRATION_ALLOW_LOCAL_PLAINTEXT=true`.

```sh
bun run db:migrate:plan
bun run db:migrate:apply
bun run test:migrations
```

`plan` sprawdza baseline/historię i pokazuje oczekujące identyfikatory,
po czym wycofuje transakcję bez tworzenia rejestru. `apply` wykonuje cały
oczekujący pakiet w jednej transakcji. Pole `adopted` w wyniku opisuje stan
przed wywołaniem; `pending` to plan wybranego przebiegu. Powtórny `plan`
po udanym `apply` zwraca pustą listę.

## Procedura operatora

1. Zatrzymać zapisy i inne zmiany DDL w aktualizowanej instalacji.
2. Wykonać backup i zweryfikować restore w oddzielnej bazie.
3. Na kopii uruchomić `plan`, przejrzeć pliki SQL i zastosować `apply`.
4. Zweryfikować konta, izolację organizacji, workflow i dostęp do plików.
5. Dopiero potem wykonać tę samą procedurę dla wybranej instalacji.

Testy w tym zadaniu używają wyłącznie jednorazowego kontenera, nie `.env`
ani danych aplikacji użytkownika. Nie uruchamiano migratora na jego bazie.

## Kontrole i ograniczenia

Rejestr przechowuje ID, SHA-256 pliku SQL, fingerprint po migracji i czas
zastosowania. Brakująca/zmieniona historia, pusta istniejąca historia i
niezgodny schemat blokują wykonanie. Baseline ma checksum własnego fingerprintu.
Advisory lock obowiązuje przez całą transakcję; oczekiwanie na blokadę trwa
maksymalnie 10 s, a pojedyncze polecenie SQL maksymalnie 60 s. Timeout kończy
się rollbackiem; kolejne uruchomienie ponownie weryfikuje historię.

Fingerprint obejmuje relacje public, kolumny, wartości domyślne, klucze,
indeksy, enumy, funkcje aplikacji, triggery i ich aktywność, definicje widoków,
podstawowe definicje polityk RLS oraz wersje rozszerzeń. Nie jest pełnym
audytem konfiguracji: nie porównuje właścicieli, grantów, innych schematów,
ustawień serwera ani bieżących wartości sekwencji. Nowe rodzaje obiektów
wymagają rozszerzenia kontraktu fingerprintu i testu kompatybilności.

Obsługujemy PostgreSQL 18; referencyjny test działa na obrazie 18.6. Zmiana
wersji rozszerzenia lub sposobu renderowania definicji przez PostgreSQL może
wymagać przeglądu zgodności. Nie regenerować baseline tylko po to, by ominąć
`SCHEMA_DRIFT`. Generowanie `--record-baseline` jest jednorazowym narzędziem
testowym; odmawia nadpisania istniejącego pliku.

SQL jest zaufanym, przeglądanym kodem repozytorium. Nie umieszczać w nim
`BEGIN`, `COMMIT`, `ROLLBACK`, zmian search_path ani operacji poza transakcją
(np. `CREATE INDEX CONCURRENTLY`). Runner nie jest sandboxem SQL. Każdy plik
musi przejść test błędu i powtórzenia. Automatyczne cofanie zmian danych nie
jest wspierane: użyć poprawki forward albo sprawdzonego restore w oknie serwisowym.

## Dowody testowe

`test:migrations` tworzy PostgreSQL na tmpfs, z losowym hasłem i portem
wyłącznie loopback, inicjalizuje schemat i dane dwóch organizacji, robi
pg_dump i restore do drugiej bazy, a następnie sprawdza:

- identyczność wszystkich wierszy public przed i po adoptowaniu;
- plan bez zapisów, CLI apply i ponowne uruchomienie;
- rollback pierwszej migracji wraz z rejestrem oraz rollback późniejszego DDL;
- jednorazowy efekt dwóch równoczesnych runnerów;
- odrzucenie zmienionej/brakującej historii, zmienionego schematu i wyłączonego triggera;
- tenant-scoped odczyt, zachowanie kluczy plików, trigger audytu i datę rozwiązania.

Migracja testowa tworząca `migration_probe` jest fixture, nie produkcyjnym
plikiem SQL. Test zachowuje metadane/klucze plików; nie kopiuje bajtów S3.
Pełne E2E osobno sprawdza upload i pobieranie plików. Kontener jest usuwany
w `finally` oraz po SIGINT/SIGTERM; po SIGKILL może wymagać ręcznego sprzątnięcia
kontenera z prefiksem `bastiondesk-migrations-`.

## Rozszerzenie fazy 3

`0001_core_operations.sql` dodaje `core_command_receipts` i `core_audit` bez
zmiany danych incydentów lub tabel auth. Należy wykonać `plan` i `apply`
**przed uruchomieniem nowego Core**, również po świeżej inicjalizacji
bazy 1.0.3. Migrator i pliki SQL są dostępne w obrazie backendu; uruchomienie
migratora jest osobnym krokiem operatora, nie automatyczną migracją przy starcie.
Backend przed otwarciem portu sprawdza obecność tabel i wpisu 0001 w historii.
Bramka startu nie zastępuje pełnego sprawdzenia fingerprintu przez `plan`.

`MIGRATION_DIRECTORY` może wskazać zaufany katalog operatora z manifestem
baseline i plikami SQL; domyślny pozostaje `database/versioned`. Testy bazowego
runnera używają własnego manifestu, a integracja Core testuje rzeczywistą
migrację 0001 i jej bezpieczne powtórzenie.

Potwierdzenia komend są rozdzielone przez organizację, aktora, operację i klucz.
Bez nagłówka `Idempotency-Key` każde żądanie otrzymuje nowy klucz. Powtórzenie
tego samego klucza/payloadu zwraca zapisany rezultat; zmieniony payload daje
409. Nie ma automatycznego wygaszania: usunięcie receipt umożliwi ponowne
wykonanie starego klucza, więc retencja wymaga jawnej decyzji operatora.

Audyt sukcesu oraz receipt powstają atomowo ze zmianą incydentu. Odrzucenie
przez politykę komendy jest zapisywane po rollbacku w osobnej transakcji;
awaria samego audytu nie zmienia pierwotnego błędu. Błędy przed wejściem do
repozytorium (np. brak sesji, niepoprawne HTTP) pozostają logami warstwy wejścia.
Audyt przechowuje metadane, bez treści dokumentów i notatek; nie jest jeszcze
zewnętrznym, odpornym na działania administratora archiwum.
