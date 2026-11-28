# Faza 8 — korelacja i scoring ryzyka

Specyfikacja zapisuje uzgodnienia Q1–Q24. Obejmuje dwie ścieżki triage, reguły
sugestii, decyzje analityka, ocenę ryzyka i kryteria odbioru. Punktem wyjścia są
[odczyt alertów Wazuh z fazy 6](wazuh-stage-6-spec.md) i IOC dostępne po
[fazie 7](../future-soar-platform.md#faza-7--ioc-threat-intelligence-i-artefakty).

## Zgłoszenie, alert i incydent

- **Zgłoszenie** to sprawa widoczna dla pracownika. Zachowuje dotychczasowy
  identyfikator, autora, status, historię, odpowiedzi i kontrakt API.
- **Alert Wazuh** to dokument źródłowy rozpoznawany przez organizację,
  źródło Wazuh, indeks i ID dokumentu. **Zdarzenie bezpieczeństwa** opisuje
  obserwację z alertu i zachowuje jej pochodzenie.
- **Zasób** to urządzenie obsługiwane w organizacji. Odwołanie do agenta
  obejmuje organizację, źródło Wazuh i ID agenta.
- **Incydent** to sprawa robocza analityka. Może obejmować kilka zgłoszeń
  pracowników, kilka alertów Wazuh i wyniki analizy ich dowodów.

Incydent i każde zgłoszenie mają niezależne statusy. Zamknięcie incydentu
pozostawia zgłoszenia w ich bieżących stanach. Pracownik widzi status i odpowiedzi
przy własnym zgłoszeniu. Dostęp do zbiorczego incydentu, innych zgłoszeń, alertów
Wazuh, sugestii i oceny ryzyka mają uprawnieni członkowie zespołu analitycznego.

## Ścieżki analityka

1. **Ze zgłoszenia pracownika.** Analityk może przejrzeć sugestie Wazuh lub
   ręcznie znaleźć alert i powiązać go ze zgłoszeniem w incydencie.
2. **Z alertu Wazuh.** Przycisk **Utwórz incydent** otwiera krótki formularz
   z proponowanym tytułem, dostępnymi danymi agenta i dołączonym alertem
   źródłowym. Analityk może poprawić tytuł i dodać notatkę. Zapis tworzy
   incydent z tym alertem także wtedy, gdy pracownik niczego nie zgłosił.
   Ze szczegółów alertu analityk może również ręcznie powiązać istniejące
   zgłoszenie. Oba kierunki prowadzą do tych samych powiązań i historii.
3. **Decyzja o powiązaniu.** System wyszukuje kandydatów i pokazuje powód
   sugestii, dane źródłowe oraz pewność dopasowania. Powiązanie powstaje po
   decyzji uprawnionej osoby. Może ona zaakceptować lub odrzucić sugestię,
   ręcznie dołączyć dowód, odpiąć go albo przenieść do innego incydentu.

## Uprawnienia, przenoszenie i historia

- Zgłoszenie i alert mogą mieć po jednym aktywnym przypisaniu do incydentu.
  Aktywne powiązanie trwa do odpięcia lub przeniesienia dowodu. Przy ponownej
  próbie utworzenia incydentu z zajętego alertu otwiera się istniejący
  incydent, jeśli użytkownik ma do niego dostęp.
- Powiązania zmienia przypisany analityk lub administrator swojej organizacji.
  Nieprzypisany incydent analityk może przejąć zgodnie z obecnym obiegiem.
  Zmiana powiązania przypisanego zgłoszenia wymaga także prawa do zapisu tego
  zgłoszenia. Nieprzypisane zgłoszenie może powiązać analityk organizacji.
  Przeniesienie wymaga uprawnienia do obu incydentów. Równoległe próby
  przypisania tego samego dowodu kończą się jednym aktywnym powiązaniem.
- Przeniesienie jest jedną operacją. Historia zachowuje źródłowy i docelowy
  incydent, aktora, czas i uzasadnienie. Po odpięciu lub przeniesieniu
  ostatniego dowodu incydent nadal istnieje. Widok pokazuje **Brak dowodów**
  i **Brak oceny**. Analityk może dodać kolejny dowód lub zakończyć sprawę.
- Dołączenie dowodu do zamkniętego incydentu wymaga jawnego wznowienia
  z powodem. W tym samym trybie obsłużymy odpięcie i przeniesienie dowodu
  z zamkniętej sprawy, tak aby zachować stan udokumentowany przy zamknięciu.
- Po zatwierdzeniu powiązania BastionDesk zachowuje minimalny zapis potrzebny
  do odtworzenia decyzji. Obejmuje on referencję źródła i alertu, czas,
  regułę źródłową oraz wartości użyte w korelacji i ocenie. Pełny dokument
  jest dostępny w Wazuh według retencji źródła. Po jego wygaśnięciu lokalne
  uzasadnienie i historia nadal są dostępne dla uprawnionych osób.

## Reguły i uruchamianie korelacji

- Pierwsza wersja proponuje powiązanie przy zgodności potwierdzonego zasobu
  lub identycznego SHA-256 zapisanego w metadanych załącznika i w alercie,
  w granicach okna czasu.
  IP, hostname i użytkownik wspierają uzasadnienie. Ich samodzielna zgodność
  nie tworzy sugestii. W opisie zgłoszenia nazwa urządzenia pomaga analitykowi
  wyszukać zasób. Potwierdzenie następuje po wyborze agenta Wazuh dostępnego
  w organizacji przez uprawnionego analityka. Reguła przyznaje 80 punktów
  pewności za zgodność zasobu, 95 za zgodność hasha i 100 za oba sygnały.
- Domyślne okno wynosi **±24 godziny**. Dla zgłoszenia punktem odniesienia
  jest czas jego utworzenia. Dla incydentu rozpoczętego z Wazuh jest nim czas
  zdarzenia w alercie źródłowym. Wielkość okna należy do konfiguracji reguły.
  `CORRELATION_WINDOW_HOURS` przyjmuje od 1 do 168 godzin. Ręczne powiązanie
  jest możliwe także poza tym oknem. Wyszukiwarka pokazuje ostatnie 30 dni,
  a po dokładnym ID dokumentu znajduje również starszy alert w retencji źródła.
- Nowe zgłoszenie, potwierdzenie zasobu lub zapis incydentu z alertu zleca
  wyszukiwanie dostępnych dopasowań w tle. Późniejsze alerty można uwzględnić
  przez **Ponów analizę**.
  Automatyczna reakcja na strumień napływających alertów jest poza zakresem
  tej wersji. Niedostępność Indexera wstrzymuje odczyt z tego źródła, a sprawa
  pozostaje dostępna do ręcznej obsługi.
- Worker korzysta z trwałej kolejki PostgreSQL, z dzierżawą i deduplikacją
  według organizacji, rodzaju i ID celu. Pobiera do 50 kandydatów Wazuh na
  przebieg, od trafień SHA-256. Korelacja z alertu wykorzystuje indeksy
  potwierdzonych agentów i hashy załączników. Po czterech błędach zadanie
  można ponowić ręcznie. Każda sugestia
  zachowuje organizację, parę dowodów, identyfikator źródła, czas, zastosowane
  sygnały i wersję reguły.
- Odrzucenie pozostaje przypisane do konkretnej pary dowodów. Ponowna analiza,
  również według nowej wersji reguł, zachowuje tę decyzję. Uprawniona osoba
  może ją zmienić ręcznie. Nowy alert może pojawić się jako inna sugestia.
  Zmiana potwierdzonego zasobu wygasza oczekujące sugestie zależne od starego
  zasobu. Przy akceptacji backend ponownie sprawdza sygnały i pochodzenie alertu.

## Ocena ryzyka

| Wartość | Znaczenie |
| --- | --- |
| `severity` | Ważność zdarzenia według źródła, np. `rule.level` z Wazuh. |
| `confidence` | Siła podstaw do powiązania zgłoszenia z alertem. |
| `risk score` | Priorytet obsługi na podstawie potwierdzonych dowodów, ważności zasobów i dostępnych wyników analizy. |

Sugestia pokazuje `severity` i `confidence`. Wynik zasugerowanego alertu
wpływa na ryzyko po zaakceptowaniu powiązania. Samo zgłoszenie może mieć ocenę
opartą na swoich dostępnych dowodach. Brak danych do obliczenia oznacza **Brak
oceny**. `0` jest prawidłową wartością tylko wtedy, gdy wynika z obliczeń.

Powtórzenia tego samego sygnału zwiększają ocenę tylko raz. Niezależny dowód,
np. potwierdzenie YARA lub drugi dotknięty zasób, może zmienić priorytet.
Ocena zapisuje wersję reguł, odwołania do dowodów i wkład poszczególnych
sygnałów. Szczegóły pokazują wynik liczbowy, poziom opisowy i uzasadnienie.
Kolejka pokazuje poziom opisowy. Opcjonalne sortowanie używa wartości liczbowej
i umieszcza przypadki bez oceny po ocenionych. Dotychczasowa kolejność pozostaje
domyślna do czasu kalibracji.

Kolejka udostępnia filtr statusu oraz strony po 50 incydentów. Historia operacji
i historia ocen są pobierane po rozwinięciu sekcji, po 25 wpisów.

Wyjściowa wersja `soc-risk-v1` liczy trzy punkty za każdy poziom najwyższej
reguły Wazuh, po 10 za maksymalnie dwa dodatkowe zasoby i po 25 za maksymalnie
dwa różne SHA-256 z trafieniem YARA. Threat Intelligence wnosi maksymalnie 40
punktów, z uwzględnieniem najsilniejszego wyniku dla każdego wskaźnika. Wynik
jest ograniczony do 100 punktów. Progi średniego, wysokiego i krytycznego ryzyka
wynoszą 20, 45 i 75 punktów. Każdy potwierdzony zasób ma w tej wersji taką samą
wagę. To wartości wyjściowe do kalibracji na danych SOC.

W otwartym incydencie ryzyko jest przeliczane po dołączeniu, odpięciu lub
przeniesieniu potwierdzonego dowodu oraz po otrzymaniu nowego wyniku YARA lub
Threat Intelligence dla takiego dowodu. Przeniesienie aktualizuje oba
incydenty. Historia zachowuje poprzednią ocenę i przyczynę zmiany. W zamkniętym
incydencie pozostaje ocena z chwili zamknięcia, a nowy wynik jest oznaczony
w widoku. Jawne wznowienie uruchamia przeliczenie i zapisuje jego przyczynę.

## Kolejność wdrożenia

1. Model incydentu, dowodów i historii oraz migracja zachowująca istniejące
   zgłoszenia. Kontrakty API i uprawnienia dla obu ścieżek wejścia.
2. Ręczne powiązania z obu widoków i formularz utworzenia incydentu z alertu.
   Przypadki równoległego przypisania, przeniesienia, ostatniego dowodu i wznowienia.
3. Pierwsza wersja reguł na oznaczonych danych. Analiza na żądanie, potem
   automatyczne zlecanie w dwóch uzgodnionych punktach wejścia.
4. Obliczanie i historia ryzyka, prezentacja w szczegółach i opcjonalne
   sortowanie kolejki. Kalibracja i ocena na niezależnym zestawie odbiorczym.
5. Odbiór obu ścieżek w aplikacji i udokumentowanie wyników, w tym trafień,
   pomyłek, pominięć i przypadków wymagających ręcznej decyzji.

Test AbuseIPDB na żywo i wykorzystanie wyników skanów z Wazuh pozostają osobnymi
punktami odbioru fazy 7. W fazie 8 korzystamy z dostępnego odczytu alertów i
wyników analizy. Playbooki i aktywna reakcja należą do faz 9 i 10.

## Kryteria odbioru

| ID | Scenariusz zaliczenia |
| --- | --- |
| COR-01 | Dwa istniejące zgłoszenia i kilka alertów trafiają do jednego incydentu. Podpięcie alertu do zgłoszenia oraz zgłoszenia do alertu daje ten sam zapis. Numery, autorzy, statusy i historia zgłoszeń pozostają dostępne. |
| COR-02 | Analityk może zapisać incydent z formularza alertu bez zgłoszenia pracownika. Ponowna próba dla tego samego przypisanego alertu otwiera istniejący incydent. |
| COR-03 | Odczyt danych i zapis decyzji są ograniczone do organizacji i roli. Pracownik widzi własne zgłoszenie. Obca organizacja, pracownik i nieuprawniony analityk nie zmieniają przypisania. Przeniesienie wymaga dostępu do obu incydentów. |
| COR-04 | Równoległe operacje zachowują najwyżej jedno aktywne przypisanie, a przeniesienie pozostawia pełną historię. Po odpięciu ostatniego dowodu incydent istnieje i ma stan bez dowodów i oceny. |
| COR-05 | Potwierdzony zasób lub wspólny SHA-256 w oknie tworzy sugestię. Sam wspólny IP, hostname lub użytkownik jej nie tworzy. Przypadki graniczne sprawdzają oba punkty odniesienia, opóźniony alert i ręczne powiązanie poza oknem. |
| COR-06 | Nowe zgłoszenie i utworzenie incydentu z alertu zlecają korelację. Ponowiona dostawa nie dubluje skutku. Ręczne ponowienie uwzględnia nowy alert, zachowuje odrzucenia i nie nadpisuje ręcznych decyzji. Awaria Indexera nie blokuje triage. |
| COR-07 | Po wygaśnięciu dokumentu w Wazuh da się odtworzyć uzasadnienie decyzji z zapisanego minimum danych. Widoczne są źródło, czas, sygnały i wersja reguły. |
| COR-08 | `severity`, `confidence` i `risk score` są odrębne. Sugestia wpływa na ryzyko po akceptacji. Powtórzony sygnał liczy się raz, a przypadki bez oceny sortują się po przypadkach ocenionych. |
| COR-09 | Zmiana potwierdzonego dowodu lub jego wyniku aktualizuje ocenę otwartej sprawy z zachowaniem historii. Zamknięta sprawa zachowuje ocenę i pokazuje nowy wynik. Wznowienie wymaga powodu i przelicza ocenę. Zamknięcie sprawy nie przestawia statusów zgłoszeń. |
| COR-10 | Migracja zachowuje istniejące zgłoszenia. Powtórzenie oceny z tymi samymi danymi i wersją reguł daje ten sam wynik. Odbiór raportuje precision, recall, fałszywe trafienia i pominięcia na oddzielnym zestawie danych. |

## Walidacja reguł

Oddzielny syntetyczny zestaw odbiorczy zawiera 10 par zgłoszenie–alert.
Reguła dała 4 poprawne sugestie, 4 poprawne pominięcia, 1 fałszywą sugestię
i 1 przeoczone dopasowanie. Precision i recall wyniosły po 80% na tym zestawie.
Fałszywa sugestia połączyła niezależne użycia tego samego pliku. Przeoczone
dopasowanie miało tylko wspólny adres IP i wymaga ręcznej decyzji. Pomiar na
oznaczonych alertach SOC i kalibracja wag ryzyka pozostają do wykonania.

## Odbiór integracyjny

`bun run test:core:db` stosuje migracje 0001–0009 do kopii schematu 1.0.3
i porównuje istniejące zgłoszenia i ich historię. Sprawdza też równoległe
tworzenie incydentu, decyzje o sugestiach, izolację organizacji, powiązanie
wielu dowodów, przeniesienie i zachowanie oceny po zamknięciu i wznowieniu.

Scenariusz Flashwright WAZ-04 w Chromium sprawdza na testowym Indexerze
utworzenie incydentu z alertu, wyszukanie dokumentu i podpięcie zgłoszenia.
Przy alercie z ostatnich 24 godzin sprawdza również automatyczne zlecenie
i sugestię po potwierdzeniu agenta. Testy komponentowe pokrywają obsługę
powiązania z obu widoków.
