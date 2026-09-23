# Faza 2.3 — kontrakty operacji, błędów i audytu

Status: wdrożone kontrakty i reguły, 23 września 2026. Pliki znajdują się w
`backend/src/contracts/`. W tej paczce nie uruchamiamy nowego API, wykonawcy
komend ani brokera. Obecne endpointy nie stają się automatycznie idempotentne.

## Komenda i kontekst organizacji

`commandSchema(operation, payloadSchema)` tworzy ścisły schemat komendy:

| Pole | Znaczenie |
| --- | --- |
| `schemaVersion` | Wersja envelope, obecnie 1 |
| `id` | UUID konkretnej próby, odrębny od klucza idempotencji |
| `operation` | Dokładna nazwa i wersja, np. `incidents.note.v1` |
| `context` | Organizacja, aktor user/service, correlation ID i nullable causation ID |
| `idempotencyKey` | Klucz logicznej operacji, 1–128 znaków ASCII: litery, cyfry, `_`, `-` |
| `target` | Typ zasobu i jego identyfikator |
| `payload` | Zwalidowane dane domenowe; każdy use case definiuje własny strict schema |

Adapter pobiera organizację i aktora ze zweryfikowanej tożsamości, a nie
z body HTTP. Schemat sprawdza kształt danych, nie uwierzytelnia użytkownika.
Przed wykonaniem **i przed replay** trzeba sprawdzić aktualne uprawnienia
oraz tenant zasobu. `requireResourceTenant` zwraca neutralny `NOT_FOUND` dla
zasobu obcej organizacji. Repozytorium musi dodatkowo zawężać odczyt i zapis
przez organization ID; helper nie zastępuje predykatu SQL.

## Idempotencja

Zakres zapisu wyniku to pełna krotka:

`(organizationId, actor.kind, actor.id, operation, idempotencyKey)`.

Nie wolno szukać wyniku wyłącznie po kluczu ani sklejać pól nieescapowanym
separatorem. Docelowy adapter PostgreSQL używa osobnych kolumn i unikalności
pełnej krotki.

`commandFingerprint` liczy SHA-256 kanonicznego JSON z wersji envelope,
operacji, target i payload. Klucze obiektów są sortowane rekurencyjnie,
kolejność tablic pozostaje znacząca. ID próby i kontekst śledzenia nie zmieniają
fingerprintu. JSON nie może zawierać undefined, Date, NaN ani Infinity;
duże liczby wymagające dokładności przesyłamy jako string. Normalizacja
domenowa następuje przed obliczeniem skrótu, identycznie na każdej próbie.

`decideIdempotency` podejmuje decyzję na podstawie komendy i zapisu wyniku:

| Stan | Wynik |
| --- | --- |
| Brak zapisu (`null`) | `execute`; dopiero atomowe zajęcie klucza pozwala wykonać komendę |
| Inny zakres zapisu | `NOT_FOUND`, bez zwracania obcych danych |
| Ten sam zakres, inny fingerprint | `IDEMPOTENCY_CONFLICT`, HTTP 409, bez retry z tym kluczem |
| Ten sam zakres i fingerprint, `in_progress` | `OPERATION_IN_PROGRESS`, HTTP 409, dopuszczalne ponowienie |
| Ten sam zakres i fingerprint, `completed` | `replay` z zapisanym wynikiem |
| Uszkodzony zapis | Błąd walidacji; nigdy automatyczne ponowne wykonanie |

To czysta reguła, nie implementacja trwałej gwarancji exactly-once. Port danych
w fazie 3 musi atomowo zajmować klucz i zapisywać zmianę domenową, wynik oraz
audyt w jednej transakcji. Dwa równoległe `execute` bez unikalności i blokady
w bazie nie są bezpieczne. Walidacja, auth i policy poprzedzają claim; przegrany
wykonawca odczytuje istniejący zapis i ponownie stosuje regułę.

Komendy tej wersji dotyczą atomowych zmian w PostgreSQL. Rollback usuwa claim
wraz ze zmianą; ponowienie może wykonać operację. Nie utrzymujemy wygasającego
claimu dla częściowo wykonanej akcji zewnętrznej. Workery, outbox/inbox,
recovery i efekty zewnętrzne należą do kolejnych faz. Wynik musi być DTO bez
sekretów i przejść schemat konkretnego use case'u przed zapisem i replay.

