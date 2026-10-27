# Aktualizacja zależności i ocena narzędzi Oxc — 27 października 2026

## Zakres aktualizacji

Pakiety NPM odświeżono przez SFW z karencją 10800 sekund, zachowując dokładne
przypięcia. Dotyczy to rootowego workspace i osobnego prototypu Elysia.
Python rozwiązano przez `uv` z `exclude-newer = "3 hours"`, bez budowania
pakietów źródłowych i bez synchronizacji środowiska. Ponownie przypięto wersje
bezpośrednie i zapisano lockfile. Python pozostaje w serii 3.13, Torch korzysta
z dotychczasowego jawnego indeksu CPU.

Nie uruchamiano buildów, testów, benchmarków, lintera ani typechecka. Skrypty
instalacyjne zostały wyłączone; commit pomija hooki uruchamiające kontrole.
Aktualizacja nie jest potwierdzeniem zgodności runtime nowych wersji.

### Bezpośrednie zmiany NPM

| Manifest | Pakiet | Przed | Po |
| --- | --- | --- | --- |
| `package.json` | `@oxlint/plugins` | `1.89.0` | `1.90.0` |
| `package.json` | `oxlint` | `1.89.0` | `1.90.0` |
| `backend/package.json` | `@better-auth/passkey` | `1.7.12` | `1.7.14` |
| `backend/package.json` | `better-auth` | `1.7.12` | `1.7.14` |
| `backend/package.json` | `@types/bun` | `1.4.3` | `1.4.4` |
| `backend/package.json` | `oxfmt` | `0.74.0` | `0.75.0` |
| `backend/package.json` | `oxlint` | `1.89.0` | `1.90.0` |
| `backend/package.json` | `oxlint-tsgolint` | `7.0.2004` | `7.0.2005` |
| `frontend/package.json` | `@better-auth/passkey` | `1.7.12` | `1.7.14` |
| `frontend/package.json` | `@tanstack/react-query` | `5.104.5` | `5.105.0` |
| `frontend/package.json` | `@tanstack/react-router` | `1.170.45` | `1.170.46` |
| `frontend/package.json` | `better-auth` | `1.7.12` | `1.7.14` |
| `frontend/package.json` | `lucide-react` | `1.61.0` | `1.62.0` |
| `frontend/package.json` | `@tanstack/router-plugin` | `1.168.47` | `1.168.48` |
| `frontend/package.json` | `@types/bun` | `1.4.3` | `1.4.4` |
| `frontend/package.json` | `oxfmt` | `0.74.0` | `0.75.0` |
| `frontend/package.json` | `oxlint` | `1.89.0` | `1.90.0` |
| `frontend/package.json` | `oxlint-tsgolint` | `7.0.2004` | `7.0.2005` |

### Python

| Pakiet | Przed | Po |
| --- | --- | --- |
| `fastapi` | `0.161.0` | `0.162.0` |
| `grpcio` | `1.84.1` | `1.85.0` |
| `grpcio-tools` | `1.84.1` | `1.85.0` |
| `huggingface-hub` | `2.2.0` | `2.3.0` |
| `transformers` | `5.20.2` | `5.21.0` |

Zależności przechodnie zostały odświeżone w granicach wymagań pakietów nadrzędnych.
NestJS 12.3.x pozostaje poza aktualizacją: w chwili odczytu metadanych nowe wydania
nie spełniały karencji 3h. Elysia pozostaje na aktualnym kanale 2 RC.

### Docker — bez karencji

| Obraz | Przed | Po |
| --- | --- | --- |
| uv / Python 3.13 / trixie-slim | `0.13.5` | `0.13.6` |
| Mailpit | `v1.31.6` | `v1.32.0` |
| OpenTelemetry Collector | `0.163.2` | `0.164.0` |

Tagi ustalono z metadanych Docker Hub i oficjalnych wydań GitHub. Sprawdzono
manifesty GHCR dla uv oraz Mailpit. Bez zmiany tagu pozostają aktualne używane
warianty Bun 1.4.4, NGINX 1.31.8-alpine3.24, PostgreSQL 18.6,
RabbitMQ 4.4.0-management-alpine, PgBouncer v1.26.1-p0, BusyBox 1.38.0-musl,
MinIO RELEASE.2025-10-15T17-29-55Z oraz klient MinIO RELEASE.2025-08-13T08-35-41Z.
Nie pobierano warstw obrazów ani nie uruchamiano kontenerów.

## Ocena tsrs

