# Faza 4 — trwałe zadania i obserwowalność

Branch `feat/stage4-implement` powstał z `feat/stage3-implement` przed jego merge.
Etapy kończymy osobnymi commitami.

| Etap | Zakres | Status |
| --- | --- | --- |
| 4.1 | Discovery i wybór topologii | Gotowe |
| 4.2 | Kontrakt, routing, retry i DLQ | Gotowe |
| 4.3 | Outbox/inbox i trwała deduplikacja | Gotowe |
| 4.4 | Worker klasyfikacji LLM | Gotowe |
| 4.5 | Telemetria, awarie i runbook | Gotowe technicznie; do odbioru |

## Ustalenia discovery

Pierwszy proces: klasyfikacja LLM po utworzeniu incydentu. Żądanie użytkownika
czeka na transakcję bazy, a nie na broker lub model. Komunikat zawiera tylko
identyfikator zadania; opis incydentu pozostaje w PostgreSQL. Worker pobiera
stan z bazy przez scope organizacji zapisany przez Core.

RabbitMQ odpowiada za dystrybucję dostarczeń. Publisher confirm nie oznacza
wykonania przez konsumenta; po utracie potwierdzenia możliwy jest duplikat.
Konsument potwierdza po trwałym zapisie rezultatu albo decyzji o retry/DLQ.
Źródła: [confirms](https://www.rabbitmq.com/docs/confirms),
[reliability](https://www.rabbitmq.com/docs/reliability),
[quorum queues](https://www.rabbitmq.com/docs/quorum-queues).

Redis rozważono dla cache, nie jako źródło trwałego stanu. Brak bieżącego
konsumenta nie uzasadnia wdrażania dodatkowej zależności operacyjnej.
[Persistence Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
Decyzja i ograniczenia: [ADR-0005](../adr/0005-durable-jobs.md).

Referencyjny RabbitMQ: `4.2.5-management-alpine`, obraz zweryfikowany w OrbStack.
Jeden węzeł Compose daje trwałość przy restarcie procesu, ale nie odporność na
utratę hosta. Docelowe HA wymaga co najmniej trzech węzłów i kopii PostgreSQL.

Discovery potwierdziło publisher confirm, zachowanie wiadomości po restarcie
oraz redelivery bez ACK. Test: `bun backend/src/messaging/discovery.ts`.
Runner ponownie odczytuje losowy port po restarcie kontenera. Check przechodzi.

## 4.2 — kontrakt dostarczenia

Wersja 1 zawiera wyłącznie `schemaVersion`, `type` i `jobId`; walidator odrzuca
inne pola i payload ponad 1 KiB. Exchange direct `bastiondesk.jobs.v1` kieruje
`incident.classify.v1` do kolejki quorum `bastiondesk.classifier.v1`.
Błędne wiadomości trafiają przez DLX do `bastiondesk.classifier.dead.v1`.
Potwierdzenie publikacji wymaga także braku mandatory return.

Próby: maksymalnie 4, opóźnienia 5/30/120 s. Błąd trwały kończy próby od razu.
Terminy retry i DLQ są stanem PostgreSQL; broker nie wyznacza liczby wykonań.
Prefetch 1 ogranicza równoległość pojedynczego konsumenta. Domyślnie wymagamy
AMQPS z weryfikacją CA; plaintext jest dostępny tylko w jawnych testach loopback.

Weryfikacja: 69 testów backendu, check i rzeczywisty RabbitMQ (routing, DLQ,
mandatory return, restart i ponowne dostarczenie).

## 4.3 — trwały rejestr

Migracja 0002 dodaje `core_jobs`. Utworzenie incydentu, receipt, audyt i zadanie
są jedną transakcją. `completed` pełni funkcję inbox: duplikat nie zapisuje
ponownie kategorii ani audytu. Dzierżawa 120 s i losowy token odrzucają spóźnione
wyniki; każda nowa dzierżawa zużywa próbę, również po awarii procesu.

Relay ponawia nieukończone dostarczenia co 30 s, wybierając porcje przez
`FOR UPDATE SKIP LOCKED`. Potwierdzenie RabbitMQ nie usuwa zadania z PostgreSQL.
Stan `dead` jest trwałym DLQ; kopia wskaźnika trafia również do kolejki DLQ.
Brak automatycznej retencji — usunięcie ukończonego zadania usuwa deduplikację.

Integracja PostgreSQL przeszła: atomowy rollback, brak drugiego zadania po
replay, jeden właściciel dzierżawy, fencing starego wyniku, tenant scope,
cztery próby, DLQ i replay ograniczony organizacją. Backend wymaga teraz także
migracji 0002 przed startem. Dotychczasowy callback LLM zastąpi worker w 4.4.

## 4.4 — pierwszy worker

`classifier-worker` uruchamia relay i konsumenta Effect poza procesem HTTP.
Compose dodaje RabbitMQ po AMQPS i osobny wolumen danych brokera. Przeglądarka
nie czeka na LLM, a worker ładuje opis incydentu z właściwej organizacji.
Deadline gRPC nie może przekroczyć 90 s przy dzierżawie 120 s. Po rozłączeniu
worker zamyka kanały i ponawia połączenie; baza pozostaje źródłem zadań.

Dotychczasowy callback best-effort usunięto. Wynik klasyfikacji nie nadpisuje
już ustawionej kategorii. Test PostgreSQL potwierdza pojedynczy efekt pomimo
duplikatu. Check, 69 testów backendu i 24 frontendu przechodzą. Pełne E2E
z AMQPS i osobnym workerem: 24/24, run `1790188912054-10365`.
Końcowy odbiór 4.5 obejmie dodatkowe oczekiwanie na kategorię w E2E.

## 4.5 — odbiór

OTLP HTTP eksportuje trace z HTTP przez persisted traceparent i nagłówek AMQP
po konsumenta oraz metryki backlog, lag, wyników i czasu prób. Eksport jest
opcjonalny; lokalny kolektor i konfigurację produkcyjną opisuje
[runbook](messaging-runbook.md). CLI obsługuje listę zadań i ograniczony tenantem,
audytowany replay ze stanu dead.

Końcowy check i testy: 69 backend, 24 frontend, integracja Core/PostgreSQL,
regresja migratora, discovery RabbitMQ i rzeczywisty eksport OTLP — zielone.
Test OTLP potwierdza także relacje parent/child dwóch równoległych trace,
a discovery potwierdza przekazanie traceparent przez rzeczywiste AMQP.
Walidator obrazu kolektora 0.148.0 i konfiguracja Compose przechodzą.

E2E: 24/24, run `1790189270042-11029`, z oczekiwaniem na wynik klasyfikacji.
Dodatkowy probe zatrzymuje broker i worker, tworzy incydent przez rzeczywisty
adapter Core, wznawia usługi i potwierdza pojedynczy audyt mimo ponownych
dostarczeń. Wszystkie te operacje dotyczą wyłącznie izolowanych danych.
Po E2E dodano tylko atrybuty diagnostyczne spanu; osobny test OTLP i check
potwierdzają końcowy kod obserwowalności.

Migracja 0002 nie odtwarza automatycznie klasyfikacji historycznych incydentów;
nowy workflow obejmuje nowo tworzone zadania. Nie wdrożono nieużywanego Redis,
HA brokera ani archiwum telemetrii. Wywołanie LLM może się powtórzyć po awarii,
ale zapis skutku w PostgreSQL jest deduplikowany. Retencja zadań i sprzątanie
osieroconych obiektów S3 pozostają osobnymi decyzjami operacyjnymi.

Faza 4 jest gotowa technicznie do odbioru. Kolejna faza 5 wydziela Elysia 2 +
Better Auth i uruchamia sieciowy kontrakt JWT/JWKS. Branch fazy 4 zawiera bazę
fazy 3; po jej squash merge należy przenieść tylko commity fazy 4 na nowe main.
