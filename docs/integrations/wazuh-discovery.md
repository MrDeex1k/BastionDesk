# Discovery Wazuh — faza 6

Data przeglądu: 2026-09-24. Status: analiza dokumentacji i projekt spike'u.
Nie potwierdzono jeszcze komunikacji z rzeczywistą instalacją ani kompatybilności
adaptera. Pełne discovery pozostaje otwarte do zakończenia spike'u.

Użytkownik może przygotować dedykowaną VM na innym hoście. Nie uruchamiamy
Wazuh w głównym Compose BastionDesk. Branch prac: `feat/stage6-implement`.

## Zakres i wersje

Odczyt alertów oraz identyfikacja agentów/assetów, bez Active Response,
zmiany konfiguracji, enrollmentu i wykonywania poleceń. Właściciel domenowy:
Core; Wazuh jest wymiennym adapterem wejściowym, nie modelem domenowym.

Oficjalna dokumentacja publikuje wydanie 4.14.8 z 23 września 2026:
[release notes](https://documentation.wazuh.com/current/release-notes/release-4-14-8.html).
To kandydat do laboratorium, nie deklaracja wsparcia wszystkich wersji 4.x.
Przed spike'em zapisać dokładne wersje managera, indexera, agentów i obrazu/OVA,
sprawdzić zmiany względem faktycznie wybranej wersji oraz jej deprecacje.
Wersja bazowego OpenSearch i dostępność PIT wymagają sprawdzenia na VM.

## Interfejsy — ustalenia i propozycja

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

## Uwierzytelnianie i izolacja

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

## Kontrakt i niezawodność — projekt do potwierdzenia

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

## Retencja, eksploatacja i licencja

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

## VM i kryteria zamknięcia discovery

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
