# Integracja Wazuh — etap 6

Uzgodniony zakres produktu i kryteria odbioru zawiera [specyfikacja etapu 6](wazuh-stage-6-spec.md).

## Wdrożenie etapu 6

Zakładka **Alerty Wazuh** jest dostępna w panelach analityka i administratora.
Wazuh zawiera alerty i określa ich czas przechowywania. W BastionDesk administrator
konfiguruje jedno dedykowane źródło dla swojej organizacji.

1. Wykonaj standardową migrację bazy BastionDesk, która obejmuje `0004_wazuh_sources`.
2. Wygeneruj klucz poleceniem `openssl rand -base64 32`. Zapisz go w magazynie
   sekretów instalacji. Zamontuj plik tylko do odczytu dla procesu backendu
   i ustaw jego ścieżkę w `WAZUH_SOURCE_KEY_FILE`. Zachowaj kopię klucza
   do odtworzenia konfiguracji z kopii bazy.
3. Zapewnij trasę z kontenera backendu do portu HTTPS Indexera na prywatnym adresie
   VM. W sieci wdrożenia ogranicz ruch wychodzący czytnika do sieci, w których
   działają Indexery. Dodatkowe chronione usługi wskaż w `WAZUH_PROTECTED_HOSTS`
   jako listę nazw i IP oddzielonych przecinkami. Pracownicy korzystają ze
   zwykłego adresu BastionDesk przez sieć firmową lub VPN.
