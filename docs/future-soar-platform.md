# BastionDesk — plan rozwoju do lokalnej platformy SOAR dla MSP

## Status dokumentu

Ten dokument opisuje kierunek rozwoju po wydaniu BastionDesk `1.0.3`. Łączy:

- aktualny punkt wyjścia potwierdzony przez kod i dokumentację;
- docelowe możliwości produktu;
- kolejność faz i zależności między nimi;
- kryteria ukończenia etapów;
- wymagania dotyczące badań, bezpieczeństwa i integracji.

Nie jest to instrukcja instalacji bibliotek ani niezmienny wybór wszystkich
technologii. Dokument rozróżnia jednak docelowy kierunek granic backendu od
szczegółów implementacyjnych, które nadal wymagają ADR, discovery i spike'u.
Przed implementacją każdej integracji trzeba potwierdzić aktualnie wspierany
sposób komunikacji, wersje, ograniczenia i model bezpieczeństwa.

Dokument jest roadmapą produktu, planem pracy magisterskiej i punktem
odniesienia dla przyszłych decyzji architektonicznych.

## Stan implementacji — 21 listopada 2026

Stan ustalono przez przegląd kodu i konfiguracji repozytorium. Wyniki testów
w dokumentach faz są historycznymi zapisami konkretnych przebiegów, nie wynikiem
ponownego uruchomienia podczas tej aktualizacji. Wersja manifestów nadal wynosi
`1.0.3`; implementacja faz nie oznacza wydania BastionDesk `2.0`.

