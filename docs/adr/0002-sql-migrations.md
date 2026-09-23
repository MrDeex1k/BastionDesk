# ADR-0002 — wersjonowany SQL i jawne adoptowanie schematu 1.0.3

Status: przyjęte dla fazy 2; 23 września 2026.

BastionDesk ma istniejący schemat PostgreSQL z funkcjami, triggerami, enumami
i tabelami Better Auth. Migracje będą przeglądanymi plikami SQL wykonywanymi
przez dedykowanego klienta `pg`; migrator zachowa historię z checksumami,
kontrolę zgodności schematu i blokadę transakcyjną. Dzięki temu możemy objąć
istniejące dane historią migracji bez odtwarzania tabel i bez jednoczesnego
przepisywania warstwy zapytań.

## Porównanie i zakres dowodu

| Kryterium | SQL + obecny pg | Drizzle |
| --- | --- | --- |
| Istniejące funkcje i triggery | Pozostają przeglądanym SQL | Można użyć własnych migracji SQL; nie zakładamy pełnego generowania tych obiektów |
| Adoptowanie 1.0.3 | Jawne porównanie fingerprintu przed rejestracją | Nadal wymaga sprawdzenia stanu istniejącej instalacji i procedury baseline |
| Runtime | Wykorzystuje obecny sterownik | Może działać niezależnie od zewnętrznego migratora |
| Koszt | Utrzymujemy niewielki własny runner i testy awarii | Nowe narzędzie, konfiguracja i potencjalnie reprezentacja schematu w TypeScript |

Drizzle dopuszcza podejście database-first, zewnętrzne migracje oraz custom SQL
([model migracji](https://orm.drizzle.team/docs/migrations),
[custom SQL](https://orm.drizzle.team/docs/kit-custom-migrations)). Nie odrzucamy
go jako przyszłej warstwy typowanych zapytań. W tej fazie zachowujemy Bun SQL
w legacy i wybieramy parametryzowany SQL przez `pg` dla migratora oraz pierwszych
nowych adapterów danych. Interfejsy domenowe nie mogą ujawniać typów sterownika;
wyniki zapytań wymagają mapowania i walidacji na granicy adaptera.

Wykonano dwa prototypy na PostgreSQL 18.6. SQL/pg przeszedł backup/restore,
adoptowanie, powtórzenie, checksum drift, schema drift, współbieżność i rollback.
Drizzle ORM 0.45.3 z pg 8.23.0 przeszedł mapowanie istniejącego enuma,
generowanie UUID v7, odczyt po tenant scope, zapis z istniejącymi triggerami
oraz rollback DDL i danych. Fingerprint legacy pozostał identyczny. To dowód
kompatybilności ograniczonego adaptera, nie pełnej introspekcji lub Drizzle Kit.

Wniosek: oba podejścia obsługują sprawdzony przypadek. Wybrano pg ze względu
na istniejący SQL i brak potrzeby utrzymywania drugiej deklaracji schematu
podczas rozdzielania auth/core. Kosztem jest ręczne typowanie i mapowanie
wyników. Nie stwierdzono przewagi wydajnościowej; nie wykonywano benchmarku.
Drizzle można ponownie ocenić, gdy koszt mapowania nowych modeli to uzasadni.

Prototyp: `scripts/spikes/phase2-drizzle.mjs`. Zależności zainstalowano przez
Socket Firewall w `/tmp/bastiondesk-drizzle-spike`, bez zmian lockfile projektu.
Odtworzenie: w osobnym katalogu pakietu zainstalować dokładnie
`drizzle-orm@0.45.3` i `pg@8.23.0`, a następnie uruchomić z katalogu repo:

```sh
DRIZZLE_SPIKE_DIR=/ścieżka/do/katalogu/pakietu bun scripts/spikes/phase2-drizzle.mjs
```

Transakcja używa jednego klienta, zgodnie z
[kontraktem node-postgres](https://node-postgres.com/features/transactions).
Blokada `pg_advisory_xact_lock` serializuje migratory i znika wraz z transakcją
([PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS)).
Nie chroni przed ręcznym DDL ani nie zastępuje okna serwisowego.

Konsekwencje: migracje są append-only, nie wykonujemy automatycznego `down`,
a zmiany nieobsługiwane wewnątrz transakcji wymagają osobnej procedury.
Szczegóły operacyjne: [instrukcja migratora](../database/migrations.md).
