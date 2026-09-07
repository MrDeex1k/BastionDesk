# Faza 1 — kontrakt UI i migracji

Testy chronią zachowanie BastionDesk 1.0.3 podczas przechodzenia na 2.0.
Scenariusze pozostają wspólne dla legacy i nowego backendu; zmiana frameworka
nie uzasadnia zmiany oczekiwanego zachowania użytkownika.

## Uruchomienie

Z katalogu głównego, po `bun run deps:install`:

```sh
bun run test:components   # bun:test + React Testing Library
bun run test             # testy obu workspace’ów przez Turbo
bun run --cwd frontend test:order # dwie odtwarzalne losowe kolejności
bun run check
cd frontend
bun x --no-install playwright install chromium firefox webkit
cd ..
bun run test:e2e          # izolowany Compose + Chromium + sprzątanie
bun run test:e2e:all      # ten sam kontrakt w Chromium, Firefox i WebKit
```

Linux wymaga bibliotek systemowych przeglądarek; instalacja w CI używa
`playwright install --with-deps chromium firefox webkit`. Docker Compose,
OpenSSL, Bun 1.4.2 i Node.js dla runnera Playwright muszą być dostępne.
Nie są potrzebne produkcyjne sekrety, token Hugging Face ani zewnętrzny SMTP.

Do porównania ze ścieżką migracyjną uruchom osobną, jednorazową instalację:

```sh
E2E_BASE_URL=http://localhost:4567 \
E2E_MAILPIT_URL=http://localhost:8025 \
bun run test:e2e:external
# pełna macierz: test:e2e:external:all
```

Zewnętrzny wariant wymaga zgodnego publicznego API i kontrolowanego SMTP.
Właściciel środowiska odpowiada za końcowe usunięcie jego danych i storage.
Nie kieruj fixture do instalacji z rzeczywistymi kontami.

## Testy komponentowe

`frontend/bunfig.toml` ogranicza Bun do `tests` (komponenty i infrastruktura);
`test:components` wybiera tylko `tests/component`. Playwright posiada
osobny katalog `e2e`. Runnerem jest `bun:test`; `jest-dom` dostarcza tylko
matchery, nie runner Jest.

Preload rejestruje happy-dom przed importami React i Better Auth. Wspólny
renderer dostarcza QueryClient, kontekst auth i TanStack Router z historią
w pamięci. Każdy test otrzymuje nowy cache Query, wyłączone ponowienia,
stałą datę oraz sieć bez rzeczywistych połączeń. `user-event` wykonuje
interakcje. Po teście renderer, cache i CSRF są sprzątane. `cleanStores`
natychmiast odpina subskrypcje sesji Better Auth, przywracany jest stan gościa,
a zaległe timeouty i interwały są anulowane. Nie czekamy na opóźniony unmount
Nanostores; kontrola nieoczekiwanych zapytań pozostaje włączona. Test zmiany
organizacji używa rzeczywistego AuthProvider i klienta Better Auth,
z kontrolowanymi odpowiedziami HTTP.

| ID | Sprawdzane zachowanie |
| --- | --- |
| AUTH-UI-01–02 | Błędne logowanie, zachowanie emaila, fallback z niedostępnego sprawdzenia PassKey do hasła. |
| AUTH-UI-03–05 | Sukces i błąd resetu hasła, powrót do logowania, walidacja hasła przy rejestracji. |
| INC-UI-01–03 | Walidacja opisu, multipart z załącznikiem, potwierdzenie sukcesu, zachowanie danych po odrzuceniu. |
| INC-UI-04–07 | Niedostępny incydent, pusta lista, błąd pobrania i granice paginacji. |
| RBAC-UI-* | Akcje i edycja notatki tylko dla przypisanego analityka; widoki pracownika, admina i innego analityka. |
| ORG-UI-01–03 | Zmiana organizacji przeładowuje rolę; wybór roli i dodawanie członka; utrata aktywnej sesji usuwa organizację i rolę z kontekstu. |

Osobne testy infrastruktury sprawdzają, że publiczny raport nie kopiuje
sekretów z tytułów, błędów, załączników ani konfiguracji i nie akceptuje
arbitralnego HTML. CI uruchamia też testy frontendu z seedami `42` i `1337`;
po zmianie kolejności wszystkie scenariusze nadal muszą przechodzić.

## Testy przeglądarkowe