Stan rejestru NPM: `0.20.0-ts7.1.0-beta`. Projekt jest portem kompilatora
TypeScript 7 do Rust; celuje w zgodność z TypeScript 7.1 beta. Obsługuje
sprawdzanie typów i project references. Autorzy dokumentują pozostałe różnice;
tryb `--fast` może zmieniać diagnostykę i kod wyjścia w przypadkach zależnych
od kolejności sprawdzania. Źródła: [README](https://github.com/oxc-project/tsrs),
[zgodność](https://github.com/oxc-project/tsrs/blob/main/docs/COMPATIBILITY.md).

W BastionDesk kandydatami są backendowe `tsc --noEmit` i frontendowe sprawdzanie
projektów referencyjnych oraz testowych typów. Potencjalny zysk dotyczy czasu
i RAM przy pracy lokalnej/CI. Serwery działają na Bun, a frontend bundluje Vite:
nie ma podstaw do obietnicy szybszej obsługi żądań czy mniejszych bundle'ów.
Nasz bazowy TypeScript ma wersję 7.0.2, więc różnice wobec 7.1 beta mogą wynikać
również ze zmiany wersji referencyjnego kompilatora. Punktem odniesienia ma być
nasz TypeScript 7, a nie historyczne wyniki kompilatora JavaScript.

Rekomendacja: osobny eksperyment po ustabilizowaniu stage 6, kiedy koszt
sprawdzania typów będzie mierzalnym problemem. Najpierw równoległa diagnostyka
bez zastępowania obowiązkowej kontroli `tsc`. Porównać czas, peak RSS i zestaw
błędów dla backendu i obu konfiguracji frontendu, także przy celowo błędnym kodzie.
Zacząć bez `--fast`; rozważyć go oddzielnie. Proponowany próg przyjęcia to
powtarzalne przyspieszenie o co najmniej 20% bez utraty diagnostyki i regresji RAM.
To nasz warunek eksperymentu, nie wynik pomiaru ani gwarancja upstream.

Nie dodano `tsrs` do manifestów i nie zmieniono komend typecheck/build.

## Ocena oxlint-flat-config

Poniższa ocena poprzedza decyzję użytkownika o wdrożeniu. W kolejnym, osobnym
commicie przeprowadzono migrację do konfiguracji TypeScript ze wspólną bazą
i `oxlint-flat-config`; aktualny układ opisuje [konfiguracja lintera](anti-slop.md#konfiguracja-lintera).

Stan NPM: `0.4.0`, repozytorium `liangmiQwQ/oxlint-flat-config`. To dodatkowa
biblioteka przekształcająca uporządkowane tablice konfiguracji w obiekt Oxlint.
Ułatwia składanie presetów, warunki i nadpisania; sama nie dodaje silnika
sprawdzania typów ani reguł poprawiających jakość kodu.
[Dokumentacja projektu](https://github.com/liangmiQwQ/oxlint-flat-config).

Obecnie mamy dwie krótkie konfiguracje JSON. Powtarzają listę podstawowych
pluginów, kategorię correctness i trzy reguły anti-slop; frontend dodaje React,
reguły shadcn oraz ignorowanie plików generowanych. Ten zakres można współdzielić
natywnym `extends`. Zainstalowany Oxlint 1.90.0 eksportuje `defineConfig`,
obsługuje konfigurację TypeScript i importowane obiekty w `extends`.
[Oficjalna konfiguracja](https://oxc.rs/docs/guide/usage/linter/config.html).

Rekomendacja: na obecnym etapie preferować natywny `oxlint.config.ts` ze wspólną
bazą, kiedy faktycznie zaczniemy rozbudowywać konfigurację. Zysk jest w utrzymaniu
i podpowiedziach edytora, bez obietnicy szybszego lintowania. Flat config stanie
się zasadny przy większej liczbie współdzielonych presetów i warunkowych profili,
których natywne `extends` nie obsłuży wygodnie.

Ewentualna migracja musi zachować poziomy reguł, `--type-aware`, lokalne ścieżki
`jsPlugins` i ich aliasy, reguły shadcn oraz zakres ignorowanych plików.
Nie należy dodawać presetu `recommended` przy migracji 1:1 bez osobnej oceny,
bo może zmienić aktywny zestaw reguł. Zgodność diagnostyki trzeba porównać w osobnym
zadaniu z dozwolonym uruchomieniem lintera.

Nie dodano `oxlint-flat-config` i nie zmieniono obecnych konfiguracji lintera.
