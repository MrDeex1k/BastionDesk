# Specyfikacja etapu 6 integracji Wazuh z BastionDesk

Etap 6 udostępnia analitykom i administratorom historię alertów ich organizacji w BastionDesk. Backend odczytuje alerty na żądanie z Wazuh Indexera. Wazuh przechowuje dokumenty i ustala ich retencję. BastionDesk przechowuje konfigurację połączenia, a wyniki odczytu są dostępne tymczasowo w pamięci.

Ta specyfikacja zastępuje wcześniejsze założenia etapu 6 dotyczące trwałego ingestu, replayu i retencji po stronie BastionDesk. [Instrukcja integracji](wazuh-discovery.md) opisuje wdrożenie i zawiera historyczne notatki z discovery.

## Organizacje i uprawnienia

Każda organizacja może podłączyć jedno dedykowane źródło Wazuh. Konto integracyjne ma prawo odczytu wyłącznie indeksów alertów przeznaczonych dla tej organizacji. Etap 6 zakłada odrębne źródła dla różnych organizacji. Współdzielenie jednego źródła i dzielenie jego agentów między organizacje pozostaje poza zakresem.

| Rola w BastionDesk | Dostęp |
| --- | --- |
| Administrator organizacji | Lista alertów, szczegóły i pełny JSON oraz konfiguracja źródła organizacji |
| Analityk | Lista alertów, szczegóły i pełny JSON źródła organizacji |
| Pracownik | Dotychczasowe funkcje BastionDesk |

Backend sprawdza bieżącą sesję, rolę i aktywną organizację przy każdym odczycie oraz przy każdej operacji na konfiguracji. Identyfikator źródła, dokumentu ani organizacji podany przez klienta nie nadaje dostępu. Identyfikator agenta ma znaczenie w obrębie źródła. Widok pokazuje jego nazwę i ID w Wazuh. Osobny rejestr zasobów, korelacja z innymi źródłami i automatyczne reakcje są poza zakresem tego etapu.

## Podłączenie i obsługa źródła

W kreatorze administrator organizacji podaje adres HTTPS Indexera, nazwę użytkownika konta tylko do odczytu, hasło oraz opcjonalny publiczny certyfikat CA dla prywatnej infrastruktury. Administrator sam wybiera adres Indexera. Wdrożenie nie wymaga wcześniejszego rejestrowania każdego docelowego hosta na liście dozwolonych adresów.

Przycisk **Sprawdź połączenie** uruchamia z backendu próbę połączenia, weryfikację TLS i ograniczone wyszukiwanie alertów. Komunikat rozróżnia błąd połączenia, certyfikatu, uwierzytelnienia i uprawnień. Pusta lista jest poprawnym wynikiem udanego zapytania. Kreator aktywuje wyłącznie konfigurację, która przeszła test. Jeśli test zmienionych ustawień się nie powiedzie, poprzednia aktywna konfiguracja nadal obsługuje odczyty.

Istniejący pusty indeks także przechodzi próbę otwarcia i zamknięcia PIT. Przy braku indeksów weryfikacja kończy się na udanym wyszukiwaniu. Wszystkie etapy weryfikacji mają wspólny limit 10 sekund. Zapis, przełączenie i usunięcie sprawdzają rewizję źródła widoczną w formularzu. Konflikt wymaga wczytania aktualnej konfiguracji.

BastionDesk zapisuje konfigurację dla danej organizacji, w tym zaszyfrowane hasło. Klucz szyfrowania znajduje się poza bazą. Panel i odpowiedzi API nie ujawniają zapisanego hasła. Przy zmianie adresu administrator podaje hasło ponownie. Hasło i CA są używane wyłącznie dla przypisanego połączenia.

