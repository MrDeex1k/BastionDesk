# Weryfikacja Core — faza 3

Zakres: modularny Core w procesie obecnego backendu. Kompozycja Express/NestJS
zachowuje publiczne ścieżki, sesję cookie i workflow frontendu. Nie jest to
jeszcze oddzielny serwis auth ani sieciowy kontrakt JWT/mTLS.

## Pokrycie

| Obszar | Dowód |
| --- | --- |
| Świeża tożsamość, timeout, role i tenant scope | testy Core + rzeczywisty HTTP |
| Listy i szczegóły pracownika/analityka/admina | HTTP, testy SQL, E2E |
| Admin GET/QUERY, filtry, summary, kolejność tras | HTTP, walidacja schematów, E2E admina |
| Przypisanie, status, notatka, rozwiązanie | polityki domenowe, PostgreSQL, E2E |
| Jednoczesne przypisanie, rollback | rzeczywisty PostgreSQL, blokada wiersza |
| Ponowienia, 409, rozdzielenie tenantów, restart repozytorium | receipts w PostgreSQL |
| Upload/pobranie, niedozwolony MIME/base64, HEAD bez zapisu | testy adaptera i E2E storage |
| Audyt atomowy z sukcesem, odmowy i minimalizacja treści | integracja PostgreSQL |
| Upgrade baseline, drift, checksums, restore | izolowany migrator |
| Brak migracji blokuje start | integracja bramki gotowości schema |

Polecenia z katalogu głównego:

```bash
bun run check
bun run test
bun run test:core:http
bun run test:core:db
bun run test:migrations
bun run test:e2e:all
```

Testy bazodanowe tworzą i usuwają własne kontenery PostgreSQL. E2E buduje osobny
stos z własnymi certyfikatami, SMTP i storage. Najpierw inicjalizuje bazę oraz
stosuje migracje, dopiero potem uruchamia backend. Certyfikat migratora ma CN
użytkownika PostgreSQL; jednorazowy migrator testowy działa jako root, aby móc
czytać klucz 0600 współdzielony z testowym PgBouncerem również na Linux.

## Wynik 23 września 2026

Check oraz wszystkie pakiety powyżej przeszły: 66 testów backendu, 24 frontendu
i 24/24 E2E (Chromium, Firefox, WebKit), run `1790185176229-3989`.
Końcową poprawkę HEAD zweryfikowano testem regresji po tym przebiegu E2E.

## Granice odbioru

Parity dotyczy obsługiwanego workflow i publicznych payloadów sukcesu. Nie
obiecujemy identycznych komunikatów każdego błędu infrastruktury. Nowy Core
normalizuje błędy usług, sprawdza świeżą sesję i rygorystycznie waliduje paginację.
Testy nie stanowią pomiaru wydajności produkcyjnej ani testu trwałego JWT/JWKS.

Legacy analityki `/api/admin/analytics/*` i zarządzanie tożsamością nadal mają
własne adaptery. Zastąpione handlery incydentów usunięto. Core nie importuje
Better Auth i nie wykonuje zapytań do tabel sesji/członkostwa; adapter auth
pozostaje w composition root. Organizacja każdej operacji pochodzi z tego portu.

LLM pozostaje best-effort. Upload i SQL nie tworzą rozproszonej transakcji:
niejednoznaczne potwierdzenie zapisu może pozostawić osierocony obiekt. Kolejki,
outbox i obsługa takich awarii należą do fazy 4. Migracje uruchomiono wyłącznie
na danych testowych, bez modyfikowania istniejącej bazy użytkownika.
