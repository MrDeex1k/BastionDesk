# Faza 7 — lokalne skanowanie załączników YARA

Pierwsza demonstracja obejmuje automatyczny skan nowych załączników do zgłoszeń
i zarządzanie regułami przez administratora. Po jej odbiorze analityk i
administrator otrzymają przycisk **Przeskanuj plik** dla starszych załączników.
Odbiory Core i messagingu mogą przebiegać równolegle z tymi pracami.

Skan obejmuje pole **Załącznik**. Pole **Zrzut ekranu** korzysta z dotychczasowego
wewnętrznego obiegu zgłoszenia. Treść zrzutów i załączników pozostaje w
BastionDesk, a izolowany worker otrzymuje wyłącznie pliki z pola **Załącznik**.
Odczyt wyników Wazuh, VirusTotal i pozostałe funkcje Threat Intelligence
mają własny zakres w [roadmapie fazy 7](../future-soar-platform.md#faza-7--ioc-threat-intelligence-i-artefakty).

## Status skanu i dostęp do pliku

| Stan załącznika | Pobranie przez użytkownika z dostępem do zgłoszenia |
| --- | --- |
| Starszy załącznik, dla którego jeszcze nie zlecono skanu | Dostępne na dotychczasowych zasadach. |
| Oczekuje na skan, trwa skan lub zaplanowano ponowienie | Zablokowane. |
| Brak dopasowań według aktywnej wersji reguł | Dostępne. |
| Dopasowanie według aktywnej wersji reguł | Zablokowane dla wszystkich ról. |
| Błąd końcowy | Zablokowane. Analityk i administrator mogą ponowić zlecenie. |
| Wynik ze starszej wersji reguł | Pierwsza uprawniona próba pobrania lub ręczne zlecenie inicjuje skan według aktywnej wersji. Pobranie wymaga aktualnego wyniku bez dopasowań. |

Skanowanie, dopasowanie i błąd wpływają na pobranie załącznika. Zgłoszenie
można utworzyć i dalej obsługiwać w każdym z tych stanów. Analityk i administrator
widzą stan skanu, źródło lokalnego wyniku, SHA-256, czas zakończenia, wersję reguł
oraz identyfikatory dopasowanych reguł dla zgłoszeń w swojej organizacji.
Pracownik widzi krótki komunikat o stanie własnego pliku. Reguły organizacji
dodaje i wyłącza jej administrator.

## Krok 1 — automatyczny skan nowych załączników

1. **Ustalić sposób uruchomienia YARA.** Sprawdzić wspieraną wersję silnika,
   sposób dostarczania własnych reguł BastionDesk i warunki ich dystrybucji.
   Przygotować wersjonowany zestaw bazowy i nieszkodliwe pliki testowe dla
   dopasowania oraz braku dopasowań. Krok kończy się lokalnym przebiegiem obu
   przypadków i zapisem wersji silnika oraz zestawu.
2. **Zapisać stan i zlecenie skanu.** Wykorzystać SHA-256 zapisany przy przesłaniu
   pliku. W transakcji zapisu zgłoszenia powiązać nowy załącznik z istniejącym
   wynikiem lub zadaniem, albo utworzyć zadanie z dostarczeniem przez outbox.
   Kolejkę i obsługę prób oprzeć na [wzorcu trwałych zadań](../adr/0005-durable-jobs.md).
   Organizacja, SHA-256, metoda i wersja zestawu wyznaczają granicę ponownego
   użycia. Krok kończy się testem równoległych przesłań i odzyskania zadania po
   chwilowej niedostępności RabbitMQ.
3. **Uruchomić izolowany worker.** Worker pobiera uprawniony obiekt z
   wewnętrznego storage, skanuje konkretną wersją zestawu i trwale zapisuje
   wynik. Walidacja reguł i skan mają ograniczenia czasu i zasobów. Dostęp
   sieciowy workera obejmuje usługi wewnętrzne potrzebne do obsługi zadania.
   Przejściowe błędy mają ograniczoną liczbę prób. Ręczne ponowienie po błędzie
   korzysta z tego samego przepływu, a równoległe żądania współdzielą bieżącą próbę.
   Krok kończy się sprawdzeniem dopasowania, braku dopasowań, automatycznego retry
   i widocznego błędu po wyczerpaniu prób.
4. **Dodać reguły organizacji.** Administrator dodaje reguły do zestawu
   BastionDesk. Po poprawnej kompilacji całości system atomowo aktywuje nową,
   zapisaną wersję dla tej organizacji. Odrzucona zmiana zachowuje dotychczasową
   wersję. Wyłączenie reguł organizacji przywraca zestaw BastionDesk. Wyniki
   zapisują faktyczną wersję użytą do skanu, także wtedy, gdy aktywna wersja
   zmieni się w trakcie zadania. Krok kończy się testem poprawnej i odrzuconej
   aktywacji, wyłączenia reguł i odczytu historii wyniku.
5. **Podłączyć pobieranie i kafelek załącznika.** Backend sprawdza uprawnienia
   i aktualność dopuszczającego wyniku przy każdym pobraniu. Dotyczy to wszystkich
   tras załącznika, w tym ścieżki, która obecnie zwraca podpisany URL MinIO.
   Link dla pliku podlegającego skanowaniu ma prowadzić przez backend sprawdzający
   bieżący stan. Kafelek pokazuje status właściwy dla roli i pozwala ponowić
   skan po błędzie uprawnionej osobie. Krok kończy się testem E2E od przesłania
   pliku do wyniku i próby pobrania, również po zmianie reguł.

### Kryteria odbioru kroku 1

| ID | Warunek zaliczenia |
| --- | --- |
| YARA-01 | Nowe zgłoszenie z załącznikiem zapisuje się podczas oczekiwania na skan i pozostaje dostępne do obsługi. Zgłoszenie zawierające tylko zrzut nie tworzy zadania YARA, a zrzut nie jest wejściem workera. |
| YARA-02 | Nieszkodliwy plik testowy bez dopasowań staje się dostępny po skanie. Pliku oczekującego, skanowanego, dopasowanego lub z błędem końcowym nie można pobrać przez żadną trasę ani za pomocą wcześniej zwróconego linku aplikacji. |
| YARA-03 | Analityk i administrator widzą szczegóły skanu w swojej organizacji. Pracownik widzi status własnego pliku. Próby odczytu wyniku obcego zgłoszenia lub innej organizacji oraz próby zarządzania regułami przez inną rolę są odrzucane. |
| YARA-04 | Identyczne pliki przesłane równolegle w jednej organizacji i wersji reguł współdzielą jedno zadanie. Kolejne przesłanie może wykorzystać ukończony wynik. Druga organizacja ani inna wersja reguł nie przejmuje wyniku. |
| YARA-05 | Przerwa w działaniu brokera lub restart workera nie gubi zlecenia. Przejściowy błąd uruchamia ograniczone ponowienia. Po ich wyczerpaniu widoczny jest błąd, a analityk i administrator mogą zlecić ponowienie. Ponowne dostarczenie komunikatu nie dubluje skutku. |
| YARA-06 | Poprawne reguły organizacji działają łącznie z regułami BastionDesk tylko w tej organizacji. Błędne reguły nie zmieniają aktywnego zestawu. Wyłączenie reguł organizacji przywraca zestaw BastionDesk, a wynik historyczny zachowuje używaną wówczas wersję. |
| YARA-07 | Po zmianie aktywnego zestawu próba pobrania pliku z nieaktualnym wynikiem uruchamia analizę lub wykorzystuje wynik dla aktywnej wersji. Plik wraca do pobrania wyłącznie po aktualnym wyniku bez dopasowań. Spóźniony wynik starej wersji nie znosi blokady. |
| YARA-08 | Po wdrożeniu kroku 1 starsze załączniki bez zlecenia skanu są nadal dostępne według dotychczasowych uprawnień. |

## Krok 2 — ręczny skan starszych załączników

1. **Zamknąć dostęp przez stare linki MinIO.** Przed udostępnieniem przycisku
   przenieść także pobieranie starszych załączników na ścieżkę z kontrolą w
   backendzie. [Obecny endpoint](../../backend/src/adapters/core-file-http.ts)
   wydaje podpisane adresy MinIO ważne przez godzinę. Wcześniej wydane adresy
   muszą wygasnąć lub zostać unieważnione przed uruchomieniem ręcznego
   skanowania. Krok kończy się sprawdzeniem pobrania starego pliku przez
   aplikację i odrzucenia uprzednio wydanego adresu MinIO.
2. **Dodać ręczne zlecenie i akcję w kafelku.** Analityk i administrator widzą
   przycisk **Przeskanuj plik** przy starszym załączniku bez skanu. Mogą także
   ręcznie zlecić odświeżenie nieaktualnego wyniku. Dla starszej metadanej bez
   SHA-256 ustalić go z zapisanego obiektu przed ponownym użyciem wyników.
   Zapis zlecenia włącza kontrolę skanu dla pliku. Gdy istnieje już ważny wynik
   bez dopasowań, plik może być dostępny od razu. Krok kończy się testem E2E
   akcji, konkurencyjnych zleceń i pobierania w zależności od wyniku.

### Kryteria odbioru kroku 2

| ID | Warunek zaliczenia |
| --- | --- |
| YARA-09 | Starszy załącznik pozostaje dostępny przed zleceniem. Po zleceniu z kafelka, przy braku ważnego wyniku, pobranie jest zablokowane do czasu wyniku bez dopasowań. Stary podpisany URL MinIO nie omija blokady. |
| YARA-10 | Tylko analityk i administrator mogą zlecić skan załącznika z własnej organizacji. Dwa zlecenia i pobranie wywołane w tym samym czasie respektują wspólny stan. Równoległe zlecenia skanu dla tej samej zawartości i wersji reguł współdzielą zadanie. |
| YARA-11 | Starszy plik bez SHA-256 w metadanych przechodzi pełny skan. Po ustaleniu hasha może wykorzystać wynik tylko dla tej samej organizacji i wersji reguł. |
| YARA-12 | Dopasowanie utrzymuje blokadę niezależnie od roli. Po zmianie reguł ręczne zlecenie i próba pobrania korzystają z tej samej analizy według aktywnej wersji. |

Odbiór obu kroków obejmuje testy polityki pobierania i uprawnień, testy
integracyjne z PostgreSQL, RabbitMQ i MinIO oraz scenariusze Flashwright dla
obu sposobów zlecenia. Wyniki zapisuje się oddzielnie dla każdego kroku.

## Uruchomienie i weryfikacja

1. Zastosować migrację `0005_yara_attachments` zgodnie z
   [instrukcją migracji](../database/migrations.md).
2. Ustawić w `.env` dedykowane `YARA_S3_ACCESS_KEY` i `YARA_S3_SECRET_KEY`.
   Compose zakłada dla workera osobne konto MinIO z prawem odczytu obiektów
   `incidents/*/attachment_*`. Klucz musi być różny od kluczy głównego konta
   MinIO i konta backendu. Worker ma dostęp do wewnętrznej sieci dla PostgreSQL,
   RabbitMQ i MinIO. Skaner ma osobną sieć wewnętrzną i uruchamia silnik
   `yara-python` 4.5.4. Zestaw bazowy zawiera regułę dla nieszkodliwego pliku
   testowego EICAR. Reguły operacyjne organizacja dodaje w panelu administratora.
3. Wdrożyć backend, który wydaje linki do pobrania załączników przez API.
   `YARA_LEGACY_SCAN_NOT_BEFORE` pozostawić puste do zakończenia wycofywania
   starych linków. Ustawić w tej zmiennej moment w formacie ISO 8601 po upływie
   godziny od wyłączenia ostatniej instancji wydającej stare linki albo po ich
   unieważnieniu. Po zmianie `.env` odtworzyć kontener poleceniem
   `docker compose up -d --force-recreate backend`, aby wczytał nową wartość.
   Po wskazanym momencie backend pozwala zlecić pierwszy skan starszego pliku. Automatyczne skanowanie nowych plików działa od wdrożenia.
4. Uruchomić `bun run test:core:db` oraz `bun scripts/test-phase1-e2e.ts --yara`.
   Polecenia tworzą własne środowisko testowe i usuwają je po zakończeniu.