- **Wyłącz** zatrzymuje odczyty i zachowuje konfigurację. Ponowne włączenie wymaga udanego testu.
- **Usuń** wymaga potwierdzenia i usuwa konfigurację wraz z zapisanym hasłem. Operacja dotyczy wyłącznie BastionDesk.
- Po wyłączeniu, usunięciu lub podmianie źródła widok odrzuca wyniki z poprzedniej konfiguracji i pokazuje aktualny stan integracji.

### Połączenie w sieci firmowej

Pracownik korzysta z dotychczasowego dostępu do BastionDesk przez sieć firmową lub firmowy VPN. Odczyt wykonuje backend w kontenerze, którego sieć musi zapewniać trasę do prywatnego adresu VM z Wazuh. Wdrożenie referencyjne obejmuje taki dostęp oraz certyfikat pasujący do adresu używanego przez backend.

Dowolność wyboru Indexera obejmuje prywatne adresy i nazwy dostępne w sieci wdrożenia. Backend akceptuje wyłącznie połączenia HTTPS z weryfikacją certyfikatu i tożsamości hosta. Próba połączenia używa ustalonej ścieżki wyszukiwania i nie podąża za przekierowaniami. Walidacja obejmuje adres faktycznego połączenia, także po rozwiązaniu DNS. Połączenia do loopbacku, adresów link-local i metadanych infrastruktury oraz usług chronionych w danym wdrożeniu muszą być zablokowane. Wdrożenie ogranicza ruch wychodzący czytnika do sieci, w których działają źródła Wazuh. Te zabezpieczenia obowiązują zarówno podczas konfiguracji, jak i zwykłego odczytu.

## Lista i szczegóły alertów

Analityk i administrator widzą listę posortowaną od najnowszych alertów. Domyślny zakres to ostatnie 24 godziny. Zmiana zakresu pozwala przeglądać historię dostępną w Wazuh. Filtr poziomu ma opcję **Wszystkie** oraz dokładne wartości `0–16` odpowiadające polu `rule.level`. Filtry działają na zapytaniu do Indexera, także podczas stronicowania.

Lista pokazuje czas, poziom, regułę i agenta. Szczegóły obejmują również opis reguły oraz identyfikator dokumentu i indeks. Przycisk **Pokaż JSON** odczytuje na żądanie pełny dokument `_source` z Wazuh. Interfejs wyświetla go jako tekst i pokazuje obok jego `_index` oraz `_id`. Gdy dokument zniknął wskutek retencji, widok informuje, że nie jest już dostępny w źródle. Zwykła odpowiedź listy zawiera tylko pola potrzebne do wyświetlenia tabeli.

Alert w BastionDesk ma tożsamość wynikającą ze źródła, indeksu (`_index`) i ID dokumentu (`_id`). Odczyt zastępuje bieżącą stronę. Przy przechodzeniu między stronami w tym samym przeglądaniu kolejność musi pozostać stabilna także dla alertów o identycznym czasie. Niekompletna odpowiedź Indexera jest błędem odczytu. Widok rozróżnia ją od poprawnej pustej listy i pozwala ponowić zapytanie.

## Odświeżanie i pamięć podręczna

TanStack Query zarządza zapytaniami i przechowuje wyniki w pamięci przeglądarki. Klucz obejmuje sesję, organizację, źródło i parametry zapytania. TanStack Table używa tożsamości alertu jako klucza wiersza. Żądania listy i pełnego JSON mają politykę HTTP `private, no-store`. Żadna treść alertu nie trafia do trwałego cache przeglądarki, bazy BastionDesk ani logów aplikacji.

Widok pobiera dane przy wejściu, zmianie filtrów lub strony oraz po kliknięciu **Odśwież**. Na pierwszej stronie najnowszych wyników, gdy karta przeglądarki i widok alertów są aktywne, lista odświeża się automatycznie. Podczas przeglądania starszych stron albo wybranego historycznego zakresu lista pozostaje na miejscu. Ręczne odświeżanie jest dostępne w obu trybach.

