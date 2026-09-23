# Faza 2 — migracje i kontrakty domenowe

Status: odebrana przez właściciela w punkcie 2.5, 23 września 2026,
w zakresie wdrożonych fundamentów i prototypów opisanych poniżej.
Zakres upgrade uzgodniony z właścicielem: obecny schemat 1.0.3 i izolowane
dane testowe. Nie wykonujemy migracji istniejącej instalacji użytkownika.

## Paczki pracy

| Paczka | Rezultat i kryterium odbioru | Status |
| --- | --- | --- |
| 2.1 Granice i pierwsze kontrakty | Mapa właścicieli, słownik, schemat zdarzenia oraz wspólne role/statusy/paginacja użyte przez legacy bez zmiany API | Wdrożone i zweryfikowane, 24/24 E2E |
| 2.2 Migracje i warstwa danych | Spike SQL/pg kontra Drizzle; ADR wyboru; rejestr migracji, checksumy, blokada współbieżności, transakcje; adoptowanie kopii 1.0.3 z zachowaniem danych dwóch organizacji | Wdrożone i zweryfikowane dla uzgodnionego baseline |
| 2.3 Kontrakty operacji i audytu | Błędy i odpowiedzi API, kontekst tenantów, idempotencja komend, model audytu/provenance oraz plan kompatybilności | Wdrożone kontrakty i reguły; trwałe adaptery w fazie 3 |
| 2.4 Kontrakt tożsamości | Spike JWT/JWKS i transportu przeglądarkowego, claims, rotacja, revocation, projekcja członkostwa; ADR i test integracyjny | Wdrożony kontrakt i prototyp; zgodność Elysia 2.0.0-beta.14 potwierdzona przed odbiorem 2.5 |
| 2.5 Odbiór | Pierwszy moduł używa kontraktów, upgrade i ponowne uruchomienie są kontrolowane, testy tenantów i pełna macierz E2E przechodzą | Odbiór właściciela potwierdzony; produkcyjne użycie kontraktów przez pierwszy moduł Core pozostaje w fazie 3 |

## Właściciele modeli

| Obszar | Właściciel docelowy | Granica odpowiedzialności |
| --- | --- | --- |
| Użytkownik, sesja, konto, PassKey | Auth | Core otrzymuje zweryfikowaną tożsamość; nie odczytuje tabel auth jako kontraktu |
| Organizacja, członkostwo, rola | Auth | Core egzekwuje własne polityki i tenant scope; projekcja nie przejmuje własności członkostwa |
| Incydent i przebieg obsługi | Moduł incydentów w Core | Przypisanie, notatki, status i rozstrzygnięcie; DTO pozostaje zgodne z 1.0.3 |
| Pliki i dokumenty | Moduł plików w Core | Metadane i autoryzacja; storage przechowuje bajty; ścieżka obiektu nie jest uprawnieniem |
| Audyt domenowy | Moduł audytu w Core | Historia decyzji i zmian; log techniczny nie zastępuje audytu |
| Alert, security event, asset | Przyszły moduł ingest | Odpowiedzialność fazy 6; w fazie 2 nie tworzymy pustych modeli wszystkich integracji |
| IOC, enrichment, skan | Przyszłe moduły analizy | Wynik zachowuje źródło, wersję i tenant; worker nie staje się właścicielem incydentu |
| Playbook, approval, akcja | Przyszłe moduły orkiestracji | Trwała decyzja i zakres działania; LLM nie autoryzuje akcji |

Słownik: [CONTEXT.md](../../CONTEXT.md). Dzisiejsze powiązania FK z tabelami
auth pozostają do czasu osobnej migracji; mapa nie opisuje zakończonego
rozdzielenia baz ani serwisów.

## Kontrakty wdrożone w 2.1

`backend/src/contracts/index.ts` jest modułem niezależnym od Expressa, Better
Auth i połączenia z bazą; zależy tylko od istniejącego Zod. Przy pojawieniu się
drugiego deployable przenosimy go do pakietu workspace, zamiast kopiować modele.

- Role i statusy mają jedno źródło definicji runtime i typy wyprowadzone ze
  schematów. Dotychczasowe importy pozostają kompatybilne.
- Paginacja JSON zachowuje kontrakt administracyjnego QUERY: page 1–1000,
  limit 1–100, domyślnie 1/20; bez konwersji stringów na liczby. Legacy GET
  zachowuje dotychczasową konwersję i własny zakres.