| Faza | Stan w repozytorium | Dowód / pozostała praca |
| --- | --- | --- |
| 0 — baseline | Zakończona, historyczna bramka GO | [Pomiary i 41 scenariuszy P0](baseline/1.0.3-measurements.md). |
| 1 — UI i E2E | Zaimplementowana, pierwszy zielony przebieg CI zapisany | [Kontrakt testowy](testing/phase-1-ui-e2e.md); workflowy GitHub Actions usunięto 22 września 2026, kontrole uruchamiamy lokalnie. |
| 2 — fundamenty | Odebrana 23 września 2026 | [Migracje i kontrakty](backend/phase-2-foundations.md), używane przez Core. |
| 3 — Core | Zaimplementowana; raport etapu zachowuje status „do odbioru użytkownika” | [Realizacja](backend/phase-3-core.md); aktualizacja dokumentacji nie zastępuje formalnego odbioru. |
| 4 — messaging | Zaimplementowana; raport zachowuje status „do odbioru” | [Realizacja](backend/phase-4-messaging.md), PostgreSQL outbox/inbox, RabbitMQ, worker LLM, retry/DLQ i OTLP. |
| 5 — auth/gateway | Zaimplementowana, odbiór techniczny zapisany 23 września 2026 | [Runbook](backend/phase-5-identity.md), osobny auth, JWT/JWKS i mTLS. |
| 6 — Wazuh | Odczyt alertów z Indexera zaimplementowany i sprawdzony w laboratorium | [Specyfikacja i wyniki](integrations/wazuh-stage-6-spec.md). WAZ-04 zamknięto po teście E2E na istniejącym alercie agenta Ubuntu `001`. |
| 7 — IOC, Threat Intelligence i artefakty | Lokalna YARA i integracje TI przeszły testy w kopii roboczej brancha. Pełny odbiór otwarty. | [Wyniki weryfikacji](#wyniki-weryfikacji-fazy-7). Test AbuseIPDB na żywo odłożony do dostarczenia klucza. Ponowne użycie wyników Wazuh pozostaje otwarte. |
| 8–12 — funkcje SOAR i wydanie | Planowane | Korelacja, playbooki, reakcja, rozszerzony LLM i badania. |

Bieżące ograniczenia obejmują brak lokalnego modelu assetów i IOC oraz silnika
playbooków. Klasyfikator
zwraca wyłącznie kategorię oraz nazwę modelu, a audyt operacji nie jest jeszcze
dziennikiem całej analizy. Redis, Prometheus i Grafana nie są częścią podstawowego
Compose. Retencja receipts/jobów, sprzątanie osieroconych obiektów S3 oraz HA
pozostają otwarte. Procedury migracji istnieją, ale nie stanowią deklaracji
obsługi upgrade z dowolnej historycznej instalacji.

## Cel produktu

BastionDesk ma rozwinąć się z systemu ręcznego zgłaszania i obsługi incydentów
w lokalnie wdrażalną platformę SOAR/SIRP dla małych i średnich organizacji.

Docelowy system powinien łączyć:

- ręczne zgłoszenia pracowników;
- alerty i dane endpointowe;
- analizę IOC i artefaktów;
- Threat Intelligence;
- deterministyczną korelację i scoring ryzyka;
- wersjonowane playbooki;
- reakcję typu human-in-the-loop;
- opcjonalną, kontrolowaną automatyzację;
- modele AI jako warstwę pomocniczą, z inferencją lokalną lub przez API;
- pełny audyt i obserwowalność procesu.

Określenie „SOAR-lite” jest właściwe dla zakresu pracy magisterskiej. Produkt
nie ma od razu odtwarzać całego zakresu platform klasy enterprise.

## Proponowany temat pracy magisterskiej

> Projekt i implementacja lokalnie wdrażalnej platformy SOAR dla małych i
> średnich przedsiębiorstw objętych dyrektywą NIS2

Alternatywnie:

> Hybrydowy system zarządzania incydentami cyberbezpieczeństwa łączący
> zgłoszenia użytkowników z automatyczną detekcją, wzbogacaniem danych
> telemetrycznych i kontrolowaną reakcją

## Historyczny punkt wyjścia: BastionDesk 1.0.3

Ta sekcja opisuje baseline sprzed faz 0–5. Wymienione niżej braki migracji,
brokera i wydzielenia auth dotyczą tamtego stanu. Bieżący stan znajduje się
w tabeli realizacji powyżej.

### Gotowe możliwości produktowe

- rejestracja i logowanie email/hasło;
- weryfikacja emaila, reset i zmiana hasła;
- PassKeys/WebAuthn;
- organizacje i role `pracownik`, `analityk`, `admin`;
- zgłaszanie incydentów z opisem, screenshotem i załącznikiem;
- przypisanie incydentu, notatki, statusy, raport i sprawozdanie;
- administracyjny widok incydentów i analityka;
- lokalna klasyfikacja do `Czerwony`, `Żółty` lub `Zielony`;
- pliki w S3-compatible storage i backupy PostgreSQL.

### Gotowe fundamenty techniczne

- React 19, TypeScript, Tailwind CSS v4, Base UI i TanStack Router;
- Express 5 uruchamiany przez Bun oraz Better Auth;
- PostgreSQL 18, PgBouncer i MinIO;
- FastAPI, gRPC i lokalny model Gemma 3 1B;
- NGINX jako jeden publiczny entrypoint;
- Docker Compose jako wspierany model wdrożenia;
- TLS/mTLS dla komunikacji wewnętrznej tam, gdzie jest wymagane;
- Oxc, TurboRepo, jeden rootowy `bun.lock` i kontrola wieku zależności;
- walidowane administracyjne endpointy `QUERY`;
- podstawowe testy backendu, typecheck, lint i formatowanie.

### Ograniczenia punktu wyjścia

- brak oficjalnej migracji istniejących instalacji; obecny model to
  `fresh install only`;
- routing domenowy, auth i część integracji są skupione w jednym backendzie;
- brak trwałego modelu alertów, assetów, IOC, enrichmentu, skanów, scoringu,
  playbooków i akcji;
- brak brokera zdarzeń, retry/DLQ i formalnej idempotencji workerów;
- LLM realizuje tylko prostą klasyfikację;
- audyt nie obejmuje pełnego łańcucha decyzji i działań;
- przed nową wersją trzeba zamknąć znane niespójności frontend–backend i
  zabezpieczyć bieżące przepływy testami regresyjnymi.

## Wdrożona architektura backendu

```text
React -> NGINX :8080 (host :4567)
            -> /api oraz /api/* -> auth-service :3340 (Elysia 2 + Better Auth)
                                   ├── auth, sesje, CSRF, organizacje i role
                                   └── JWT przez mTLS -> backend :3333
                                                          NestJS Core + Effect
                                                          w procesie Express
backend -> mTLS -> auth-service :3443 (JWKS i świeża tożsamość)
Core -> PostgreSQL: incydent + audyt + receipt + job w jednej transakcji
classifier-worker -> RabbitMQ / PostgreSQL -> LLM przez gRPC/mTLS
```

Gateway rozpoznaje sesję HttpOnly i emituje krótki JWT dla Core. Token Core
pozostaje po stronie serwera; gateway nie przekazuje cookies do Core ani
wewnętrznego JWT do przeglądarki. Core weryfikuje podpis przez cache JWKS i
sprawdza aktualną tożsamość w auth. Kontrakt, rotację i zachowanie przy awarii
opisują [identity-contract](backend/identity-contract.md) i
[runbook fazy 5](backend/phase-5-identity.md).

Better Auth jest właścicielem sesji, haseł, PassKeys, członkostw i kluczy JWT.
Core nie importuje jego instancji. Usługi nadal współdzielą bazę i uprawnienia
PostgreSQL; rozdział procesów nie oznacza odrębnych ról bazodanowych.
OIDC/social login pozostaje planem.

NestJS obsługuje workflow incydentów i pliki przez adaptery oraz use case'y
Effect. Express nadal zapewnia host HTTP, middleware i pozostałe trasy
administracyjne; nie obsługuje już Better Auth. `classifier-worker` jest
osobnym procesem z tego samego obrazu backendu. Redis nie jest wymagany:
trwały stan, dzierżawy, deduplikację i retry przechowuje PostgreSQL.

Nowa domena SOAR będzie rozszerzać istniejące granice. Effect jest standardem
orkiestracji Core i workerów, nie osobnym serwisem. Aktualne wersje określają
manifesty i lockfile; datowane raporty faz opisują wersje z czasu ich realizacji.

## Zasady prowadzenia rozwoju

### 1. Ewolucja zamiast jednorazowego przepisywania

Nowe komponenty przejmują odpowiedzialność stopniowo. BastionDesk `1.0.3`
pozostaje punktem odniesienia, dopóki nowa ścieżka nie osiągnie równoważności
funkcjonalnej, bezpieczeństwa i obserwowalności.

### 2. Najpierw wartość domenowa

Priorytetem są ingest, enrichment, korelacja, scoring, playbooki i bezpieczna
reakcja. Zmiana frameworka, storage lub orkiestratora nie jest samodzielną
wartością badawczą.

### 3. PostgreSQL jest źródłem prawdy

Incydenty, alerty, decyzje, konfiguracja, audyt i wyniki potrzebne do
odtworzenia procesu muszą być trwałe. Redis, kolejki i unlogged tables służą
wyłącznie do danych odtwarzalnych lub transportowych.

### 4. Każda operacja jest identyfikowalna i audytowalna

Zdarzenia, joby, wyniki integracji, decyzje i akcje mają identyfikator, tenant,
źródło, timestamps, wersję kontraktu oraz correlation/trace ID.

### 5. Automatyzacja zaczyna się od `suggest_only`

Najpierw system wyjaśnia rekomendację, następnie może wymagać approval. Dopiero
po udowodnieniu bezpieczeństwa konkretnej akcji można dopuścić automatyczne
wykonanie.

### 6. LLM nie wykonuje akcji

LLM może klasyfikować, streszczać i proponować playbook. Jego wynik przechodzi
walidację schematu oraz polityk deterministycznych.

### 7. Multi-tenancy jest wymaganiem przekrojowym

Każda tabela, kolejka, cache, sekret, metryka i integracja musi mieć określony
model izolacji organizacji. Brak tenant scope blokuje zakończenie fazy.

### 8. System działa w trybie zdegradowanym

Niedostępny LLM, provider TI, Redis lub pojedynczy worker nie może niszczyć
podstawowego workflow. Każdy komponent ma timeout, retry, fallback i możliwość
późniejszego wznowienia.

### 9. Docker Compose pozostaje bazą

Zaawansowana orkiestracja jest rozważana po ustabilizowaniu rdzenia. Lokalny
deployment dla MSP nie może stać się niepotrzebnie trudny.

### 10. Dokumentacja jest częścią definicji ukończenia

Zmiana domeny, API, schematu, zdarzeń, integracji lub operacji nie jest
ukończona bez aktualizacji dokumentacji i właściwej decyzji architektonicznej.

## Standard aktualności dla integracji zewnętrznych

Przed wdrożeniem lub rozszerzeniem integracji z systemem zewnętrznym wykonaj
`integration discovery`. Dotyczy to m.in. Wazuh, Ansible, Threat Intelligence,
lokalnych runtime’ów AI, OIDC/OAuth i STIX/TAXII.

### Obowiązkowy zakres discovery

1. Sprawdzić najnowszą oficjalną dokumentację i wspierane wersje.
2. Ustalić rekomendowany interfejs: API, webhook, kolejka, syslog, agent,
   connector, SDK lub protokół.
3. Sprawdzić uwierzytelnianie, rotację sekretów i wymagane uprawnienia.
4. Sprawdzić format danych, wersjonowanie, paginację, rate limits, timeouty i
   retry.
5. Sprawdzić deprecacje i kompatybilność wsteczną.
6. Ocenić licencję, możliwość użycia komercyjnego i wariant self-hosted.
7. Określić zachowanie przy awarii, backpressure, duplikatach i częściowej
   odpowiedzi.
8. Sprawdzić wymagania TLS, sieciowe, proxy i możliwość pracy bez Internetu.
9. Przygotować mały spike potwierdzający komunikację.
10. Zapisać ADR lub kartę integracji z datą, wersją i linkami do źródeł.

### Minimalna karta integracji

Każda integracja dokumentuje:

- cel, zakres i właściciela domenowego;
- wspierane wersje po obu stronach;
- kierunek komunikacji i kontrakt danych;
- auth, sekrety i tenant scope;
- limity, timeouty, retry i circuit breaker;
- idempotency key oraz deduplikację;
- klasyfikację danych i retencję;
- metryki, logi, trace i alerty;
- scenariusze testowe;
- sposób wyłączenia lub zastąpienia integracji.

### Szczególna zasada dla Wazuh

Etap 6 czyta indeksy alertów przez Wazuh Indexer Search API. Każda organizacja
konfiguruje jedno dedykowane źródło. Adapter zwraca podsumowanie do listy,
a pełny dokument Wazuh udostępnia w szczegółach na żądanie. Integracje
assetów i automatycznej reakcji wymagają osobnego discovery.
[Zakres etapu 6](integrations/wazuh-stage-6-spec.md).

## Docelowe granice systemu

### Frontend operacyjny

Pozostaje aplikacją React. Korzysta z domenowego API i nie komunikuje się
bezpośrednio z RabbitMQ, Redis, Wazuh, Ansible ani providerami TI.

### Gateway tożsamości

Osobny serwis auth oparty na Elysia 2 i Better Auth jest już wdrożony.
Elysia obsługuje warstwę HTTP, a Better Auth pozostaje właścicielem procesów
tożsamości. Serwis odpowiada za:

- logowanie, sesje i PassKeys;
- organizacje i role;
- opcjonalne OIDC/social login w przyszłym rozszerzeniu;
- CSRF, origin validation i rate limiting;
- emisję krótkoterminowych JWT dla core i publikację JWKS;
- przekazanie zweryfikowanej tożsamości do core.

JWT/JWKS jest podstawowym kontraktem auth service–core. Dla przeglądarki
preferowane są HttpOnly cookies; JWT nie może być przechowywany w
`localStorage`. Szczegóły token exchange, CSRF, rotacji kluczy i unieważniania
tokenów opisuje ADR oraz karta integracji auth.

### Core domenowy

NestJS jest wdrożonym frameworkiem modularnego Core. Obecnie obsługuje
incydenty, pliki i audyt; kolejne fazy rozszerzą jego odpowiedzialność o:

- incydenty, alerty i zdarzenia bezpieczeństwa;
- organizacje, assety, IOC i artefakty;
- enrichment, korelację i scoring;
- polityki, playbooki i approval;
- akcje, rollback i audyt;
- API domenowe i publikowanie zdarzeń.

### Workery

Granice logiczne powstają przed granicami procesów. Worker klasyfikacji działa
już poza procesem HTTP. Kolejne workery mogą współdzielić deployable, dopóki
nie wymagają osobnej izolacji lub skalowania. Nowe workflow workerów powinny używać
EffectTS, ale ich stan i retry transportowy pozostają odpowiedzialnością
warstwy jobów/RabbitMQ. Docelowe odpowiedzialności:

- ekstrakcja IOC;
- enrichment TI;
- analiza artefaktów;
- analiza LLM;
- wykonanie playbooka i akcji;
- powiadomienia.

### Warstwa danych i transportu

- PostgreSQL: trwałe źródło prawdy;
- PgBouncer: stabilizacja połączeń;
- RabbitMQ: transport asynchronicznych komend i zdarzeń;
- Redis: opcjonalny odtwarzalny cache po wskazaniu konsumenta; trwała
  deduplikacja i dzierżawy pozostają w PostgreSQL;
- S3-compatible storage: artefakty, dowody, raporty i PCAP;
- OpenTelemetry: wspólny kontekst obserwowalności.

### Kontrakt komunikacji auth service–core

Obowiązuje wdrożony [kontrakt tożsamości](backend/identity-contract.md).
Dalsze funkcje korzystają z obecnego gateway, JWT/JWKS, mTLS i świeżego
sprawdzenia membershipu. Akcje SOAR dodadzą do tej granicy własne polityki,
approval i kontrolę blast radius; LLM nie uzyska uprawnień action runnera.

## Status decyzji technologicznych

| Status | Elementy | Zasada |
| --- | --- | --- |
| Zachować jako baseline | React, TypeScript, Tailwind CSS v4, Base UI, Bun, Oxc, TurboRepo, PostgreSQL, PgBouncer, NGINX, Docker Compose, S3 API, Protobuf/gRPC i mTLS | Nie migrować bez mierzalnego problemu lub wymagania domenowego. |
| Wdrożone fundamenty | wersjonowane migracje, modularny Core, RabbitMQ i opcjonalny eksport OpenTelemetry | Rozszerzać istniejące kontrakty i testy awarii. |
| Planowane narzędzia operacyjne | Redis po wskazaniu konsumenta, Prometheus i Grafana | Wprowadzać dla mierzalnego wymagania; obecnie brak w podstawowym Compose. |
| Wprowadzać domenowo | Wazuh, YARA, Threat Intelligence, SIGMA, playbooki i Ansible/Active Response | Każdy komponent przechodzi integration discovery i dostaje adapter odseparowany od domeny. |
| Wdrożone granice backendu | NestJS Core, Elysia 2 + Better Auth, JWT/JWKS oraz Effect w Core i workerze | Utrzymywać parity API i izolację organizacji. |
| Kandydaci wymagający ADR | Docker Model Runner, llama.cpp i zmiana modelu lokalnego | Benchmark jakości, zasobów i licencji przed wyborem; warstwa SQL pozostaje Bun SQL/pg. |
| Opcjonalne po stabilizacji | OIDC Google/Apple/Microsoft, STIX/TAXII, Defender i kolejni providerzy TI | Dodawać pojedynczo, gdy istnieje konkretny scenariusz produktowy. |
| Odłożone | RustFS, Astro/portal docs, Docker Stack, K3s/MicroK8s, Pulumi, Sentry/Axiom i dodatkowy WAF | Nie mogą blokować rdzenia SOAR ani pracy magisterskiej. |

Obecny SMTP i Nodemailer pozostają wystarczające dla bieżącego produktu.
Kolejka już istnieje; wydzielenie notification workera pozostaje osobnym
rozszerzeniem, jeśli wysyłka będzie wymagała trwałych jobów. Osobne API mailowe
ma sens tylko wtedy, gdy pojawią się webhooki lub
niezależne wymagania skalowania.

## Dalsza ewolucja backendu

Fazy 0–5 dostarczyły baseline, testy zachowania, migracje, Core, messaging
oraz osobny auth. Dalsza praca opiera się na tych implementacjach.
Pozostałe trasy administracyjne i host Express można porządkować modułami,
z zachowaniem kontraktów HTTP. Zastosowanie ExpressAdapter
przez NestJS samo w sobie nie wymaga wymiany transportu.

Wyniki dawnych spike'ów i przebiegów są zapisane w dokumentach faz oraz ADR.
Przed kolejnym wydaniem trzeba powtórzyć właściwe kontrole na aktualnych
zależnościach. [Raport aktualizacji z 19 listopada](development/2026-11-19-dependency-refresh.md)
odnotowuje buildy aplikacji, typecheck backendu i zakres pozostałych kontroli.

## Inspiracje dla własnych funkcji SOAR

Decyzja z 5 listopada 2026: AiSOC jest materiałem referencyjnym do analizy
pomysłów i narzędzi. BastionDesk rozwija własne implementacje w obecnej
architekturze. Plan nie obejmuje wdrażania AiSOC, adaptera do jego API,
scalania projektów ani przejmowania jego kodu lub bibliotek reguł.

Faza 6 potwierdziła odczyt alertów z Indexera na żądanie. Wazuh przechowuje
dokumenty i zarządza ich retencją. Testy odbioru potwierdziły ścieżkę od
istniejącego alertu do widoku i pełnego JSON-u oraz izolację organizacji.
[Wyniki fazy 6](integrations/wazuh-stage-6-spec.md#kryteria-odbioru).

| Obszar | Własna realizacja / kryterium | Faza |
| --- | --- | --- |
| Dziennik analizy i decyzji | Powiązania z dowodami, wersja reguły/modelu, czas analizy, wynik, uzasadnienie i korekta analityka. Ponowna analiza dopisuje wynik, zachowując poprzedni. | Kontrakt 7–8, użycie przez LLM 11 |
| Trwałe approval | Definicje i stan wykonania playbooków w PostgreSQL; wersja playbooka, krok, kontekst, decyzja, termin wygaśnięcia i idempotentne wznowienie po restarcie. | 9 |
| Wynik reakcji | Osobne stany rekomendacji, podglądu, oczekiwania, odmowy, wykonania i weryfikacji skutku; testy awarii na granicy z wykonawcą. | 9–10 |
| Oparcie AI w dowodach | Walidowany wynik zawiera odwołania do dostępnych dowodów; niepoparte twierdzenia trafiają do oceny analityka. Obecność IOC w wejściu nie dowodzi poprawności całej odpowiedzi. | 11 |
| Eksport dowodów | Wersjonowany format, deterministyczna serializacja, kontrola integralności, tenant scope i redakcja danych. Hash/podpis nie zastępuje oceny prawdziwości dowodów. | 12, po ustabilizowaniu dziennika |

Punkty odniesienia z przeglądu AiSOC:
[dziennik i pakiety dowodowe](https://github.com/beenuar/AiSOC/blob/main/docs/architecture/evidence-bundles.md),
[pauza playbooka](https://github.com/beenuar/AiSOC/blob/main/services/agents/app/playbook/pause.py),
[sprawdzanie oparcia odpowiedzi w dowodach](https://github.com/beenuar/AiSOC/blob/main/services/agents/app/confidence/groundedness.py),
[test całego przepływu](https://github.com/beenuar/AiSOC/blob/main/tests/e2e/golden_pipeline/run_golden_pipeline.py).
Linki do `main` służą jako materiał porównawczy, nie zamrożony kontrakt.

Każde dodatkowe narzędzie przechodzi nasze discovery, ocenę licencji i pomiar
kosztu wdrożenia. Samo użycie narzędzia przez AiSOC nie uzasadnia dodania go do
BastionDesk. Zachowujemy PostgreSQL, RabbitMQ i Compose jako bieżące fundamenty.

## Docelowy przepływ domenowy

```text
zgłoszenie pracownika / odczyt alertu z Wazuh
  -> walidacja i ustalenie pochodzenia
  -> normalizacja security event
  -> powiązanie z tenantem i assetem
  -> ekstrakcja IOC i artefaktów
  -> enrichment i analiza
  -> korelacja
  -> risk/confidence score
  -> polityka i playbook
  -> sugestia / approval / wykonanie
  -> weryfikacja skutku
  -> rollback albo zamknięcie
  -> raport i metryki badawcze
```

## Model automatyzacji

| Tryb | Zachowanie |
| --- | --- |
| `suggest_only` | System przedstawia rekomendację z uzasadnieniem. |
| `human_approval` | System przygotowuje akcję i czeka na zatwierdzenie. |
| `auto_execute` | System wykonuje allowlistowane akcje po spełnieniu polityk. |
| `auto_execute_with_rollback` | System wykonuje akcję i monitoruje warunki cofnięcia. |

Każda akcja wysokiego ryzyka wymaga:

- dry-run lub preflight;
- jawnego poziomu ryzyka;
- severity i confidence threshold;
- reguł dla assetów krytycznych;
- allowlisty, denylisty i ograniczenia blast radius;
- TTL dla akcji czasowych;
- procedury rollback;
- pełnego audytu wejścia, decyzji, approval i wyniku.

## Plan implementacji

Kroki faz 0–6 dokumentują zakres wdrożony w repozytorium i stan odbiorów.
Fazy 7–12 opisują plan dalszej pracy.

Fazy są uporządkowane według zależności. Spike z późniejszej fazy może rozpocząć
się wcześniej, ale nie powinien zmieniać produkcyjnej architektury bez
zakończonego discovery i ADR.

## Faza 0 — wiarygodny baseline 1.0.3

### Cel

Zamknąć obecną wersję jako działający, mierzalny punkt odniesienia.

### Kroki

1. Usunąć znane rozbieżności frontend–backend–dokumentacja.
2. Opisać krytyczne przepływy: auth, organizacja, zgłoszenie, przypisanie,
   raport, pliki, klasyfikacja i backup/restore.
3. Dodać regresję dla krytycznych kontraktów i izolacji organizacji.
4. Zweryfikować backup i odtworzenie na czystym środowisku.
5. Zmierzyć bieżące czasy i zużycie zasobów.
6. Zinwentaryzować API, tabele, pliki, sekrety i kontrakty gRPC.
7. Przygotować stałe scenariusze testowe dla kolejnych checkpointów.

### Kryterium ukończenia

Stack uruchamia się powtarzalnie, krytyczne przepływy mają regresję, a nową
implementację można porównać z `1.0.3`.

### Dokumentacja

- aktualne docs stanu bieżącego;
- katalog znanych ograniczeń;
- macierz przepływów i testów;
- baseline wydajności i zasobów.

### Status realizacji

- Krok 1/5 — inwentaryzacja stanu `1.0.3`: ukończony. Zakres usług,
  krytycznych przepływów, API, tabel, plików, sekretów i gRPC znajduje się w
  [`docs/baseline/1.0.3-inventory.md`](./baseline/1.0.3-inventory.md).
- Krok 2/5 — stałe scenariusze regresji: ukończony. Dane fixture, asercje
  tenant scope, priorytety i pakiety checkpointów znajdują się w
  [`docs/baseline/1.0.3-regression-scenarios.md`](./baseline/1.0.3-regression-scenarios.md).
- Krok 3/5 — automatyzacja kontraktów i izolacji organizacji: ukończony.
  Pakiety `baseline-contract`, `baseline-tenant` i `baseline-workflow`, smoke
  test Compose oraz wynik pierwszego przebiegu opisuje
  [`docs/baseline/1.0.3-automation.md`](./baseline/1.0.3-automation.md). Zamknięto
  trzy luki `G0` wykryte w kroku 2 oraz dwie rozbieżności startu stacku.
- Krok 4/5 — backup i restore na czystym środowisku: ukończony. Powtarzalny
  test porównuje wszystkie tabele, relacje tenantów i zachowanie healthchecku;
  procedura i pierwszy wynik znajdują się w
  [`docs/baseline/1.0.3-restore.md`](./baseline/1.0.3-restore.md).
- Krok 5/5 — pomiary i ocena zamknięcia baseline'u: wykonany. Powtarzalny
  pomiar startu, opóźnień, zasobów i obrazów oraz końcowy wynik bramki znajdują
  się w [`docs/baseline/1.0.3-measurements.md`](./baseline/1.0.3-measurements.md).
  Finalna bramka obejmuje wszystkie 41 scenariuszy `P0`, w tym pełny przepływ
  API dwóch organizacji, storage, audyt, analitykę, degradację LLM oraz osobny
  backend nad odtworzoną bazą. Wynik to `GO`: `41 PASS`, `0 PARTIAL`,
  `0 NOT_COVERED`, `0 FAIL`. Faza 0 jest zakończona; jej wyniki pozostają
  historycznym punktem odniesienia dla kolejnych etapów.

## Faza 1 — testy UI i E2E jako kontrakt migracji

Implementacja i macierz scenariuszy: [kontrakt UI i E2E](./testing/phase-1-ui-e2e.md).
Faza została wdrożona, a pierwszy zielony przebieg GitHub Actions jest zapisany
w kontrakcie. Workflowy usunięto 22 września 2026; testy pozostają dostępne
lokalnie. Rozszerzenia o JWT/mTLS i WebAuthn oraz datowany wynik macierzy
przeglądarek opisuje [faza 5](backend/phase-5-identity.md).

### Cel

Zabezpieczyć zachowanie bieżącego BastionDesk `1.0.3` z perspektywy użytkownika
przed rozpoczęciem migracji oraz utworzyć zestaw testów utrzymywany aż do
pełnego przejścia na BastionDesk `2.0`.

### Kroki

1. Skonfigurować testy komponentowe React przy użyciu `bun:test`, React Testing
   Library, `user-event`, matcherów `jest-dom` i lekkiego środowiska DOM.
2. Przygotować wspólny renderer z providerami aplikacji oraz deterministyczne
   mocki granic sieciowych, czasu i stanu uwierzytelnienia.
3. Pokryć komponentowo krytyczne formularze, walidację, stany błędów,
   uprawnienia oraz przełączanie organizacji bez testowania szczegółów
   implementacyjnych komponentów.
4. Skonfigurować Flashwright dla Chromium, Firefox i WebKit; Chromium pozostaje
   szybką bramką zmian, a pełna macierz przeglądarek działa na checkpointach.
5. Dodać deterministyczne przygotowanie danych i sesji przez API z osobnym
   tenantem dla każdego scenariusza oraz sprzątaniem stanu testowego.
6. Zautomatyzować w prawdziwej przeglądarce krytyczne przepływy `1.0.3`: auth,
   organizację i role, zgłoszenie oraz obsługę incydentu, pliki i raport.
7. Używać selektorów opartych na rolach, etykietach i treści widocznej dla
   użytkownika; `data-testid` stosować wyłącznie jako udokumentowany wyjątek.
8. Włączyć testy komponentowe i E2E do Turbo oraz CI, zapisując raport HTML,
   trace i zrzuty ekranu dla nieudanych przebiegów.
9. Traktować scenariusze jako kontrakt parity: podczas migracji uruchamiać ten
   sam zestaw przeciw ścieżce legacy i nowej, rozszerzając go o nowe funkcje
   bez przepisywania stabilnych oczekiwań użytkownika.

### Rola narzędzi

| Narzędzie | Odpowiedzialność |
| --- | --- |
| `bun:test` | Runner testów, lifecycle, mocki oraz podstawowe API `expect`; nie jest zastępowany przez Jest. |
| `happy-dom` | Lekka implementacja DOM dla testów komponentowych uruchamianych poza przeglądarką. |
| React Testing Library | Renderowanie komponentów i zapytania odzwierciedlające sposób korzystania z UI. |
| `user-event` | Symulacja pełnych interakcji użytkownika, takich jak wpisywanie, klikanie i nawigacja klawiaturą. |
| `jest-dom` | Wyłącznie dodatkowe matchery DOM dla `expect` z `bun:test`, np. `toBeVisible()`; pakiet nie wprowadza runnera Jest. |
| Flashwright | Testy E2E kompletnej aplikacji w prawdziwych przeglądarkach. |

### Kryterium ukończenia

Testy komponentowe przechodzą lokalnie i w CI, krytyczne przepływy `1.0.3`
przechodzą w Chromium przy każdej zmianie, a pierwszy pełny przebieg Chromium,
Firefox i WebKit przechodzi przed rozpoczęciem fazy 2. Zestaw jest niezależny
od implementacji backendu i stanowi obowiązkową bramkę parity aż do wydania
BastionDesk `2.0`.

### Dokumentacja

- macierz komponentów, przepływów i pokrycia;
- konwencje selektorów, danych, sesji i izolacji tenantów;
- instrukcja uruchomienia lokalnego, w Compose i CI;
- polityka artefaktów diagnostycznych oraz obsługi testów niestabilnych.

## Faza 2 — migracje i kontrakty domenowe

Fundamenty i prototypy odebrane przez właściciela w punkcie 2.5 dnia
23 września 2026. Kontrakty zostały następnie użyte przez moduł Core
w fazie 3. Paczki pracy, wdrożone kontrakty i zakres odbioru: [plan fazy 2](backend/phase-2-foundations.md).

### Cel

Przygotować rozwój bez utraty danych i bez big-bang rewrite.

### Kroki

1. Zdefiniować bounded contexts i właścicieli modeli.
2. Utworzyć ADR dla NestJS Core, serwisu Elysia 2 + Better Auth, workerów,
   EffectTS i komunikacji wewnętrznej.
3. Wprowadzić wersjonowane migracje i upgrade z obecnego schematu.
4. Przygotować wspólne kontrakty typów, błędów, paginacji i event envelope.
5. Zdefiniować tenant scope, correlation ID, causation ID i idempotency key.
6. Zaprojektować rozszerzony audyt i provenance danych.
7. Zdefiniować kontrakt JWT/JWKS: issuer, audience, claims, algorytm, `kid`,
   cache JWKS i rotację kluczy.
8. Wybrać ORM/query layer po spike'u; Drizzle pozostaje kandydatem.
9. Określić kompatybilność starego i nowego API.

### Kryterium ukończenia

Migrację można wykonać kontrolowanie, a nowy moduł korzysta ze wspólnych
kontraktów bez kopiowania modeli legacy.

### Dokumentacja

- ADR-y i model domenowy;
- polityka migracji;
- wersjonowanie API, eventów i błędów.

## Faza 3 — modularny core incydentów

Etapy 3.1–3.5 są zaimplementowane. Raport z 23 września 2026 zachowuje status
„gotowe technicznie, do odbioru”. Core NestJS/Effect działa we wspólnym procesie
z Expressem; osobny auth został następnie wdrożony w fazie 5.
[Realizacja i weryfikacja](backend/phase-3-core.md).

### Cel

Oddzielić logikę domenową od HTTP i przygotować core na alerty.

### Kroki

1. Zbudować moduły organizacji, incydentów, plików i audytu.
2. Uruchomić NestJS Core obok istniejącego Expressa i przenieść pierwszy moduł
   przez adapter lub wersjonowane API.
3. Przenieść statusy, ownership i RBAC do testowalnej domeny.
4. Wykorzystać EffectTS w use case'ach i portach nowego core; nie mieszać
   runtime'u Effect z kontrolerami HTTP bardziej niż to konieczne.
5. Zachować kompatybilność frontendu przez adapter lub wersjonowane API.
6. Rozszerzyć audyt o zmiany danych i decyzje systemowe.
7. Wprowadzić model komendy i zdarzenia niezależny od brokera.
8. Usuwać legacy dopiero po osiągnięciu parity.

### Kryterium ukończenia

Obecny workflow działa przez modularny core, zachowuje dane i uprawnienia, a
testy porównawcze starej i nowej ścieżki przechodzą.

## Faza 4 — kolejki, niezawodność i obserwowalność

Status 23 września 2026: etapy 4.1–4.5 gotowe technicznie do odbioru.
PostgreSQL outbox/inbox, RabbitMQ, worker LLM, retry/DLQ, audytowany replay
i OTLP zweryfikowano na izolowanym stosie. Redis nie jest wdrażany bez
konsumenta odtwarzalnego cache. [Realizacja](backend/phase-4-messaging.md).

### Cel

Stworzyć wspólną podstawę dla workerów i pomiarów.

### Kroki

1. Wykonać discovery RabbitMQ i Redis.
2. Zdefiniować routing, retry, DLQ i limit prób.
3. Wprowadzić transactional outbox/inbox lub mechanizm równoważny.
4. Zapewnić idempotencję i deduplikację handlerów.
5. Użyć Redis wyłącznie dla odtwarzalnego stanu.
6. Propagować OpenTelemetry przez HTTP, kolejki i workery.
7. Dodać metryki lag, retry, DLQ i czasu jobów.
8. Przenieść prosty proces, np. powiadomienia, jako wzorzec workera.

### Kryterium ukończenia

Restart i ponowne dostarczenie nie powodują utraty danych ani podwójnego skutku,
a job jest widoczny w trace i metrykach.

### Dokumentacja

- topologia messagingu;
- standard handlera i polityka retry/DLQ;
- runbook replay oraz zablokowanej kolejki.

## Faza 5 — tożsamość i gateway

Implementacja 5.1–5.5 jest w repozytorium; odbiór techniczny zapisano
23 września 2026. [Zakres, wyniki i runbook](backend/phase-5-identity.md).

### Cel

Wydzielić auth do osobnego serwisu Elysia 2 + Better Auth i ustanowić
JWT/JWKS jako kontrakt zaufania dla NestJS Core.

### Kroki

1. Zweryfikować aktualne Better Auth, Elysia 2, WebAuthn i providerów OIDC.
2. Uruchomić auth service równolegle z obecnym Express backendem.
3. Przenieść sesje, organizacje, role i PassKeys bez utraty kompatybilności
   użytkowników.
4. Skonfigurować jeden issuer i kanoniczny JWKS z kluczami asymetrycznymi.
5. Zdefiniować minimalne claims, audience core, krótkie TTL, `kid`, cache JWKS,
   rotację oraz okres przejściowy dla poprzednich kluczy.
6. Dodać verifier JWT do NestJS Core; core nie importuje Better Auth i nie
   posiada klucza prywatnego.
7. Zachować HttpOnly cookies, CSRF, CORS, origin validation, rate limiting i
   audyt.
8. Dopiero po przełączeniu ruchu usunąć auth z Expressa.
9. Social login dodać po discovery providera i reguł membership.

### Kryterium ukończenia

Konta, organizacje, role i PassKeys działają po migracji, NestJS Core akceptuje
wyłącznie zweryfikowaną tożsamość z JWT/JWKS, a Express nie obsługuje już
odpowiedzialności auth.

## Faza 6 — odczyt alertów Wazuh

### Zakres

Administrator podłącza jedno dedykowane źródło Wazuh na organizację. Backend
sprawdza TLS i uprawnienia do wyszukiwania. Analityk i administrator mogą
przeglądać historię, filtrować poziomy, otwierać szczegóły i pobierać pełny JSON.
Dokumenty i retencja pozostają w Wazuh. BastionDesk zapisuje konfigurację
i zaszyfrowane hasło. Agent jest identyfikowany nazwą i ID z Wazuh.

### Odbiór

Test przeglądarkowy potwierdził zgodność JSON-u istniejącego alertu agenta
Ubuntu `001` z dokumentem Indexera oraz jeden wiersz po dwóch odświeżeniach.
Kryterium WAZ-04 jest zamknięte. [Kryteria i wyniki](integrations/wazuh-stage-6-spec.md#kryteria-odbioru).

### Dokumentacja

- [Konfiguracja i diagnostyka](integrations/wazuh-discovery.md#wdrożenie-etapu-6).
- [Kontrakt HTTP](backend/api.md#wazuh-api).
- [Migracja i odtwarzanie konfiguracji](database/migrations.md#rozszerzenie-etapu-6).

## Faza 7 — IOC, Threat Intelligence i artefakty

### Cel

Automatycznie zbierać dowody i wzbogacać incydenty bez zależności domeny od
jednego providera.

Analiza załączników zaczyna się od [dwóch kroków lokalnego skanowania YARA](integrations/yara-stage-7-attachments-spec.md).
Specyfikacja opisuje kolejność wdrożenia, uprawnienia, pobieranie i kryteria odbioru.

### Podział analizy plików

- **Pliki wykryte na monitorowanych urządzeniach.** Wazuh skanuje pliki za
  pomocą YARA. Sprawdzenie w VirusTotal zależy od włączenia tej integracji
  przez organizację. BastionDesk odczytuje dostępne wyniki z Indexera i pokazuje je przy alercie
  i powiązanym zgłoszeniu. Discovery ustali, jak rozpoznać wynik przypisany
  do danego pliku, również gdy Wazuh rejestruje analizę jako osobny alert.
- **Pliki załączone przez pracowników do zgłoszeń.** BastionDesk uruchamia
  YARA w izolowanym workerze. Przy nowym zgłoszeniu BastionDesk szuka istniejącego
  raportu po SHA-256 w aktywnym dla organizacji VirusTotal lub Hybrid Analysis.
  Treść załącznika pozostaje w BastionDesk.

### Ponowne użycie wyników

Zakończoną analizę można wykorzystać w tej samej organizacji dla identycznego
SHA-256. Dla YARA wymagana jest zgodna wersja zestawu reguł. Dla VirusTotal
raport musi mieścić się w skonfigurowanym okresie ważności i być dopuszczony
przez bieżącą politykę organizacji. Te same warunki obowiązują, gdy wynik
pochodzi z Wazuh i ma zostać użyty dla pliku przesłanego do BastionDesk.
Równoległe przesłania tego samego pliku korzystają ze wspólnego zadania
analizy, jeśli dotyczą tej samej organizacji, metody i wersji konfiguracji.

Wynik powinien wskazywać źródło, SHA-256, czas analizy i wersję reguł, jeśli ma
zastosowanie. Analityk powinien móc odróżnić analizę bez trafień od braku
analizy, braku raportu u providera i błędu analizy.

### Kroki

1. Zdefiniować typy IOC, canonical form i provenance.
2. Zbudować deterministyczny extractor IOC.
3. Dodać hashing, magic bytes i bezpieczny pipeline artefaktów.
4. Wykonać discovery wyników YARA i VirusTotal w Wazuh oraz zaprojektować
   wspólny model reguł i wyników.
5. Uruchomić analizę załączników w izolowanym workerze i ponowne użycie wyników.
6. Zdefiniować provider-neutralny kontrakt enrichmentu.
7. Dodawać providerów pojedynczo, każdy z osobną kartą integracji.
8. Dodać cache TTL, rate limiting, retry i circuit breaker.
9. Szyfrować sekrety per tenant i audytować użycie.
10. Zapisywać źródło, czas pobrania i wpływ wyniku na scoring.

Potencjalni providerzy do ponownej oceny: AbuseIPDB, URLhaus, LevelBlue OTX,
Hybrid Analysis i opcjonalnie VirusTotal.

### Pierwszy dostawca reputacji adresów IP

AbuseIPDB sprawdza publiczne adresy IPv4 i IPv6 znalezione w opisie zgłoszenia.
Nowe zgłoszenie zleca odczyt w tle. Zdalny odczyt
przekazuje jeden adres IP i klucz danej organizacji. Wynik zachowuje źródło,
godzinny okres ważności i ocenę dostawcy. Backend współdzieli równoległe zapytania
o ten sam adres w obrębie organizacji. Limit dostawcy wstrzymuje kolejne zapytania
tej organizacji. Próba jest zapisywana w audycie z identyfikatorem zgłoszenia
i stanem, bez wartości IOC i klucza.

Włączenie wymaga zamontowania w backendzie katalogu sekretów tylko do odczytu
i wskazania go w `ABUSEIPDB_KEYS_DIR`. Każdy plik ma nazwę złożoną z SHA-256
identyfikatora organizacji zapisanego szesnastkowo oraz rozszerzenia `.key`.
Zawartość to klucz API tej organizacji. [Dokumentacja API AbuseIPDB](https://docs.abuseipdb.com/#check-endpoint)

### Wykaz URLhaus

Adres URL znaleziony w opisie nowego zgłoszenia jest sprawdzany w tle.
Backend dopasowuje pełny adres do wykazu `recent.csv`
z ostatnich 30 dni. Do URLhaus wysyła wyłącznie żądanie pobrania wykazu
z kluczem. Wynik wskazuje źródło, czas pobrania i wygaśnięcia wykazu. Brak
wpisu dotyczy zakresu tego wykazu. Wynik operacji trafia do audytu bez
adresu i klucza. [URLhaus Community API](https://urlhaus.abuse.ch/api/)

Włączenie wymaga ustawienia `URLHAUS_KEY_FILE` na ścieżkę do pliku z kluczem.
W Compose należy zamontować sekret tylko w kontenerze `backend`, na przykład
w `/run/secrets/urlhaus-key`, i zapewnić użytkownikowi kontenera prawo do
odczytu. Konfiguracja jest wspólna dla instalacji, ponieważ wykaz jest publiczny.
Żądania użytkowników nadal podlegają uprawnieniom do zgłoszenia w organizacji.

Backend pobiera wykaz na żądanie i współdzieli jedno pobranie między
równoległymi sprawdzeniami. Udany wykaz jest ważny 10 minut. Przy błędzie
kolejna próba jest możliwa po co najmniej 10 minutach, a odpowiedź `429`
może wydłużyć ten odstęp przez `Retry-After`. Cache i odstęp obowiązują w
obrębie procesu. W tej konfiguracji uruchamiać jeden backend na klucz i
zachować odstęp przy ponownym uruchomieniu. Testy automatyczne używają
fikcyjnego wykazu, a sprawdzenie na żywo wymaga jednego odczytu Community API.

### LevelBlue OTX, Hybrid Analysis i VirusTotal

Przy tworzeniu nowego zgłoszenia zapis i zlecenia do aktywnych źródeł odbywają
się w jednej transakcji. Worker backendu wykonuje odczyty poza żądaniem HTTP.
Analityk i administrator widzą przebieg i wyniki przy IOC. W starszych
zgłoszeniach sprawdzenie można zlecić ręcznie.

| Dostawca | Klucze organizacji | Zakres odczytu |
| --- | --- | --- |
| LevelBlue OTX | `OTX_KEYS_DIR` | Publiczne IPv4 i IPv6, domeny oraz MD5, SHA-1 i SHA-256. Pełne adresy URL nadal sprawdza się lokalnie w wykazie URLhaus. Wynik OTX pokazuje liczbę powiązanych wpisów (Pulses). [LevelBlue OTX SDK](https://github.com/AlienVault-OTX/OTX-Python-SDK) |
| Hybrid Analysis | `HYBRID_ANALYSIS_KEYS_DIR` | Odczyt istniejących raportów przez `GET /api/v2/search/hash` z SHA-256. Wynik pokazuje werdykt z zakończonego raportu oraz datę i ocenę, jeśli API je zwróci. [API v2](https://hybrid-analysis.com/docs/api/v2), [Klient Hybrid Analysis](https://github.com/hybrid-analysis/hybrid-analysis-mcp-server/blob/main/src/mcp_hybrid_analysis/server.py#L295) |
| VirusTotal | `VIRUSTOTAL_KEYS_DIR` | Odczyt istniejącego raportu po SHA-256 i prezentacja statystyk silników. [Dokumentacja odczytu raportu](https://docs.virustotal.com/reference/file-info) |

W każdym katalogu klucz ma postać pliku `<SHA-256 identyfikatora organizacji>.key`,
tak jak w AbuseIPDB. W Compose katalog należy udostępnić tylko backendowi i tylko
do odczytu. Dodanie klucza włącza źródło dla danej organizacji. Usunięcie klucza
cofa dostęp także do zapisanych w pamięci wyników. Klucze z Pęku kluczy służą
do testów lokalnych i trafiają na serwer przez magazyn sekretów wdrożenia.

Backend wysyła jedynie kwalifikujący się wskaźnik. Filtr OTX odrzuca prywatne IP
i domeny z zarezerwowanymi lub typowo lokalnymi sufiksami. Włączenie OTX dla
organizacji obejmuje odczyt domen z nowego opisu. Hybrid Analysis i VirusTotal
otrzymują tylko SHA-256. Treść załączników oraz zrzuty pozostają w BastionDesk.
Audyt zawiera dostawcę, organizację, użytkownika i wynik operacji.

Wyniki i terminy ponowienia zapisuje migracja `0006_ioc_enrichment`.
To samo sprawdzenie współdzielą zgłoszenia jednej organizacji. Dla hashy po
zakończonym odczycie, także bez raportu, kolejne sprawdzenie tego samego
wskaźnika u tego samego dostawcy jest możliwe po 24 godzinach. Po błędzie
przycisk ponowienia jest widoczny i aktywuje się po 60 sekundach. `Retry-After`
może wydłużyć przerwę po `429`, a pobrania wykazu URLhaus mają własny odstęp.
Domyślna ochrona darmowych kont ogranicza odczyt do jednego
żądania na 15 sekund i 50 żądań w ruchomym oknie 24 godzin na dostawcę i klucz.
Odpowiedź `429` wstrzymuje dalsze odczyty zgodnie z `Retry-After`. Liczniki i wyniki
są współdzielone przez zadania w obrębie procesu. Na koncie testowym uruchamiać
jeden proces backendu na klucz.
To są limity BastionDesk. Warunki i dostęp konta u dostawcy trzeba uwzględnić
przy odbiorze. Błąd dostawcy nie wpływa na obsługę incydentu ani politykę pobierania.

### Konta testowe i limity dostawców

Konta testowe URLhaus, LevelBlue OTX, Hybrid Analysis i VirusTotal korzystają
z darmowych planów. Klucze deweloperskie są w pęku logowania macOS, pod nazwą
konta `bastiondesk-dev`. We wdrożeniu klucze przekazuje się z magazynu sekretów
do backendu zgodnie z konfiguracją danej integracji.

| Wpis w Pęku kluczy | Zakres testu na żywo |
| --- | --- |
| `BastionDesk AbuseIPDB` (oczekuje na klucz testowy) | Po dostarczeniu klucza skonfigurować `ABUSEIPDB_KEYS_DIR` dla organizacji testowej i sprawdzić odczyt reputacji jednego publicznego adresu IP z kontenera backendu. |
| `BastionDesk URLhaus` | Pobrać feed raz i testować dopasowania lokalnie. Zachować co najmniej 5 minut między pobraniami zrzutów. Community API podlega zasadom fair use, a użycie komercyjne może wymagać płatnego planu. [URLhaus Community API](https://urlhaus.abuse.ch/api/) |
| `BastionDesk LevelBlue OTX` | Sprawdzić odczyt jednego publicznego IOC na koncie testowym. Darmowy dostęp OTX jest przeznaczony do użytku niekomercyjnego. [Warunki OTX](https://www.levelblue.com/legal/otx-eula-terms) |
| `BastionDesk Hybrid Analysis` | Sprawdzić odczyt istniejącego raportu po SHA-256. Przed testem potwierdzić dostępne operacje i limity przyznane kontu. [Dokumentacja API](https://www.hybrid-analysis.com/docs/api/v2) |
| `BastionDesk VirusTotal` | Sprawdzić odczyt istniejącego raportu po SHA-256 w dozwolonym teście niekomercyjnym. Public API ma limit 4 zapytań na minutę i 500 na dobę oraz ograniczenia dotyczące przepływów biznesowych. [Limity i warunki Public API](https://docs.virustotal.com/reference/public-vs-premium-api) |

Testy automatyczne korzystają z danych testowych lub zapisanych odpowiedzi.
Próby na żywo używają publicznych wskaźników kontrolnych i zakresu odczytu.
Po odpowiedzi `429` zakończyć próbę i uwzględnić czas ponowienia podany przez
dostawcę. W diagnostyce URLhaus redagować również ścieżkę wywołania, która może
zawierać `Auth-Key`.

### Wyniki weryfikacji fazy 7

Przebieg z 28 listopada 2026 na branchu `feat/yara-attachment-scanning`:

- **Flashwright** — 40 testów zaliczonych w Chromium, Firefoxie i WebKit.
  W każdej przeglądarce przeszły automatyczny i ręczny skan YARA oraz odczyt
  rzeczywistego alertu agenta `001` z Indexera Wazuh. Dwa pominięcia dotyczą
  scenariusza PassKey wymagającego Chromium.
- **Backend i frontend** — 101 i 29 testów zaliczonych. Przeszły też migracje,
  testy API, PostgreSQL i RabbitMQ. Osobna próba potwierdziła, że MinIO odrzuca
  podpisany adres po upływie jego ważności.
- **Threat Intelligence** — z kontenera backendu potwierdzono odpowiedź URLhaus
  i LevelBlue OTX oraz odczyt raportów Hybrid Analysis i VirusTotal. AbuseIPDB
  przeszło testy automatyczne z odpowiedziami testowymi. Próbę na żywo odłożono
  do dostarczenia klucza testowego.
- **Wazuh** — Indexer działał, a w sprawdzonych indeksach nie znaleziono
  alertów z wynikami YARA ani VirusTotal. Ponowne użycie zgodnego wyniku Wazuh
  dla załącznika pozostaje do wdrożenia i zweryfikowania na kontrolnym alercie.

### Kryterium ukończenia

IOC lub artefakt ma wynik z provenance, a analityk widzi jego aktualność.
Testy odbioru mają potwierdzić izolację organizacji, użycie zgodnego wyniku Wazuh,
jednokrotne wykonanie analizy przy równoległych przesłaniach i odświeżenie
wyniku po zmianie reguł YARA lub upływie ważności raportu VirusTotal. Awaria
providera nie blokuje obsługi incydentu.

## Faza 8 — korelacja i scoring ryzyka

### Cel

Łączyć zgłoszenia, alerty, assety, IOC i wyniki analizy w wyjaśnialny incydent.

### Kroki

1. **Powiązania i pochodzenie danych.** Opisać relacje między zgłoszeniem
   pracownika, alertem Wazuh, zdarzeniem bezpieczeństwa, zasobem i incydentem
   obsługiwanym przez analityka. Zachować bieżące identyfikatory i API zgłoszeń.
   Wskazać, które dane przechowujemy lokalnie jako dowód potrzebny do odtworzenia
   decyzji. Zacząć od referencji do alertu z kluczem organizacja, źródło, indeks
   i ID dokumentu oraz od mapowania agentów w obrębie źródła. Migracja ma
   zachować istniejące zgłoszenia i pozwalać na wiele dowodów w incydencie.

2. **Dane testowe i pierwsza reguła.** Przygotować oznaczone pary zgłoszenie–alert
   dla trafień, pomyłek i przypadków niejednoznacznych. Uwzględnić wspólne IP,
   zmianę adresu, identyczne ID agenta w różnych źródłach, opóźniony alert,
   duplikat i podobne zdarzenia z różnych organizacji. Wybrać pierwszą regułę
   łączącą wiarygodną zgodność zasobu lub IOC z oknem czasu. Zapisać sygnały,
   czas, odwołania do dowodów i wersję reguły przy każdej sugestii.

3. **Korelacja asynchroniczna.** Uruchomić analizę na żądanie dla jednego
   zgłoszenia, a po potwierdzeniu przepływu zlecać ją automatycznie dla nowych
   zgłoszeń. Użyć istniejącego mechanizmu trwałych zadań. Kolejne reguły ocenią
   agent ID, użytkownika, hostname, IP, hash, proces i MITRE ATT&CK, zależnie
   od dostępności tych danych. Deduplikacja ma obejmować organizację, źródło,
   parę dokumentów i wersję reguł. Błąd Indexera ma wstrzymywać kolejną próbę
   korelacji z tego źródła przy zachowaniu obsługi zgłoszenia.

4. **Ocena ryzyka.** Utrzymać trzy odrębne wartości. `severity` opisuje
   ważność zdarzenia i zachowuje ocenę źródłową. `confidence` opisuje siłę
   podstaw do powiązania. `risk score` określa priorytet pracy na podstawie
   potwierdzonych sygnałów, ważności zasobu i dostępnych wyników analizy.
   Wersjonować sposób obliczeń i zapisywać wkład każdego sygnału. Brak wyniku
   providera ma być widoczny jako brak danych. Kalibrować progi na oznaczonych
   przypadkach i zmierzyć precision, recall oraz fałszywe trafienia i pominięcia
   na osobnym zestawie odbiorczym.

5. **Widok analityka i ponowna analiza.** Pokazać w szczegółach incydentu
   sugestie, uzasadnienie, dowody i składowe oceny. Analityk może zaakceptować
   lub odrzucić sugestię, ręcznie połączyć lub rozłączyć dowody oraz podać
   powód korekty. Każda zmiana zapisuje aktora, czas i uzasadnienie. Ponowne
   przeliczenie według nowej wersji reguł zachowuje poprzednią ocenę oraz
   ręczne decyzje.

6. **Odbiór.** Przetestować migrację, izolację organizacji, powtarzalność
   wyników, równoległe zlecenia, opóźnienia i awarie źródeł oraz pełny przepływ
   od zgłoszenia do korekty analityka. Udokumentować zestaw danych, wyniki
   kalibracji i przypadki, które wymagają ręcznej decyzji.

Pierwszy przebieg wykorzysta odczyt alertów Wazuh i IOC dostępne po fazie 7.
Test AbuseIPDB na żywo oraz ponowne użycie wyników YARA i VirusTotal z Wazuh
pozostają osobnymi punktami odbioru fazy 7. Przepływ fazy 8 kończy się decyzją
analityka i oceną ryzyka. Rekomendacje playbooków i aktywna reakcja są objęte
fazami 9 i 10.

### Kryterium ukończenia

Każde powiązanie i score można wyjaśnić oraz odtworzyć dla konkretnej wersji
reguł. Dziennik wiąże wynik z dowodami i zachowuje historię korekt oraz
ponownej analizy. LLM nie jest wymagany.

## Faza 9 — playbooki i human-in-the-loop

### Cel

Przekształcić analizę w wersjonowaną rekomendację działania.

### Kroki

1. Utrzymać SIGMA jako język detekcji, nie workflow.
2. Zdefiniować osobny model playbooka YAML/JSON.
3. Opisać trigger, warunki, kroki, timeouty, kompensacje i rollback.
4. Zbudować policy engine i reguły assetów krytycznych.
5. Rozpocząć wyłącznie od `suggest_only`.
6. Dodać approval z separacją ról, gdzie wymaga tego ryzyko.
7. Dodać dry-run i przewidywany wpływ.
8. Audytować wersję playbooka, wejście, decyzję, approval i rezultat.
9. Przetestować timeout, anulowanie i częściową porażkę.

### Kryterium ukończenia

System wybiera i przedstawia playbook, ale bez approval nie wykonuje akcji
zewnętrznej. Analityk widzi uzasadnienie, zakres i rollback. Definicja i wersja
playbooka oraz stan oczekiwania są trwałe w PostgreSQL. Restart, ponowiona
decyzja, odmowa, wygaśnięcie i anulowanie mają testy; wznowienie nie powtarza
wykonanego kroku. Uprawnienia i polityki są ponownie sprawdzane przed akcją.

## Faza 10 — kontrolowana active response

### Cel

Bezpiecznie wykonać ograniczony zestaw odwracalnych akcji.

### Kroki

1. Wykonać discovery Ansible i Wazuh Active Response.
2. Wybrać pierwszą akcję o małym, odwracalnym zasięgu.
3. Zbudować adapter z minimalnymi uprawnieniami.
4. Dodać preflight, dry-run, timeout, blast radius i idempotency key.
5. Wymagać approval oraz jawnego rollback.
6. Weryfikować skutek niezależnym sygnałem.
7. Testować utratę łączności, częściowe wykonanie i rollback failure.
8. Dopiero po dowodach dopuścić allowlistowane `auto_execute`.
9. Utrzymać denylistę assetów krytycznych i globalny kill switch.

### Kryterium ukończenia

Akcja i rollback przechodzą kontrolowane testy, są audytowane i nie
przekraczają tenant scope ani blast radius.

## Faza 11 — mediator LLM

### Cel

Rozszerzyć obsługę zadań AI z modelami samodzielnie hostowanymi lub online,
z zachowaniem działania systemu przy niedostępności modeli.

### Kroki

1. Zdefiniować provider-neutralny kontrakt mediatora.
2. Zweryfikować modele samodzielnie hostowane i integrację z usługą online
   w całej macierzy wdrożeń.
3. Wybrać modele dla poszczególnych zadań po benchmarku jakości, licencji,
   RAM/VRAM i latencji.
4. Wymagać structured output zgodnego z wersjonowanym JSON Schema.
5. Walidować i audytować wejście oraz odpowiedź.
6. Rozdzielić klasyfikację, ekstrakcję, streszczenie, mapowanie ATT&CK, draft
   raportu i rekomendację playbooka.
7. Porównać LLM z deterministycznym baseline.
8. Dodać timeout, retry, circuit breaker i działanie bez LLM.
9. Uniemożliwić mediatorowi bezpośrednie wywołanie action runnera.

### Warianty wdrożenia

BastionDesk korzysta ze wspólnego bazowego Docker Compose dla kontenerów
linuksowych. Obrazy i zależności należy zweryfikować na `linux/amd64`
i `linux/arm64`. Ustawienia sprzętu i hosta można podać w dodatkowych plikach
Compose. [Obrazy wieloplatformowe](https://docs.docker.com/build/building/multi-platform/),
[Łączenie plików Compose](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)

- **Linux Server** — Docker Engine i Compose na wspieranej dystrybucji.
  [Wspierane platformy Docker Engine](https://docs.docker.com/engine/install/)
- **Windows Server** — Docker Engine i Compose w linuksowej maszynie
  wirtualnej, np. na Hyper-V. Docker Desktop jest wspierany na klienckich
  wersjach Windows.
  [Dystrybucje Linux wspierane przez Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/supported-linux-and-freebsd-virtual-machines-for-hyper-v-on-windows),
  [wymagania Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
- **macOS** — Docker Desktop i Compose. Apple Silicon (`arm64`) wchodzi do
  macierzy odbioru. [Docker Desktop na macOS](https://docs.docker.com/desktop/setup/install/mac-install/)

### Konfiguracja usług inferencji

Operator ustawia osobno adapter, adres URL usługi (nazwa DNS lub IP z portem),
identyfikator modelu i opcjonalny sekret dla modelu decyzyjnego oraz
generatywnego. Zmiana następuje przez konfigurację wdrożenia bez modyfikacji kodu
i przebudowy obrazów. Każdy model może działać przy aplikacji, na innym serwerze
w sieci prywatnej lub przez HTTPS u dostawcy online obsługiwanego przez adapter.
Własny runtime uruchamia się tylko w konfiguracji, która go używa.

Dostawca online wymaga jawnego włączenia dla organizacji. Backend przekazuje
zakres danych tekstowych potrzebny do zadania zgodnie z polityką organizacji.
Zrzuty ekranu i treść plików pozostają w BastionDesk. W razie awarii modelu
samodzielnie hostowanego przejście do usługi online wymaga jawnej konfiguracji.

Docker Model Runner i samodzielny llama.cpp są kandydatami dla wdrożeń
samodzielnie hostowanych. Do benchmarku klasyfikacji uwzględnić basal mini,
a do streszczeń i szkiców raportów Gemma 4 E2B Instruct.

### Kryterium ukończenia

Każdy use case ma mierzalną jakość, walidowany output, odwołania do dowodów
i fallback. Dziennik zapisuje model, wersję kontraktu i wynik walidacji;
niepoparte twierdzenia wymagają oceny analityka. Niedostępny model nie blokuje
podstawowego systemu.

Na Linux Serverze, Windows Serverze i macOS przechodzą te same scenariusze
odbioru, w tym klasyfikacja, generowanie szkicu i obsługa niedostępności
usługi inferencji. Test konfiguracji potwierdza zmianę adresu, przełączenie
jednego modelu do dostawcy online i działanie obu ról z różnymi dostawcami.
Wyniki wydajności dokumentują host, sprzęt i wybrany runtime lub usługę.

## Faza 12 — walidacja badawcza i wydanie

### Cel

Udowodnić wartość systemu i przygotować powtarzalny deployment.

### Kroki

1. Zbudować dashboardy OpenTelemetry, Prometheus i Grafana.
2. Wykonać eksperymenty na tym samym datasecie i środowisku.
3. Przetestować tenant isolation, auth, sekrety, upload, kolejki i response.
4. Dodać SBOM i skan zależności, obrazów oraz konfiguracji.
5. Zweryfikować backup/restore i upgrade ze wspieranej wersji.
6. Przygotować runbooki instalacji, upgrade, awarii i rotacji sekretów.
7. Potwierdzić uruchomienie, restart i zachowanie danych całego stosu Compose
   na Linux Serverze, Windows Serverze z linuksową VM i macOS z Apple Silicon.
8. Przygotować docs użytkownika, operatora i dewelopera.
9. Oddzielić zakres magisterski od elementów późniejszego produktu.
10. Uruchomić pełny zestaw React Testing Library i Flashwright przeciw
    docelowemu BastionDesk `2.0` oraz potwierdzić parity przepływów `1.0.3`.
11. Wydać wersję z macierzą wspieranych komponentów.

### Kryterium ukończenia

Wersja ma powtarzalne wdrożenie i upgrade, wyniki eksperymentów, runbooki oraz
udokumentowane ograniczenia. Eksport dziennika dowodów zachowuje wersję
formatu i tenant scope, ma testy deterministyczności, wykrywania zmian oraz
redakcji wrażliwych danych. Pełny zestaw testów komponentowych i E2E przechodzi
przeciw docelowemu BastionDesk `2.0` bez regresji przepływów `1.0.3`.

## Checkpointy produktowe

| Checkpoint | Fazy | Rezultat |
| --- | --- | --- |
| A — stabilny fundament | 0–4 | Baseline, testy migracyjne, core, kontrakty, kolejki i obserwowalność. |
| B — platforma detekcji | 5–7 | Tożsamość, Wazuh, assety, IOC, TI i artefakty. |
| C — wsparcie triage | 8–9 | Korelacja, scoring i playbooki suggestion/approval. |
| D — SOAR-lite | 10–11 | Kontrolowana reakcja i pomocnicze modele lokalne lub online. |
| E — wydanie badawcze | 12 | Pomiary, deployment, upgrade i dokumentacja. |

Każdy checkpoint musi być prezentowalny i testowalny bez ukończenia następnego.

## Artefakty wymagane w fazach

| Faza | Minimalne artefakty dokumentacyjne |
| --- | --- |
| 0 | baseline funkcjonalny, znane ograniczenia, macierz regresji i pomiary początkowe |
| 1 | macierz testów komponentowych i E2E, konwencje danych oraz instrukcja uruchamiania w CI |
| 2 | ADR-y granic NestJS/auth/EffectTS, model domenowy, polityka migracji, kontrakt JWT/JWKS, wersjonowanie API i event envelope |
| 3 | mapa modułów, reguły domenowe, plan kompatybilności i wygaszania legacy |
| 4 | topologia messagingu, standard handlera, retry/DLQ i runbook replay |
| 5 | model zaufania Elysia 2–NestJS, kontrakt JWT/JWKS, threat model auth, rotacja kluczy i karty OIDC |
| 6 | specyfikacja i wyniki odbioru, konfiguracja Indexera i diagnostyka, kontrakt HTTP |
| 7 | model IOC/artefaktu, karty TI, polityka sekretów i wersjonowanie YARA |
| 8 | specyfikacja korelacji, scoring, kalibracja i opis datasetu |
| 9 | schema playbooka, model policy/approval i katalog bezpiecznych kroków |
| 10 | karty akcji, uprawnienia, rollback, kill switch i raport testów awarii |
| 11 | kontrakt mediatora, karty modeli/runtime'ów, benchmarki i polityka danych AI |
| 12 | raport badawczy, instalacja/upgrade, runbooki, release notes, wyniki E2E i macierz kompatybilności |

## Elementy odłożone poza rdzeń

Poniższe elementy nie blokują checkpointów A–D:

- Astro landing page i osobny portal dokumentacji;
- migracja MinIO do RustFS;
- Docker Stack, K3s lub MicroK8s;
- Pulumi;
- cloudowe Sentry/Axiom;
- dodatkowy WAF;
- skanery endpointów dublujące Wazuh/YARA;
- marketplace integracji;
- szeroki zestaw social loginów;
- pełna implementacja STIX/TAXII.

Każdy z nich wymaga discovery i ADR. Migracja storage lub orkiestratora powinna
nastąpić dopiero, gdy istnieje mierzalny problem bieżącego komponentu.

## Strategia testów

W nowej wersji nie wystarczą wyłącznie testy jednostkowe.

### W każdej fazie

- testy jednostkowe reguł i walidatorów;
- testy komponentowe zmienianego UI;
- testy modułowe domeny;
- testy kontraktowe API, eventów i integracji;
- testy izolacji organizacji;
- testy idempotencji, retry i trybu zdegradowanego;
- testy migracji danych;
- odpowiednie scenariusze Flashwright dla zmienianych przepływów krytycznych.

### Na checkpointach

- integracja PostgreSQL, RabbitMQ, Redis i storage;
- replay zdarzeń i odbudowa cache;
- awarie providera i DLQ;
- selektywne E2E krytycznych przepływów;
- backup/restore i upgrade;
- active response wyłącznie w izolowanym labie.

`bun:test` z React Testing Library jest standardem testów komponentowych, a
Flashwright standardem testów przeglądarkowych E2E. Testy utworzone dla `1.0.3`
pozostają aktywnym kontraktem zachowania podczas migracji i muszą przejść na
docelowym BastionDesk `2.0`.

## Plan badań

### Eksperyment 1 — czas reakcji

Porównać przepływ manualny z BastionDesk od odczytu alertu lub zgłoszenia
przez korelację, enrichment i scoring po playbook, zatwierdzenie i reakcję.

Metryki: MTTD, MTTT, MTTR, liczba ręcznych kroków i czasy etapów pipeline'u.

Wspólna zasada pomiarów: etykiety prawdy powstają niezależnie od predykcji
systemu. Alert pominięty przez scorer nie staje się przez to false positive.
Raport uwzględnia błędy i wstrzymanie decyzji, wersję datasetu/reguł/modelu
oraz brak pomiaru jako brak danych. Historyczny replay korzysta z dowodów
osiągalnych w badanym momencie; analizę z późniejszym TI oznaczamy oddzielnie.

### Eksperyment 2 — jakość korelacji

Ocenić precision, recall, false positives, false negatives, kalibrację
confidence score i wpływ korekt analityka.

### Eksperyment 3 — cache i enrichment

Ocenić czas z cache i bez cache, redukcję zapytań, rate limits, awarie
providerów oraz wpływ TI na priorytetyzację.

### Eksperyment 4 — active response

Ocenić czas wykonania, weryfikację skutku, częściowe akcje, rollback oraz wpływ
approval na bezpieczeństwo i czas reakcji.

### Eksperyment 5 — lokalny LLM

Ocenić jakość per zadanie, structured output, latency, RAM/VRAM, różnicę wobec
baseline i działanie bez modelu.

## Minimalny zakres pracy magisterskiej

1. Model alertów, assetów i zdarzeń bezpieczeństwa.
2. Odczyt alertów Wazuh i przegląd w panelu analityka.
3. Niezawodny workflow RabbitMQ.
4. Ekstrakcja IOC.
5. Co najmniej dwie klasy enrichmentu TI.
6. YARA dla przesłanych artefaktów.
7. Deterministyczna korelacja zgłoszeń z alertami.
8. Wyjaśnialny risk/confidence scoring.
9. Playbook engine w `suggest_only` i `human_approval`.
10. Jedna odwracalna active response w izolowanym środowisku.
11. Audyt, OpenTelemetry i dashboard metryk.
12. Porównanie z przepływem manualnym.

Social login, osobny auth gateway, migracja storage, Kubernetes, landing page i
rozbudowany LLM nie są konieczne do obrony, jeśli nie wspierają eksperymentu.

## Kolejność dalszej pracy

1. Utrzymywać kontrakt UI/E2E i sprawdzić bieżące zależności przed następnym
   wydaniem; oddzielić formalne odbiory od historycznych wyników testów.
2. Zrealizować IOC/TI i analizę artefaktów w fazie 7 w ramach checkpointu B.
3. Dodać korelację i scoring w fazie 8, a następnie trwałe playbooki
   suggestion/approval w fazie 9.
4. Po testach polityk i awarii dołączyć ograniczoną reakcję oraz
   rozszerzony mediator LLM (fazy 10–11).

[Odbiór fazy 6](integrations/wazuh-stage-6-spec.md#kryteria-odbioru) zakończono
na istniejącym alercie agenta Ubuntu `001`.