Backend udostępnia klientowi interwał z `WAZUH_REFRESH_INTERVAL_SECONDS`. Domyślnie wynosi on `60` sekund, `0` wyłącza automatyczne odświeżanie. To ustawienie całej instalacji, stosowane bez przebudowy frontendu. Zmiana sesji, organizacji lub źródła nie może wyświetlić wyników z poprzedniego kontekstu.

## Kryteria odbioru

- [x] **WAZ-01 — Konfiguracja i pierwsze użycie.** Administrator zapisuje ustawienia dedykowanego Wazuh przez kreator. Test z sieci backendu przechodzi po zweryfikowanym TLS, również wtedy, gdy wyszukiwanie zwróci pustą listę. Analityk otwiera widok przez zwykły adres BastionDesk w sieci firmowej lub przez VPN.
- [x] **WAZ-02 — Uprawnienia i izolacja.** Administrator i analityk tej samej organizacji odczytują te same alerty. Pracownik, niezalogowany użytkownik oraz użytkownik drugiej organizacji nie uzyskują do nich dostępu przez listę ani szczegóły, także po skopiowaniu adresu lub ID dokumentu. Zmiana organizacji w tej samej przeglądarce nie pokazuje starych wyników.
- [x] **WAZ-03 — Test i cykl życia połączenia.** Kreator rozróżnia błędny adres, niezaufany certyfikat, błędne dane logowania i brak uprawnienia do odczytu. Nieudana zmiana nie przerywa poprzedniego połączenia. Wyłączenie zatrzymuje odczyty, ponowne włączenie przywraca je po teście, a usunięcie po potwierdzeniu usuwa lokalne ustawienia i hasło. Alerty w Wazuh pozostają dostępne.
- [x] **WAZ-04 — Istniejący alert Ubuntu w widoku analityka.** Test wykorzystuje rzeczywisty alert zarejestrowany w Wazuh przez agenta Ubuntu `001`. W BastionDesk widać tę samą nazwę i ID agenta, czas oraz regułę. **Pokaż JSON** wykonuje osobny odczyt i pokazuje pełny dokument zgodny z wynikiem Wazuh dla tego samego indeksu i ID.
- [x] **WAZ-05 — Filtry, strony i powtórzenie odczytu.** Domyślny zakres obejmuje ostatnie 24 godziny. **Wszystkie** obejmuje wszystkie poziomy, a wybór poziomu zwraca wyłącznie dokładne dopasowania. Przejście na kolejną stronę zachowuje filtry. Zestaw większy niż jedna strona, także z identycznymi czasami w kilku indeksach, można przejrzeć bez powtórzeń i pominięć. Dwa odświeżenia tego samego alertu pozostawiają jeden wiersz.
- [x] **WAZ-06 — Odświeżanie i awaria.** Nowy alert pojawia się na aktywnej pierwszej stronie bez kliknięcia, przy domyślnym odpytywaniu co 60 sekund. Zmiana zmiennej środowiskowej zmienia interwał bez przebudowy WEB, a `0` pozostawia tryb ręczny. Przerwa w dostępności Indexera daje komunikat o błędzie, a ponowienie po przywróceniu połączenia odzyskuje wyniki. Starsza strona i nieaktywna karta nie uruchamiają okresowego odczytu.
- [x] **WAZ-07 — Dane, sekrety i ruch sieciowy.** Po teście lista i pełne dokumenty istnieją trwale wyłącznie w Wazuh. Baza BastionDesk zawiera konfigurację i zaszyfrowane hasło, a odpowiedzi API i logi nie ujawniają hasła. Próba odczytu przez niedozwolony typ adresu, przekierowanie lub nieprawidłowy TLS jest odrzucana. Poprawny prywatny adres Indexera działa przy zaufanym CA.

WAZ-04 wymaga istniejącego alertu z rzeczywistego Indexera i sprawdzenia widoku przeglądarkowego. Kontrolowane dane testowe mogą uzupełniać scenariusze dwóch organizacji, zbieżnych znaczników czasu i błędów sieciowych. Testy samego adaptera i tabeli stanowią dowód częściowy.