- ID tożsamości są niepustymi, nieprzekształcanymi stringami bez białych znaków
  (do 128 znaków w nowym kontrakcie), nie UUID. Nie zmieniamy istniejących ID
  w bazie; upgrade musi sprawdzić ich zgodność przed użyciem nowych kontraktów.
- Fabryka zdarzeń wiąże dokładny typ zdarzenia z walidatorem payloadu. Wersja
  envelope wynosi 1; nieobsługiwany typ lub wersja kończy się błędem walidacji.
  Schemat payloadu należy definiować jako strict i wersjonować osobno w typie
  zdarzenia, np. `incidents.created.v1`.

Envelope zawiera `id`, `type`, `schemaVersion`, `organizationId`, `occurredAt`
w UTC, `correlationId`, `causationId`, `actor`, `source` oraz `payload`.
`causationId=null` oznacza początek procesu; kolejne zdarzenie wskazuje
bezpośrednią przyczynę i zachowuje correlation ID. Aktor jest użytkownikiem
lub usługą. UUID zdarzenia pozostaje ten sam przy ponownym dostarczeniu.

To kontrakt danych, nie działający broker ani autoryzacja producenta.
W fazie 3 adapter pobierze tenant i aktora ze zweryfikowanego kontekstu;
konsument sprawdzi tenant zasobu, a w fazie 4 inbox wymusi unikalność
`(organizationId, consumer, eventId)`. Nie ufamy organizationId tylko dlatego,
że przeszedł walidację schematu. Klucz idempotencji komendy będzie osobnym
kontraktem w 2.3; nie utożsamiamy go z ID zdarzenia.

## Kompatybilność i kolejność

Publiczne ścieżki, nazwy pól, polskie statusy, znaczenie błędów oraz zachowanie
auth z 1.0.3 pozostają kontraktem parity. Nie ujednolicamy historycznych
formatów odpowiedzi bez adapterów i testów ich konsumentów.

Faza 3 uruchamia Core przy istniejącym auth w Expressie. Przejściowy adapter
tożsamości ma dostarczać zweryfikowany kontekst; jego sposób komunikacji
ustalamy w 2.4. Core nie importuje instancji Better Auth. Faza 5 przenosi
odpowiedzialność auth do Elysia i przełącza issuer/transport zgodnie z wynikiem
spike'u. Nie wymagamy produkcyjnego wydzielenia auth przed fazą 3.

## Wykonana paczka 2.2

Wybrano wersjonowany SQL i pg po dwóch prototypach. Uzasadnienie i granice
porównania zawiera [ADR-0002](../adr/0002-sql-migrations.md), a polecenia,
TLS, historię i procedurę operatora opisuje [migrator](../database/migrations.md).
Runner adoptuje dokładny baseline bez odtwarzania tabel. Obecnie nie ma
produkcyjnych migracji zmieniających modele SOAR; przyszłe pliki SQL
dołączamy append-only, a testy awarii używają własnego DDL fixture.

Poniższe kryteria sprawdzono w prototypie SQL/pg i zachowujemy je dla kolejnych
migracji:

Oddzielność migratora i runtime query layer. Kryteria: adoptowanie istniejącego
schematu bez odtwarzania tabel, checksum drift, równoczesne uruchomienie,
wycofanie nieudanej transakcji i powtórzenie bez podwójnego efektu.

Fixture musi zawierać konta, członkostwa, incydenty, audit i metadane plików
dwóch organizacji. Porównać dane przed i po upgrade oraz potwierdzić izolację
organizacji. Historyczne skrypty 001/002 nie mogą być wykonywane w ciemno na
bieżącym schemacie. Dane storage muszą pozostać osiągalne przez te same klucze.

Test odtworzenia backupu przeszedł na izolowanej bazie. Deklaracja wydania
`fresh install only` nadal obowiązuje: adoptowanie historii nie jest jeszcze
pełnym upgrade do przyszłego 2.0.

## Wykonana paczka 2.3

[Kontrakty operacji i audytu](operation-contracts.md) definiują wersjonowaną
komendę, tenant context, zakres klucza idempotencji, fingerprint i decyzje
execute/replay/conflict/in-progress. Model audytu ma aktora, źródło, wynik,
zasób i provenance bez kopiowania dowolnego payloadu.

Nowy katalog błędów ma adapter Express. Wspólny konstruktor odpowiedzi
zachowuje dotychczasowe statusy i body legacy. Testy obejmują scope organizacji
i aktora, semantykę ponowień, walidację audytu, bezpieczne błędy i parity API.
Nie dodano trwałego wykonawcy ani tabel audytu/idempotencji; ich wymagania
transakcyjne i zasady retencji są częścią kontraktu dla fazy 3.

