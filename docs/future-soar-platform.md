# BastionDesk — plan rozwoju do lokalnej platformy SOAR dla MSP

## Status dokumentu

Ten dokument opisuje kierunek rozwoju po wydaniu BastionDesk `1.0.3`. Łączy:

- aktualny punkt wyjścia potwierdzony przez kod i dokumentację;
- docelowe możliwości produktu;
- kolejność faz i zależności między nimi;
- kryteria ukończenia etapów;
- wymagania dotyczące badań, bezpieczeństwa i integracji.

Nie jest to instrukcja instalacji bibliotek ani niezmienny wybór wszystkich
technologii. Nazwy narzędzi oznaczają obecne kandydatury. Przed implementacją
każdej integracji trzeba potwierdzić aktualnie wspierany sposób komunikacji,
wersje, ograniczenia i model bezpieczeństwa.

Dokument jest roadmapą produktu, planem pracy magisterskiej i punktem
odniesienia dla przyszłych decyzji architektonicznych.

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
- lokalny LLM jako warstwę pomocniczą, a nie wykonawcę akcji;
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

## Punkt wyjścia: BastionDesk 1.0.3

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

Przed implementacją Wazuh, Ansible, providera Threat Intelligence, lokalnego
runtime'u AI, OIDC/OAuth, STIX/TAXII lub innego systemu zewnętrznego należy
wykonać `integration discovery`.

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

Dokument nie zamraża dziś jednego endpointu Wazuh. W fazie integracji trzeba
potwierdzić rekomendowany sposób odbioru alertów i assetów, auth, format i
wersjonowanie eventów, obsługę wielu organizacji, backpressure oraz
kompatybilność z wybraną wersją. Adapter nie może narzucać surowego formatu
Wazuh całej domenie BastionDesk.

## Docelowe granice systemu

### Frontend operacyjny

Pozostaje aplikacją React. Korzysta z domenowego API i nie komunikuje się
bezpośrednio z RabbitMQ, Redis, Wazuh, Ansible ani providerami TI.

### Gateway tożsamości

Osobny gateway oparty na Better Auth i lekkim frameworku TypeScript pozostaje
kandydatem, nie przesądzoną migracją. Odpowiadałby za:

- logowanie, sesje i PassKeys;
- organizacje i role;
- opcjonalne OIDC/social login;
- CSRF, origin validation i rate limiting;
- przekazanie zweryfikowanej tożsamości do core.

JWT/JWKS należy dodać tylko wtedy, gdy jest potrzebny dla usług lub klientów
innych niż przeglądarka. Dla przeglądarki preferowane są HttpOnly cookies.

### Core domenowy

NestJS jest kandydatem dla modularnego core, ale wymaga ADR i migracji modułami.
Core odpowiada za:

- incydenty, alerty i zdarzenia bezpieczeństwa;
- organizacje, assety, IOC i artefakty;
- enrichment, korelację i scoring;
- polityki, playbooki i approval;
- akcje, rollback i audyt;
- API domenowe i publikowanie zdarzeń.

### Workery

Granice logiczne powstają przed granicami procesów. Początkowo kilka workerów
może działać w jednym deployable. Docelowe odpowiedzialności:

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
- Redis: cache, locki, deduplikacja i krótkotrwały stan;
- S3-compatible storage: artefakty, dowody, raporty i PCAP;
- OpenTelemetry: wspólny kontekst obserwowalności.

## Status decyzji technologicznych

| Status | Elementy | Zasada |
| --- | --- | --- |
| Zachować jako baseline | React, TypeScript, Tailwind CSS v4, Base UI, Bun, Oxc, TurboRepo, PostgreSQL, PgBouncer, NGINX, Docker Compose, S3 API, Protobuf/gRPC i mTLS | Nie migrować bez mierzalnego problemu lub wymagania domenowego. |
| Wprowadzać w fazach rdzenia | wersjonowane migracje, modularny core, RabbitMQ, Redis, OpenTelemetry, Prometheus i Grafana | Najpierw kontrakt, spike i test awarii; potem użycie produkcyjne. |
| Wprowadzać domenowo | Wazuh, YARA, Threat Intelligence, SIGMA, playbooki i Ansible/Active Response | Każdy komponent przechodzi integration discovery i dostaje adapter odseparowany od domeny. |
| Kandydaci wymagający ADR | NestJS, Drizzle, osobny gateway ElysiaTS, JWT/JWKS, Docker Model Runner, llama.cpp i wybrany model lokalny | Nazwa technologii w roadmapie nie oznacza automatycznej zgody na migrację. |
| Opcjonalne po stabilizacji | OIDC Google/Apple/Microsoft, STIX/TAXII, Defender i kolejni providerzy TI | Dodawać pojedynczo, gdy istnieje konkretny scenariusz produktowy. |
| Odłożone | RustFS, Astro/portal docs, Docker Stack, K3s/MicroK8s, Pulumi, Sentry/Axiom i dodatkowy WAF | Nie mogą blokować rdzenia SOAR ani pracy magisterskiej. |

