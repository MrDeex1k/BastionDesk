# Faza 4 — trwałe zadania i obserwowalność

Branch `feat/stage4-implement` powstał z `feat/stage3-implement` przed jego merge.
Etapy kończymy osobnymi commitami.

| Etap | Zakres | Status |
| --- | --- | --- |
| 4.1 | Discovery i wybór topologii | Gotowe |
| 4.2 | Kontrakt, routing, retry i DLQ | Gotowe |
| 4.3 | Outbox/inbox i trwała deduplikacja | Plan |
| 4.4 | Worker klasyfikacji LLM | Plan |
| 4.5 | Telemetria, awarie i runbook | Plan |

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