## Wykonana paczka 2.4

[ADR-0003](../adr/0003-identity-bridge.md) i
[kontrakt tożsamości](identity-contract.md) ustalają serwerowy bridge,
Ed25519, minimalne claims, TTL 60 s, JWKS cache 30 s oraz bieżący odczyt sesji
i uprawnień bez lokalnej projekcji ról. Zaimplementowano oddzielne moduły
auth-side i verifier Core oraz test integracyjny rzeczywistego Better Auth.
Bridge nie zwraca JWT do przeglądarki; plugin `/token` i nagłówek JWT są
wyłączone w prototypie. Publiczne auth w `lib/auth.ts` pozostaje bez zmian.

Sprawdzono szyfrowanie privateKey, rotację, overlap kluczy, logout, zmianę roli
i organizacji, usunięcie członkostwa, wyłączenie konta, timeout i awarie.
Prototyp Elysia mount i pełny scenariusz tożsamości przeszły na przypiętej
**2.0.0-beta.14**; Elysia 2 jest przyjętą wersją docelową. Podłączenie transportu
mTLS i trwałego key store jest wymagane przed nowym przepływem produkcyjnym.
Przed wydzieleniem auth ponownie sprawdzamy aktualne wydanie 2.x.

Po odbiorze 2.5 następna jest faza 3 — uruchomienie NestJS Core i podłączenie
pierwszego modułu. Odbiór fundamentów nie oznacza zakończenia migracji backendu.

## Weryfikacja

23 września 2026: `bun run check`, 40/40 testów backendu, 24/24 testy frontendu,
test:order z seedami 42 i 1337 oraz `git diff --check` przeszły.
Po uruchomieniu OrbStack i zainstalowaniu wymaganych przeglądarek pełne E2E
zakończyło się wynikiem 24/24 (około 1,6 minuty samych testów), run
`1790179689509-73888`. Stos testowy został usunięty.

Integracja migratora: 10 grup kontroli zaliczonych, w tym CLI plan/apply,
rollback pierwszej migracji wraz z baseline, backup/restore i trigger audytu.
Drizzle: 3 grupy kontroli zaliczone; oba jednorazowe kontenery zostały usunięte.
Niezmienione kontrole frontendu korzystały z cache Turbo po udanym przebiegu
wyjściowym; E2E oraz integracje bazodanowe wykonano rzeczywiście.

Po 2.3: `bun run check`, 52/52 testy backendu (12 nowych testów kontraktów
operacji), 24/24 testy frontendu i `git diff --check` zaliczone. Pełny E2E run
`1790180528065-83754`: 24/24 w Chromium, Firefox i WebKit, około 1,5 minuty
samych testów. Stos testowy usunięto po zakończeniu. Migracje bazy nie zmieniły
się w tej paczce, więc nie powtarzano niezmienionych testów migratora.

Po 2.4: 57/57 testów backendu, 24/24 testy frontendu, check oraz 24/24 E2E
(run `1790181317210-93738`, około 1,4 minuty samych scenariuszy). Pięć testów
tożsamości obejmuje rzeczywiste podpisy i sesje Better Auth; osobny probe Elysia
sprawdza mount, cookies, JWKS i obcy origin. E2E dotyczy nadal legacy, a nowe
przepływy to testy in-process, bez deklarowania testu mTLS lub trwałości kluczy.

Przed odbiorem 2.5: Elysia **2.0.0-beta.14** zaliczyła smoke mount oraz pełny
scenariusz Better Auth/JWT przez Elysia (w tym logout przez HTTP handler,
wyczyszczenie cookie i odrzucenie istniejącego JWT). Manifest i lockfile
izolowanego prototypu są zapisane w repozytorium; zgodny peer exact-mirror
wynosi 1.2.6. Check i zwykłe testy backendu/frontendu ponownie przechodzą.
Nie powtarzano E2E legacy, ponieważ zmieniono tylko testy/prototyp i dokumentację;
produkcyjny runtime nie importuje Elysia. Ta bramka zgodności jest zamknięta,
a właściciel następnie potwierdził odbiór 2.5.

Odbiór dotyczy obecnych kontraktów, migratora baseline i prototypów. Kryterium
użycia kontraktów przez pierwszy produkcyjny moduł Core nie zostało jeszcze
potwierdzone; pozostaje jawnym zadaniem fazy 3. Trwałe adaptery operacji/audytu
i produkcyjny transport tożsamości również wymagają implementacji.