Każdy scenariusz ma unikalny tenant oraz własne konta admina, analityka i
pracownika. Przygotowanie przechodzi przez publiczne API: rejestrację,
Mailpit, weryfikację emaila, logowanie i aktywację organizacji. Cookies
pozostają w kontekstach Playwright; nie utrzymujemy wspólnych plików sesji.
UUID oddziela dane nawet pomiędzy równoległymi przebiegami. Jeden worker
ogranicza obciążenie lokalnej instalacji i rzeczywistych limitów auth.

| ID | Przepływ |
| --- | --- |
| AUTH-E2E-01 | Ochrona trasy, błędne i poprawne hasło, przekierowanie według roli, odświeżenie i wylogowanie. |
| AUTH-E2E-02 | Rejestracja w przeglądarce, email weryfikacyjny i widok użytkownika bez organizacji. |
| AUTH-E2E-03 | Reset hasła przez UI, wiadomość Mailpit i logowanie nowym hasłem. |
| INC-E2E-01 | Zgłoszenie z plikami, przypisanie, trwała notatka, raport i sprawozdanie, rozwiązanie, pobranie raportu ze sprawdzeniem bajtów, widok admina. |
| INC-E2E-02 | Dostępność zgłoszenia przy niedostępnym klasyfikatorze. |
| ORG-E2E-01 | Dodawanie członka, zmiana roli, anulowanie usunięcia i potwierdzone usunięcie. |
| ORG-E2E-02 | Przełączenie aktywnej organizacji i izolacja widocznych zgłoszeń. |
| ORG-E2E-03 | Utworzenie konta z organizacją przez UI i panel administratora po weryfikacji. |

1.0.3 nie ma przełącznika organizacji w UI. ORG-E2E-02 zmienia kontekst przez
publiczne API sesji i sprawdza widok po przeładowaniu. Test komponentowy
ORG-UI-01 sprawdza aktualizację roli bez przeładowania. Fizyczne WebAuthn,
wydajność modelu i pełne disaster recovery pozostają osobnymi kontrolami;
faza 1 nie zastępuje pakietów fazy 0.

## Izolowany Compose

`scripts/test-phase1-e2e.ts` składa konfigurację z bieżącego
`docker-compose.yml`, zachowując produkcyjne obrazy aplikacji, PostgreSQL,
PgBouncer, NGINX i rozproszony MinIO. Usuwa stałe nazwy kontenerów, nadaje
unikalną nazwę projektu, własne wolumeny i porty loopback. Tworzy osobny CA,
certyfikaty i losowe sekrety; nie czyta wartości z lokalnego `.env` jako
konfiguracji testowej i nie modyfikuje `infra/tls/dev`.

Na Linux runner przypisuje klucze testowe do UID użytkowników przypiętych
obrazów (Bun 1000, PostgreSQL 999, PgBouncer 70), zachowując tryb `0600`.
Prywatny klucz testowego CA jest usuwany po wystawieniu certyfikatów.
Przy zmianie użytkowników obrazów należy dostosować te UID.

SMTP obsługuje Mailpit. Klasyfikator to kontrolowany serwer gRPC z tym samym
Protobuf i mTLS; zwraca `Żółty`, a opis z `[LLM_UNAVAILABLE]` wymusza błąd.
Nie jest to test jakości ani prawdziwej inferencji LLM. Backup jest poza
zakresem tego stosu — jego testy należą do fazy 0.

Testowy DATABASE_URL nie zawiera parametrów SSL: `pg` bierze CA, certyfikat,
klucz i `rejectUnauthorized: true` z jawnej konfiguracji aplikacji. Parametry
SSL w connection string mogą nadpisać ten obiekt, co łamie mTLS.

Fixture usuwa utworzone organizacje w `finally`. Po całym przebiegu runner
usuwa kontenery, sieci, wolumeny z kontami i plikami oraz tymczasowe sekrety.
Sprzątanie jest wykonywane również po błędzie i przy SIGINT/SIGTERM.
Po awaryjnym zabiciu procesu należy usunąć wyłącznie projekt o nazwie
`bastiondesk-e2e-<RUN_ID>` wskazanej w logu.

## Selektory i diagnostyka

Preferujemy role, etykiety i widoczną treść. Wiersze są zawężane unikalnym
emailem lub opisem fixture. Nie używamy klas CSS, strukturalnych XPath,
sztywnych opóźnień ani `data-testid`; wyjątek wymaga uzasadnienia w tym pliku.
Asercje czekają na widoczny rezultat, nie na arbitralny czas.