## Ustalenia implementacyjne

API BastionDesk zwraca do 50 alertów na stronę. Point in Time i `search_after`
utrzymują kolejność po czasie malejąco, indeksie rosnąco i ID dokumentu rosnąco.
Kontekst wyszukiwania wygasa po dwóch minutach bez odczytu. Odczyt pierwszej
strony zamyka poprzedni kontekst danego widoku i unieważnia jego kursory.
Każda otwarta zakładka ma osobny kontekst. Po wygaśnięciu widok pozwala wrócić
na pierwszą stronę. Odczyt i operacje PIT sprawdzono
na Indexerze opartym na OpenSearch 2.19.6.
[Kontrakt API](../backend/api.md#wazuh-api) · [Konfiguracja i uprawnienia](wazuh-discovery.md#wdrożenie-etapu-6).

## Wyniki odbioru w laboratorium

| Kryterium | Dowód |
| --- | --- |
| WAZ-01 | Administrator skonfigurował źródło w Chromium. Backend w kontenerze połączył się z rzeczywistym Indexerem przez prywatną trasę Tailscale, z weryfikacją CA i nazwy z certyfikatu. Przypadek pustego indeksu sprawdzono na danych kontrolowanych. |
| WAZ-02 | W przeglądarce administrator i analityk otrzymali te same szczegóły. Pracownik i użytkownik bez sesji otrzymali odmowę. Po zmianie aktywnej organizacji w tej samej przeglądarce skopiowane adresy zwracały 403, a widok przestał wyświetlać alerty poprzedniej organizacji. |
| WAZ-03 | Test przeglądarkowy sprawdził odrzucony adres, nieprawidłowe hasło, niezaufany certyfikat, zachowanie działającego źródła po błędzie i cykl wyłączenia, włączenia oraz potwierdzenia usunięcia. Przypadki odmowy uprawnień i nieudanej ponownej aktywacji sprawdzono z kontrolowaną odpowiedzią Indexera. |
| WAZ-04 | Test E2E w Chromium przeszedł na aktualnym kodzie 21 listopada 2026 r. na istniejącym alercie agenta Ubuntu `001` z rzeczywistego Indexera. Potwierdził zgodność nazwy i ID agenta, czasu oraz reguły. **Pokaż JSON** wysłał osobne żądanie i wyświetlił identyczny dokument `_source` dla tego samego indeksu i ID. Po dwóch odświeżeniach alert nadal zajmował jeden wiersz. |
| WAZ-05 | Test HTTP przeszedł 70 dopasowań o tym samym czasie w dwóch indeksach, z powtarzającymi się ID dokumentów. Sprawdzono ostatnie 24 godziny, dokładny poziom i stały zakres między stronami. Dwa odświeżenia rzeczywistego alertu pozostawiły jeden wiersz. |
| WAZ-06 | Test zegara Chromium wykazał pojawienie się nowego testowego alertu po 60 sekundach, konfigurację 30 sekund i tryb ręczny przy 0. Starsza strona, zakres historyczny i nieaktywna karta nie wykonywały odpytywania. Kontrolowany błąd odczytu i ponowienie przywróciły tabelę. |
| WAZ-07 | Test z PostgreSQL potwierdził migrację i zapis wyłącznie konfiguracji wraz z zaszyfrowanym hasłem. Test TLS wykazał blokadę przekierowania i nieprawidłowej nazwy certyfikatu. Sprawdzono blokadę adresów chronionych, logi aplikacji i nagłówek `private, no-store` na odpowiedzi dla przeglądarki. |

Polecenia odtworzenia testów i konfigurację środowiska opisuje [instrukcja wdrożenia](wazuh-discovery.md#odbiór-z-rzeczywistym-wazuh).