Brak automatycznego TTL: skasowanie zapisu może umożliwić ponowny efekt.
Polityka retencji wymaga jawnego horyzontu deduplikacji i osobnej decyzji;
replay nie tworzy drugiego audytu sukcesu ani drugiego zdarzenia domenowego.

## Błędy i odpowiedzi

`DomainError` udostępnia zamknięty katalog kodów. `domainErrorResponse` mapuje
je na HTTP i ustalone publiczne komunikaty. Nieznany błąd staje się
`INTERNAL_ERROR`; treść wyjątku, SQL i dane połączenia nie trafiają do body.
`retryable` jest metadanym dla adaptera/polityki retry, nie nowym polem legacy.

`domainResponseSchema(dataSchema)` rozróżnia sukces `{success:true,data}`
i błąd `{success:false,error:{code,message}}`. Schematy DTO nowych operacji
są wersjonowane wraz z nazwą operacji; zmiana semantyki wymaga nowej wersji.

`sendErrorResponse` używa wspólnego konstruktora odpowiedzi. Dotychczasowe
statusy, kody, komunikaty i opcjonalne `details` pozostają identyczne.
Middleware Express rozpoznaje nowy DomainError przed historycznym AppError.
Nie ujednolicamy starych sukcesów, resetu hasła, Better Auth ani formatów
specyficznych dla poszczególnych endpointów. Ich dotychczasowe zachowanie
pozostaje chronione przez E2E.

## Audyt i pochodzenie dowodów

`createAuditEntry` pobiera organizację, aktora i identyfikatory śledzenia
z kontekstu po sprawdzeniu tenant zasobu. Wpis zawiera własny UUID, command ID,
wersję, źródło/producenta, wersjonowaną akcję, zasób, czas UTC, wynik,
kod powodu, nazwy zmienionych pól i listę referencji provenance.

- `succeeded`: zatwierdzona zmiana, powód `USER_REQUEST` albo `SYSTEM_RULE`;
- `denied`: odmowa polityki, `POLICY_DENIED`, brak zatwierdzonych zmian;
- `failed`: `DEPENDENCY_FAILURE` lub `INTERNAL_FAILURE`, brak zatwierdzonych zmian.

Wpis nie zawiera dowolnego body, starej/nowej treści notatki, cookies, tokenów,
kluczy ani stack trace. Nieznane pola są odrzucane. Same identyfikatory również
muszą być wewnętrznymi ID, nie URL z poświadczeniami. Lista zmienionych pól
nie ma duplikatów; błędy i odmowy nie mogą deklarować zatwierdzonych zmian.

Provenance opisuje źródło, identyfikator źródłowego dowodu, czas obserwacji
i zebrania, SHA-256 treści oraz nazwę i wersję transformacji (lub null dla
surowego dowodu). Czasy mają być znormalizowane do UTC; obserwacja nie może
następować po zebraniu. Adapter musi rozstrzygnąć clock skew źródła przed
utworzeniem rekordu. Każda referencja dziedziczy tenant wpisu; resolver musi
sprawdzić przynależność źródła i wskazanego dowodu do tej organizacji.

Docelowy zapis audytu jest append-only i trwały. Sukces zapisujemy atomowo
ze zmianą i wynikiem komendy. Odmowę lub błąd po rollbacku zapisujemy osobno,
z zachowaniem command/correlation ID. Nie zastępujemy istniejącego triggera
`incident_audit_log` ani nie backfillujemy fikcyjnego aktora/correlation ID
dla starych rekordów. Migracja schematu trwałego audytu i adapter zapisujący
go należą do implementacji core w fazie 3.

## Odbiór

Testy sprawdzają konflikt klucza, replay, operację w toku, izolację zakresu,
canonical JSON, odrzucenie nie-JSON, neutralne błędy tenantów, schemat audytu,
provenance, bezpieczne mapowanie błędów i zgodność helpera HTTP z legacy.
Pełna macierz E2E weryfikuje publiczne przepływy 1.0.3. Testy te nie są dowodem
trwałości lub współbieżności przyszłego wykonawcy komend — taki dowód będzie
wymagany przy dołączeniu adaptera PostgreSQL.