Obecny SMTP i Nodemailer pozostają wystarczające dla bieżącego produktu.
Notification worker powinien przejąć wysyłkę dopiero po powstaniu niezawodnej
kolejki. Osobne API mailowe ma sens tylko wtedy, gdy pojawią się webhooki lub
niezależne wymagania skalowania.

## Docelowy przepływ domenowy

```text
zgłoszenie pracownika / alert Wazuh
  -> ingest i walidacja
  -> zapis surowego źródła
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

## Faza 1 — migracje i kontrakty domenowe

### Cel

Przygotować rozwój bez utraty danych i bez big-bang rewrite.

### Kroki

1. Zdefiniować bounded contexts i właścicieli modeli.
2. Utworzyć ADR dla core, gatewaya, workerów i komunikacji wewnętrznej.
3. Wprowadzić wersjonowane migracje i upgrade z obecnego schematu.
4. Przygotować wspólne kontrakty typów, błędów, paginacji i event envelope.
5. Zdefiniować tenant scope, correlation ID, causation ID i idempotency key.
6. Zaprojektować rozszerzony audyt i provenance danych.
7. Wybrać ORM/query layer po spike'u; Drizzle pozostaje kandydatem.
8. Określić kompatybilność starego i nowego API.

### Kryterium ukończenia

Migrację można wykonać kontrolowanie, a nowy moduł korzysta ze wspólnych
kontraktów bez kopiowania modeli legacy.

### Dokumentacja

- ADR-y i model domenowy;
- polityka migracji;
- wersjonowanie API, eventów i błędów.

## Faza 2 — modularny core incydentów

### Cel

Oddzielić logikę domenową od HTTP i przygotować core na alerty.

### Kroki

1. Zbudować moduły organizacji, incydentów, plików i audytu.
2. Przenieść statusy, ownership i RBAC do testowalnej domeny.
3. Zachować kompatybilność frontendu przez adapter lub wersjonowane API.
4. Rozszerzyć audyt o zmiany danych i decyzje systemowe.
5. Wprowadzić model komendy i zdarzenia niezależny od brokera.
6. Usuwać legacy dopiero po osiągnięciu parity.

### Kryterium ukończenia

Obecny workflow działa przez modularny core, zachowuje dane i uprawnienia, a
testy porównawcze starej i nowej ścieżki przechodzą.

## Faza 3 — kolejki, niezawodność i obserwowalność

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

## Faza 4 — tożsamość i gateway

### Cel

Oddzielić auth tylko wtedy, gdy tworzy czytelną granicę zaufania.

### Kroki

1. Zweryfikować aktualne Better Auth, WebAuthn i providerów OIDC.
2. Przygotować ADR: auth w core kontra osobny gateway.
3. Jeśli gateway zostanie zaakceptowany, przenieść sesje, organizacje i role
   bez utraty kompatybilności użytkowników.
4. Zdefiniować zaufanie gateway–core i minimalne claims.
5. Zachować HttpOnly cookies; JWT/JWKS dodać tylko z uzasadnieniem.
6. Ujednolicić CSRF, CORS, origin validation, rate limiting i audyt.
7. Social login dodać po discovery providera i reguł membership.

### Kryterium ukończenia

Konta, organizacje, role i PassKeys działają po migracji, a core akceptuje
wyłącznie zweryfikowaną tożsamość.

## Faza 5 — model bezpieczeństwa i ingest Wazuh

### Cel

Dostarczyć tylko do odczytu przepływ alertów i assetów bez reakcji.

### Kroki

1. Wykonać pełne discovery Wazuh.
2. Zdefiniować `asset`, `security_event`, `alert` i `source`.
3. Zachować surowy payload i tworzyć wersjonowany model znormalizowany.
4. Zapewnić deduplikację, replay, backpressure i checkpointy.
5. Powiązać Wazuh agent/host z assetem oraz tenantem.
6. Określić retencję surowych i znormalizowanych danych.
7. Udostępnić analitykowi alerty i szczegóły źródła.
8. Przygotować fixture'y i kontrolowane zdarzenia badawcze.
9. Defender i inne źródła dodać później jako osobne adaptery.

### Kryterium ukończenia

Alert trafia do właściwej organizacji, może być odtworzony bez duplikatów i
jest widoczny wraz z surowym oraz znormalizowanym źródłem.

### Dokumentacja

- karta integracji Wazuh;
- schema mapping i retencja;
- runbook utraty połączenia i replay.

## Faza 6 — IOC, Threat Intelligence i artefakty

### Cel

Automatycznie zbierać dowody i wzbogacać incydenty bez zależności domeny od
jednego providera.

### Kroki

1. Zdefiniować typy IOC, canonical form i provenance.
2. Zbudować deterministyczny extractor IOC.
3. Dodać hashing, magic bytes i bezpieczny pipeline artefaktów.
4. Wykonać discovery YARA i zaprojektować wspólny model reguł oraz wyników.
5. Uruchomić skanowanie artefaktów w izolowanym workerze.
6. Zdefiniować provider-neutralny kontrakt enrichmentu.
7. Dodawać providerów pojedynczo, każdy z osobną kartą integracji.
8. Dodać cache TTL, rate limiting, retry i circuit breaker.
9. Szyfrować sekrety per tenant i audytować użycie.
10. Zapisywać źródło, czas pobrania i wpływ wyniku na scoring.

Potencjalni providerzy do ponownej oceny: AbuseIPDB, URLhaus, LevelBlue OTX,
Hybrid Analysis i opcjonalnie VirusTotal.

### Kryterium ukończenia

IOC lub artefakt ma wynik z provenance, cache nie miesza tenantów, awaria
providera nie blokuje incydentu, a analityk widzi aktualność danych.

## Faza 7 — korelacja i scoring ryzyka

### Cel

Łączyć zgłoszenia, alerty, assety, IOC i wyniki analizy w wyjaśnialny incydent.

### Kroki

1. Zdefiniować relacje zgłoszenie–alert–security event–incydent.
2. Korelować deterministycznie po asset/agent ID, użytkowniku, hostname, IP,
   hashu, procesie, MITRE ATT&CK i czasie.
3. Rozdzielić `severity`, `confidence` i `risk score`.
4. Wersjonować reguły i zapisywać uzasadnienie.
5. Umożliwić ręczne połączenie, rozłączenie i korektę.
6. Dodać reprocessing bez utraty historycznej decyzji.
7. Przygotować oznaczony dataset pozytywny i negatywny.
8. Kalibrować progi przez precision, recall, false positives i false negatives.

### Kryterium ukończenia

Każde powiązanie i score można wyjaśnić oraz odtworzyć dla konkretnej wersji
reguł. LLM nie jest wymagany.

## Faza 8 — playbooki i human-in-the-loop

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
zewnętrznej. Analityk widzi uzasadnienie, zakres i rollback.

## Faza 9 — kontrolowana active response

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

## Faza 10 — mediator LLM

### Cel

Rozszerzyć lokalne AI bez uzależniania poprawności systemu od modelu.

### Kroki

1. Zdefiniować provider-neutralny kontrakt mediatora.
2. Zweryfikować aktualnie wspierane lokalne runtime'y i modele.
3. Wybrać model po benchmarku jakości, licencji, RAM/VRAM i latencji.
4. Wymagać structured output zgodnego z wersjonowanym JSON Schema.
5. Walidować i audytować wejście oraz odpowiedź.
6. Rozdzielić klasyfikację, ekstrakcję, streszczenie, mapowanie ATT&CK, draft
   raportu i rekomendację playbooka.
7. Porównać LLM z deterministycznym baseline.
8. Dodać timeout, retry, circuit breaker i działanie bez LLM.
9. Uniemożliwić mediatorowi bezpośrednie wywołanie action runnera.

Docker Model Runner, llama.cpp i rodzina Gemma pozostają kandydatami, a nie
zamrożonym wymaganiem.

### Kryterium ukończenia

Każdy use case ma mierzalną jakość, walidowany output i fallback. Niedostępny
model nie blokuje podstawowego systemu.

## Faza 11 — walidacja badawcza i wydanie

### Cel

Udowodnić wartość systemu i przygotować powtarzalny deployment.

### Kroki

1. Zbudować dashboardy OpenTelemetry, Prometheus i Grafana.
2. Wykonać eksperymenty na tym samym datasecie i środowisku.
3. Przetestować tenant isolation, auth, sekrety, upload, kolejki i response.
4. Dodać SBOM i skan zależności, obrazów oraz konfiguracji.
5. Zweryfikować backup/restore i upgrade ze wspieranej wersji.
6. Przygotować runbooki instalacji, upgrade, awarii i rotacji sekretów.
7. Ustabilizować Docker Compose jako wariant podstawowy.
8. Przygotować docs użytkownika, operatora i dewelopera.
9. Oddzielić zakres magisterski od elementów późniejszego produktu.
10. Wydać wersję z macierzą wspieranych komponentów.

### Kryterium ukończenia

Wersja ma powtarzalne wdrożenie i upgrade, wyniki eksperymentów, runbooki oraz
udokumentowane ograniczenia.

## Checkpointy produktowe

| Checkpoint | Fazy | Rezultat |
| --- | --- | --- |
| A — stabilny fundament | 0–3 | Migrowalny core, kontrakty, kolejki i obserwowalność. |
| B — platforma detekcji | 4–6 | Tożsamość, Wazuh, assety, IOC, TI i artefakty. |
| C — wsparcie triage | 7–8 | Korelacja, scoring i playbooki suggestion/approval. |
| D — SOAR-lite | 9–10 | Kontrolowana reakcja i pomocniczy lokalny LLM. |
| E — wydanie badawcze | 11 | Pomiary, deployment, upgrade i dokumentacja. |

Każdy checkpoint musi być prezentowalny i testowalny bez ukończenia następnego.

## Artefakty wymagane w fazach

| Faza | Minimalne artefakty dokumentacyjne |
| --- | --- |
| 0 | baseline funkcjonalny, znane ograniczenia, macierz regresji i pomiary początkowe |
| 1 | ADR-y, model domenowy, polityka migracji, wersjonowanie API i event envelope |
| 2 | mapa modułów, reguły domenowe, plan kompatybilności i wygaszania legacy |
| 3 | topologia messagingu, standard handlera, retry/DLQ i runbook replay |
| 4 | model zaufania i sesji, threat model auth, rotacja kluczy i karty OIDC |
| 5 | karta Wazuh, schema mapping, retencja i runbook utraty połączenia |
| 6 | model IOC/artefaktu, karty TI, polityka sekretów i wersjonowanie YARA |
| 7 | specyfikacja korelacji, scoring, kalibracja i opis datasetu |
| 8 | schema playbooka, model policy/approval i katalog bezpiecznych kroków |
| 9 | karty akcji, uprawnienia, rollback, kill switch i raport testów awarii |
| 10 | kontrakt mediatora, karty modeli/runtime'ów, benchmarki i polityka danych AI |
| 11 | raport badawczy, instalacja/upgrade, runbooki, release notes i macierz kompatybilności |

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
- testy modułowe domeny;
- testy kontraktowe API, eventów i integracji;
- testy izolacji organizacji;
- testy idempotencji, retry i trybu zdegradowanego;
- testy migracji danych.

### Na checkpointach

- integracja PostgreSQL, RabbitMQ, Redis i storage;
- replay zdarzeń i odbudowa cache;
- awarie providera i DLQ;
- selektywne E2E krytycznych przepływów;
- backup/restore i upgrade;
- active response wyłącznie w izolowanym labie.

Vitest uruchamiany przez Bun i React Testing Library pozostają kandydatami dla
TypeScript/React. Narzędzie jest mniej ważne niż powtarzalne testowanie realnych
granic systemu.

## Plan badań

### Eksperyment 1 — czas reakcji

Porównać przepływ manualny z BastionDesk: alert/zgłoszenie → ingest → korelacja
→ enrichment → scoring → playbook → approval/akcja.

Metryki: MTTD, MTTT, MTTR, liczba ręcznych kroków i czasy etapów pipeline'u.

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
2. Wazuh ingest.
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

## Kolejność rozpoczęcia pracy

Pierwsza sesja implementacyjna rozpoczyna Fazę 0, a nie Wazuh lub migrację
frameworka:

1. zatwierdzić scenariusze baseline;
2. zamknąć niespójności obecnej wersji;
3. ustalić kontrakty i model migracji;
4. następnie rozpocząć modularizację core i fundament asynchroniczny.

Pierwszym dużym rezultatem jest checkpoint A: system nadal robi wszystko, co
`1.0.3`, ale ma migracje, modularny core, kontrakty, kolejki i obserwowalność
potrzebne do bezpiecznego dodawania SOAR.