4. Utwórz w Wazuh osobne konto do odczytu indeksów alertów organizacji
   (`wazuh-alerts-*`). Konto musi mieć prawo wyszukiwania oraz tworzenia
   i zamykania krótkotrwałych kontekstów Point in Time na tych indeksach.
   Używana ścieżka z PIT została sprawdzona na Indexerze opartym na OpenSearch
   2.19.6. [Uprawnienia Point in Time](https://docs.opensearch.org/2.19/search-plugins/searching-data/point-in-time/#security-model)
5. W panelu administratora podaj adres HTTPS Indexera, użytkownika i hasło.
   Dla prywatnego urzędu certyfikacji wklej publiczny certyfikat CA w formacie PEM.
   Wybierz **Sprawdź połączenie**, a następnie **Zapisz i włącz**.
   Weryfikacja sprawdza utworzenie i zamknięcie PIT również na istniejącym
   pustym indeksie. Jeżeli Indexer nie ma jeszcze pasujących indeksów, udane
   wyszukiwanie wystarcza do zapisu źródła. Próby PIT wymagają wtedy utworzenia
   pierwszego indeksu alertów. Cała weryfikacja ma wspólny limit 10 sekund.
6. Otwórz zakładkę jako analityk, sprawdź zakres i poziom reguły, a następnie
   otwórz **Szczegóły alertu Wazuh** i wybierz **Pokaż JSON**.

Przykład montowania klucza w pliku uzupełniającym Docker Compose:

```yaml
services:
  backend:
    environment:
      WAZUH_SOURCE_KEY_FILE: /run/secrets/wazuh-source-key
    volumes:
      - /srv/bastiondesk/secrets/wazuh-source-key:/run/secrets/wazuh-source-key:ro
```

Plik powinien być czytelny dla użytkownika procesu backendu.

`WAZUH_REFRESH_INTERVAL_SECONDS` określa interwał całej instalacji. Domyślnie
wynosi 60 sekund. Wartość `0` pozostawia odświeżanie ręczne. Po zmianie odtwórz
kontener backendu z nowym środowiskiem, np. poleceniem
`docker compose up -d --no-deps --force-recreate backend` z tymi samymi plikami
Compose co przy wdrożeniu. Interfejs odczyta interwał z API backendu.
Odświeżenie pierwszej strony zamyka poprzedni kontekst PIT dla tego widoku.
Test połączenia, zapis i zmiana stanu mają co najmniej 15 sekund na odpowiedź backendu,
również gdy globalny `VITE_API_TIMEOUT_MS` jest krótszy.

Certyfikat Indexera powinien pasować do nazwy lub adresu HTTPS podanego
w formularzu. W laboratorium z przekierowaniem TCP operator może przypisać
istniejącą tożsamość z certyfikatu przez `WAZUH_INDEXER_TLS_NAME` oraz
dokładny adres HTTPS przez `WAZUH_INDEXER_TLS_ORIGIN`. Nadal wymagany jest
zaufany prywatny CA i poprawna tożsamość z certyfikatu.

W teście z błędem połączenia sprawdź trasę i port z sieci kontenera.
Przy błędzie TLS sprawdź łańcuch CA i nazwę w certyfikacie. Przy odmowie
uwierzytelnienia lub uprawnień sprawdź konto i rolę w Indexerze.
Jeśli inny administrator zmienił źródło, wczytaj aktualną konfigurację
przed ponowieniem operacji.

### Odbiór z rzeczywistym Wazuh

Uruchom test z katalogu głównego przez `bun scripts/test-phase1-e2e.ts --wazuh`
po zainstalowaniu Chromium używanego przez Playwright. Przekaż
`E2E_WAZUH_ORIGIN`, `E2E_WAZUH_USER`, `E2E_WAZUH_CA_FILE`
i `E2E_WAZUH_PASSWORD_FILE` z plikiem hasła tylko do odczytu.
Dla laboratorium z przekierowaniem można przekazać `E2E_WAZUH_TLS_NAME`.
Test WAZ-04 wybiera najnowszy istniejący alert agenta `001`. Opcjonalne
`E2E_WAZUH_EVENT_SINCE` przyjmuje datę w ISO 8601 i ogranicza wyszukiwanie do
alertów od tego czasu. Test porównuje pełny dokument z Indexerem po indeksie
oraz ID i sprawdza dwa odświeżenia w tabeli.

Polecenie diagnostyczne odczytuje podsumowanie konkretnego dokumentu.
Korzysta z `WAZUH_INDEXER_URL`, `WAZUH_INDEXER_USER`,
`WAZUH_INDEXER_PASSWORD_FILE` i opcjonalnych `WAZUH_INDEXER_CA`
oraz `WAZUH_INDEXER_TLS_NAME`.

```sh
bun run --cwd backend wazuh:read <agent> <indeks> <id-dokumentu> [poziom]
```

## Notatki z discovery

Poniższy zapis pochodzi z 24 września 2026. Obejmuje historyczne propozycje
trwałego ingestu, replayu, kwarantanny i Server API. Aktualny zakres określa
[specyfikacja etapu 6](wazuh-stage-6-spec.md), a obowiązująca konfiguracja
znajduje się w sekcji [Wdrożenie etapu 6](#wdrożenie-etapu-6).

We wrześniu praca obejmowała analizę dokumentacji i projekt spike'u.
Połączenie z rzeczywistą instalacją oraz kompatybilność adaptera pozostawały
wtedy do sprawdzenia.

Użytkownik może przygotować dedykowaną VM na innym hoście. Nie uruchamiamy
Wazuh w głównym Compose BastionDesk. Branch prac: `feat/stage6-implement`.

### Zakres i wersje

Odczyt alertów oraz identyfikacja agentów/assetów, bez Active Response,
zmiany konfiguracji, enrollmentu i wykonywania poleceń. Właściciel domenowy:
Core; Wazuh jest wymiennym adapterem wejściowym, nie modelem domenowym.

Oficjalna dokumentacja publikuje wydanie 4.14.8 z 23 września 2026:
[release notes](https://documentation.wazuh.com/current/release-notes/release-4-14-8.html).
To kandydat do laboratorium, nie deklaracja wsparcia wszystkich wersji 4.x.
Przed spike'em zapisać dokładne wersje managera, indexera, agentów i obrazu/OVA,
sprawdzić zmiany względem faktycznie wybranej wersji oraz jej deprecacje.
Wersja bazowego OpenSearch i dostępność PIT wymagają sprawdzenia na VM.

### Interfejsy — ustalenia i propozycja

Wazuh rozdziela analizę i zarządzanie agentami (server) od wyszukiwania danych
(indexer). Domyślne porty HTTPS to odpowiednio 55000 i 9200.
[Architektura](https://documentation.wazuh.com/current/getting-started/architecture.html).

| Dane / wariant | Propozycja dla BastionDesk | Co potwierdzić na VM |
| --- | --- | --- |
| Alerty historyczne i nowe | Polling Indexer Search API | Indeksy, mapowania, paginacja, uprawnienia |
| Agenci i ich stan | Server API, kandydat `GET /agents` | Pola, stronicowanie, zakres widoczności |
| Inwentarz assetów | Najpierw identyfikacja agenta; rozszerzenia oddzielnie | Potrzebne pola i źródło inventory |
| Integrator / push | Alternatywa, nie podstawowy transport MVP | Buforowanie, retry i możliwość replay |

Indeksy alertów mają domyślnie wzorzec `wazuh-alerts-*`, ale instalacja może
go zmienić. Archiwa wszystkich zdarzeń są oddzielnym źródłem; samo pobieranie
alertów nie oznacza pobierania wszystkich logów.
[Indeksy](https://documentation.wazuh.com/current/user-manual/wazuh-indexer/wazuh-indexer-indices.html).

Integrator wymaga skryptu i konfiguracji po stronie managera. Dokumentacja
nie stanowi dowodu trwałego dostarczenia do BastionDesk. Polling preferujemy
ze względu na możliwość kontrolowanego odczytu historii bez instalacji skryptu.
[Integrator](https://documentation.wazuh.com/current/user-manual/manager/integration-with-external-apis.html).

### Uwierzytelnianie i izolacja

Server API udostępnia `/security/user/authenticate` i używa JWT do kolejnych
żądań. Adapter powinien odnawiać token, a po 401 wykonać najwyżej jedną próbę
ponownego uwierzytelnienia. To token Wazuh, niezależny od JWT Core.
[Server API](https://documentation.wazuh.com/current/user-manual/api/getting-started.html).

Indexer obsługuje m.in. Basic Authentication po HTTPS; wybór mechanizmu zależy
od konfiguracji instalacji. Nie zakładamy wspólnego konta ani tokenu obu API.
[Indexer API](https://documentation.wazuh.com/current/user-manual/indexer-api/getting-started.html).

Proponowane wymagania dla spike'u:

- oddzielne konta integracyjne, bez uprawnień administracyjnych;
- Server API: odczyt wskazanych agentów; Indexer: wyszukiwanie wybranych indeksów,
  odczyt potrzebnych mapowań i ewentualne operacje kontekstu PIT;
- dokładne akcje RBAC sprawdzić na wybranej wersji, bez nadawania wildcard admin;
- TLS z weryfikacją CA i nazwy hosta; żadnego `rejectUnauthorized: false`;
- sekrety poza kodem, logami i repo; rotacja osobno dla obu interfejsów;
- konfiguracja źródła należy do organizacji; agent ID jest lokalny dla źródła;
- hostname/IP/grupa Wazuh nie są samodzielnym dowodem przynależności do tenanta;
- brak lub sprzeczne mapowanie trafia do kwarantanny, nigdy do domyślnej organizacji.

Dla MVP preferujemy jawne przypisanie źródła do jednej organizacji. Współdzielona
instalacja wymaga dodatkowego modelu zakresów agentów i testów izolacji danych.

### Kontrakt i niezawodność — projekt do potwierdzenia

Proponowana koperta: `source_id`, `organization_id` ustalone przez konfigurację,
`source_version`, `_index`, `_id`, `received_at`, oryginalny `_source` oraz
`normalization_version`. Znormalizowany model oddziela `asset`, `security_event`
i `alert`. Zachowujemy surową ważność reguły; mapowanie na własną skalę wymaga decyzji.
Raw oznacza dokument odebrany z Indexera, nie obietnicę odzyskania oryginalnych
bajtów logu endpointu sprzed przetworzenia przez Wazuh.

Kandydat klucza deduplikacji: `(source_id, index, document_id)`. Reindexing lub
odtworzenie instalacji może zmienić tożsamość dokumentu — musi zostać sprawdzone.
Zmiana normalizatora nie tworzy nowego alertu; zapisuje nową wersję interpretacji.

Indexer ma domyślnie okno wyników 10 000. Nie podnosimy go w celu obejścia
paginacji. Kandydatem jest PIT + `search_after`; obsługę, uprawnienia i stabilny
unikalny tie-breaker trzeba potwierdzić w faktycznych mapowaniach. Sam timestamp
nie jest wystarczającym kursorem.
[Paginacja OpenSearch](https://docs.opensearch.org/latest/search-plugins/searching-data/point-in-time/).

Checkpoint trwały dopiero po zapisie strony w PostgreSQL. PIT jest kontekstem
chwilowym, nie trwałym checkpointem. Po jego utracie odtwarzamy zakres z nakładką
i deduplikacją. Trzeba zbadać opóźnione indeksowanie i daty zdarzeń: skończona
nakładka nie gwarantuje wykrycia dowolnie spóźnionych dokumentów. Potrzebna będzie
okresowa rekonsyliacja w uzgodnionym zakresie retencji.

Częściowa odpowiedź, `timed_out` lub błędy shardów nie przesuwają checkpointu.
Odrzucony dokument musi mieć trwały zapis w kwarantannie przed potwierdzeniem strony.

Proponowane ustawienia początkowe do pomiaru: strona 500 dokumentów, jedna
aktywna strona na źródło, timeout 15 s, retry z jitterem do 60 s dla 429/5xx
oraz błędów transportu. 403 i niezgodny schemat wymagają interwencji. Retry nie
może blokować pozostałych źródeł. Pauzujemy pobieranie przy przekroczeniu budżetu
backlogu/bajtów, zamiast gromadzić dane bez limitu w pamięci.

Server API dokumentuje domyślny limit 300 żądań/min, wspólny dla użytkowników
(z wyjątkami opisanymi w konfiguracji); nie przenosimy tego limitu na Indexer.
[Limity](https://documentation.wazuh.com/current/user-manual/api/configuration.html).

### Retencja, eksploatacja i licencja

Retencja raw, normalizacji, kwarantanny i kluczy deduplikacji pozostaje do
uzgodnienia po pomiarze wolumenu. Klucze deduplikacji muszą pokrywać dopuszczalny
horyzont replay. Utrata danych wskutek retencji źródła ma być raportowana jako
luka, nie jako poprawnie zakończony ingest. Dane mogą zawierać nazwy użytkowników,
IP i treści logów; logi adaptera zawierają liczniki/kody, nie payloady i sekrety.

Metryki: lag, wiek checkpointu, odebrane/odrzucone/zdeduplikowane dokumenty,
backlog, opóźnienie API i status źródła. Wyłączenie źródła zatrzymuje polling,
pozostawia zapisane dane i checkpoint; wznowienie wymaga kontroli dostępnej historii.

Wazuh udostępnia wdrożenia self-hosted, w tym VM. Komponenty są objęte GPLv2
oraz Apache 2.0; przed redystrybucją przypiętych obrazów sprawdzić ich LICENSE
oraz zależności. Integracja przez API nie wymaga kopiowania kodu Wazuh.
[Informacja o licencjach](https://wazuh.com/docs/legal-resources/Wazuh_Support_Terms_April_2024.pdf).
Pobieranie z lokalnych API nie potrzebuje publicznego Internetu; instalacja,
aktualizacje i usługi wzbogacania Wazuh mają oddzielne wymagania sieciowe.

### VM i kryteria zamknięcia discovery

Do testu wystarczy dedykowana instalacja laboratoryjna z managerem i Indexerem,
dashboardem do weryfikacji oraz co najmniej jednym agentem testowym. Nie ustalamy
jeszcze parametrów hosta bez wyboru sposobu instalacji i wolumenu.
[Oficjalna VM](https://documentation.wazuh.com/current/deployment-options/virtual-machine/virtual-machine.html).

Od operatora potrzebne będą: dokładna wersja, FQDN/IP obu API, dostęp sieciowy
z hosta testującego BastionDesk, publiczny certyfikat CA, konta tylko do odczytu
przekazane poza czatem i testowe dane. Dashboard nie zastępuje dostępu do obu API.

Spike ma potwierdzić:

1. TLS, uwierzytelnienie, minimalne role i odrzucenie niedozwolonych operacji.
2. Odczyt agentów i rzeczywistych alertów, formaty dat oraz mapowania indeksów.
3. Paginację ponad 10 000 rekordów, wiele identycznych timestampów i indeksów.
4. Przerwany zapis, restart, wygaśnięcie tokenu/PIT, 429/503 i częściowe wyniki.
5. Replay bez duplikatów, późne dokumenty i lukę po usunięciu historii źródła.
6. Separację dwóch organizacji i brak wycieku przy niejednoznacznym mapowaniu.
7. Zanonimizowane fixture'y, obserwowane limity oraz koszt przechowywania.

Dopiero wynik spike'u zamyka wybór interfejsów, wspieranej wersji, RBAC,
checkpointu i retencji. Wtedy powstaje zaakceptowany ADR i plan implementacji 6.x.
