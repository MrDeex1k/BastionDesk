# Obsługa trwałych zadań

## Uruchomienie

Zaktualizuj `.env` o `RABBITMQ_USER` i unikalne `RABBITMQ_PASSWORD` z alfabetu
bezpiecznego w URL (np. losowy hex). Nowe certyfikaty developerskie obejmują
`rabbitmq`; nie regeneruj certyfikatów istniejącej instalacji bez zaplanowanej
rotacji. Serwer AMQPS wymaga `tls.crt` i `tls.key` z SAN `rabbitmq`, podpisanych
przez CA instalacji. Prywatny klucz musi być czytelny przez UID RabbitMQ
w danym obrazie, z uprawnieniami 0600. Entrypoint Compose kopiuje klucz z
montowania tylko do odczytu i nadaje kopii właściciela `rabbitmq` przed
obniżeniem uprawnień. Nie wymaga zmiany właściciela plików na hoście.

Przed startem backendu i workera wykonaj `db:migrate:plan` oraz
`db:migrate:apply` osobnym połączeniem operatora według
[instrukcji migracji](../database/migrations.md). Bieżący Core wymaga 0001 i 0002.
Następnie `docker compose up -d --build`. Worker używa tego samego obrazu
backendu, ale uruchamia `src/messaging/main.ts`; port 3334 jest tylko wewnętrzną
sondą gotowości. Żaden port RabbitMQ nie jest publikowany na hoście.

AMQPS weryfikuje serwer przez CA; użytkownik/hasło uwierzytelnia klienta.
Wdrożenie referencyjne ma jeden zaufany worker, jedno vhost i wspólnego klienta
relay/consumer. Rozdzielenie uprawnień i wielowęzłowy broker to osobna zmiana
operacyjna. Sekretów nie należy drukować ani umieszczać w adresach poleceń shell.
Zmiana `RABBITMQ_DEFAULT_PASS` nie zmienia hasła istniejącego wolumenu RabbitMQ;
rotację użytkownika wykonaj narzędziami brokera i zaktualizuj konfigurację klienta.

## Monitoring

Włącz eksport do własnego kolektora przez `OTEL_ENABLED=true` i
`OTEL_EXPORTER_OTLP_ENDPOINT`. Po restarcie backendu/workera dostępne są spany
`http.request`, `messaging.publish`, `incident.classify` w jednym trace oraz:

- `jobs.backlog{state}` — pending, running i dead, odczytane z bazy;
- `jobs.lag{state}` — wiek najstarszego zadania w sekundach;
- `jobs.processed{outcome}` — completed, retry, dead, duplicate, stale, storage_error;
- `jobs.duration{outcome}` — czas próby workera;
- `http.server.duration` — czas obsługi HTTP.

Nie dodajemy treści incydentów, dokumentów, tokenów ani identyfikatorów tenantów
do etykiet metryk. Traceparent jest informacją diagnostyczną, nie tożsamością.
Countery są lokalne dla procesu; backlog/DLQ są odtwarzane z PostgreSQL.
Przykładowe alarmy: rosnący backlog/lag, `dead > 0`, wzrost retry/storage_error,
niezdrowy worker. Progi czasu należy dostroić do realnego modelu i obciążenia.

Opcjonalny lokalny kolektor do diagnostyki:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
docker compose -f docker-compose.yml -f docker-compose.observability.yml logs otel-collector
```

Ten kolektor wypisuje OTLP do logu i nie zapewnia archiwum ani UI. W produkcji
należy wskazać właściwy odbiornik OTLP z retencją, kontrolą dostępu i TLS zgodnym
z instalacją. Niedostępność eksportera nie zatrzymuje transakcji domenowych.

## Diagnostyka i replay

Najpierw usuń przyczynę błędu (LLM, TLS, DB, broker). CLI jest dostępne wyłącznie
dla zaufanego operatora mającego dostęp do kontenera i bazy, nie przez publiczne API.

```bash
docker compose exec backend bun src/messaging/cli.ts list ORGANIZATION_ID
docker compose exec backend bun src/messaging/cli.ts replay ORGANIZATION_ID JOB_UUID
```

Lista zwraca `jobs` (do 100 rekordów) i `nextCursor`. Kolejną stronę pobierz
przez `list ORGANIZATION_ID active NEXT_CURSOR`; filtr `active` można zastąpić
`pending`, `running` lub `dead`. Powtarzaj z tym samym filtrem do `nextCursor: null`.
Porządek jest według UUID; lista odzwierciedla aktualny stan, nie snapshot.
Przy równoległych zmianach powtórz przegląd od początku.
Replay dotyczy tylko `dead` w wskazanej organizacji, zeruje budżet czterech prób
i zapisuje audyt stałej tożsamości serwisowej `job-operator` w tej samej
transakcji. CLI nie uwierzytelnia indywidualnej osoby i nie przyjmuje jej ID. Nie używaj purgowania kolejki
jako zamiennika replay. Wiadomości niezgodne ze schematem w kolejce DLQ trzeba
zbadać osobno; nie istnieje dla nich zaufany wpis `core_jobs` i CLI ich nie wznawia.

## Awarie i gwarancje

Po wyłączeniu RabbitMQ incydenty i zadania nadal są zapisywane atomowo.
Relay po odzyskaniu połączenia publikuje zaległe zadania. Utrata potwierdzenia
publikacji lub ACK może dać duplikat, który zostaje pominięty przez stan zadania.
Po śmierci workera dzierżawa wygasa po 120 s; relay ponawia w ciągu kolejnych
30 s. Przekroczenie czterech dzierżaw kończy zadanie jako `dead`.

Wywołanie zewnętrznego LLM może się powtórzyć przy awarii między odpowiedzią
modelu a COMMIT. Pojedynczy efekt obejmuje kategorię, audyt i ukończenie zadania
w PostgreSQL; nie obiecujemy pojedynczego naliczenia kosztu zewnętrznej usługi.
Aktualny timeout RPC ma limit 90 s. Zwiększenie czasu wymaga zmiany dzierżawy.

Backup obejmuje `core_jobs`, `core_audit`, receipts i historię migracji.
Po restore uruchom `plan`, a następnie worker. Wygasłe dzierżawy zostaną odzyskane.
Przy braku kopii brokera relay odtwarza nieukończone zadania z bazy. Trwałym
źródłem DLQ jest PostgreSQL; brokerowa kopia DLQ może wymagać ręcznej inspekcji.
Nie usuwaj ukończonych zadań/receipts bez polityki retencji i oceny ponowień.

Jednowęzłowy RabbitMQ Compose nie daje HA po utracie hosta. PostgreSQL i S3
nadal wymagają własnych kopii. Sprzątanie osieroconych uploadów nie jest
zaimplementowane w tej fazie i wymaga osobnego procesu z kontrolą referencji.