Raport HTML jest w `frontend/playwright-report`, wynik JSON i ślady w
`frontend/test-results`. Nieudany test zachowuje trace i screenshot.
Log nieudanego stosu jest w `artifacts/phase1/<RUN_ID>/compose.log`.
Wszystkie te ścieżki są ignorowane przez Git. Surowe dane mogą zawierać cookies,
linki i dane jednorazowych kont testowych; służą wyłącznie lokalnej diagnostyce.
Workflow nie publikuje surowych raportów, trace, zrzutów, logów ani certyfikatów.

`bun run --cwd frontend test:e2e:report` tworzy od nowa katalog
`artifacts/phase1-public` z `results.json` i `index.html`. Do raportu przenoszone
są wyłącznie znane identyfikatory scenariuszy, silniki przeglądarek, statusy i
liczbowe czasy. Tytuły, stack trace, stdout/stderr, konfiguracja, ścieżki i
załączniki są pomijane. Nieznane wartości dostają etykietę `unknown`; brak
wyników daje `unavailable`, a błędny JSON zatrzymuje generowanie. Nie jest to
redakcja regexem nad surowymi plikami. Przy dodawaniu scenariusza trzeba
uzupełnić dozwolone ID w generatorze raportu.

GitHub Actions publikuje tylko te dwa pliki jako `phase1-browser-contract-public`
przez 7 dni. Raport pokazuje, który scenariusz się nie powiódł; pełną diagnostykę
uzyskuje się przez lokalne odtworzenie błędu. Jest to świadome ograniczenie
artefaktów publicznego repozytorium, niezależne od ich czasu przechowywania.

Retry jest wyłączone: niestabilny test ma zostać naprawiony na podstawie
trace, nie ukryty przez powtórzenia. Nie stosujemy `skip` dla bramki parity.

## CI i kryterium ukończenia

Weryfikacja lokalna po poprawkach do PR #4, 8 września 2026:

- 19/19 testów komponentowych, 5/5 testów generatora publicznego raportu
  i 32/32 testy backendu;
- 24/24 E2E: po 8 scenariuszy w Chromium, Firefox i WebKit,
  bez pominięć, ponowień i wyników flaky; czas samych testów 77,1 s;
- lint, typy, format, testy i build: 9/9 zadań Turbo bez cache;
- po 24/24 testy frontendu dla seedów 42 i 1337 lokalnie oraz w linuksowym
  obrazie Bun 1.4.2 bez sieci;
- generator publicznego raportu zachował wszystkie 24 wyniki E2E;
- 32/32 testy backendu także w linuksowym obrazie Bun 1.4.2,
  z `.env.example` i bez sieci;
- fixture migracji Better Auth przeszło na jednorazowej bazie PostgreSQL;
- React Doctor: 90/100, jedno ostrzeżenie o złożoności istniejącego
  `IncidentDetailsHeader`, bez błędów.

Identyfikator pełnego przebiegu: `1788823344751-49145`. Po zakończeniu
potwierdzono usunięcie jego kontenerów, sieci, wolumenów i sekretów.
Pierwsze przebiegi GitHub Actions wykryły zależność testów od kolejności:
opóźniony sygnał Better Auth przechodził do testu logowania po teście zmiany
organizacji. Poprawka jawnie kończy subskrypcje i anuluje timery.
[Przebieg GitHub Actions dla PR #4](https://github.com/MrDeex1k/BastionDesk/actions/runs/34170197564)
na commicie `7de36dc` zakończył się powodzeniem: zarówno `checks`, jak i
`browser-contract` są zielone. Test ORG-UI-03 dodatkowo sprawdza przejście
z aktywnej sesji `org-b:pracownik` do gościa po odświeżeniu sesji oraz
wyczyszczenie identyfikatora organizacji i roli.

`.github/workflows/phase1-tests.yml` uruchamia lint, typy, format, testy obu
workspace’ów, dwie losowe kolejności testów frontendu i build, a następnie Chromium dla push/PR. Tag wydania lub ręczne
uruchomienie z pełną macierzą wykonuje także Firefox i WebKit. Zmiana
implementacji backendu nadal musi przejść ten sam kontrakt.

Zamknięcie fazy wymaga zielonego przebiegu lokalnego wszystkich przeglądarek
oraz pierwszego zielonego przebiegu CI. Dodanie workflow do repozytorium samo
w sobie nie dowodzi wykonania CI.

## Źródła

Konfiguracja opiera się na [Bun DOM testing](https://bun.com/docs/test/dom),
[Testing Library z Bun](https://bun.sh/guides/test/testing-library),
[fixture Playwright](https://playwright.dev/docs/test-fixtures) oraz
[Playwright CI](https://playwright.dev/docs/ci). Sprawdzono 8 września 2026.
