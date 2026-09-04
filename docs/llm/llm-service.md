# Serwis LLM

Serwis klasyfikuje opisy incydentów przy użyciu modelu
`google/gemma-3-1b-it`. Klasyfikacja jest udostępniana backendowi przez gRPC
z wzajemnym TLS, a FastAPI udostępnia osobny endpoint diagnostyczny.

Checkpoint modelu zawiera wagi `BF16` i nie ma konfiguracji kwantyzacji.
Obecny runtime zachowuje tę precyzję; ewentualna migracja do skwantyzowanego
GGUF jest osobną zmianą modelu i runtime'u.

## Struktura

```text
llm_service/
├── main.py        # model, serwer gRPC i healthcheck FastAPI
├── pyproject.toml # metadane i zależności bezpośrednie
├── uv.lock        # pełny lockfile środowiska Python
├── Dockerfile     # obraz builder/runtime
└── start.sh       # generowanie stubów protobuf i start Uvicorn
```

Wygenerowany przy starcie pakiet `generated/` nie jest przechowywany w repozytorium.
Jego źródłem jest [`proto/incident_classifier.proto`](../../proto/incident_classifier.proto).

## Interfejsy

### Klasyfikacja gRPC

- adres wewnętrzny w Compose: `llm_service:8443`,
- usługa: `bastiondesk.llm.v1.IncidentClassifier`,
- metoda: `ClassifyIncident`,
- transport: gRPC z mTLS i wymaganym certyfikatem klienta.

Żądanie zawiera `incident_id` i `description`. Odpowiedź zawiera jedną z kategorii
`Czerwony`, `Żółty`, `Zielony` oraz nazwę modelu. Pełny kontrakt opisuje
[dokumentacja protokołu](../proto/incident-classifier.md).

### Healthcheck HTTP

FastAPI nasłuchuje wewnątrz kontenera na porcie `8888` i udostępnia:

```text
GET /health
```

Gdy model jest gotowy, endpoint zwraca HTTP `200` oraz m.in. `status: "ok"` i
`loaded: true`. Jeśli ładowanie modelu nie powiodło się, zwraca HTTP `503`,
`status: "degraded"`, `loaded: false` i opis błędu.

Porty `8443` i `8888` nie są publikowane na hoście przez aktualny
`docker-compose.yml`. Healthcheck można wywołać z wnętrza stacka, np.:

```bash
docker compose exec llm_service \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8888/health').read().decode())"
```

## Zależności

Projekt używa `uv`. Zależności bezpośrednie są przypięte do dokładnych wersji w
`pyproject.toml`, a `uv.lock` utrwala pełne rozwiązanie. Resolver pomija wydania
młodsze niż 24 godziny przez `exclude-newer = "24 hours"`. Torch pochodzi z
oficjalnego indeksu PyTorch CPU, ponieważ obecny serwis Compose nie deklaruje
dostępu do GPU; dzięki temu obraz nie zawiera niewykorzystywanych bibliotek
CUDA.

Instalacja lokalna:

```bash
cd llm_service
uv sync --locked
```

Aktualizacje wykonuje się przez kontrolowaną zmianę pinów i odświeżenie
lockfile'a, nie przez ręczną edycję `uv.lock`.

## Uruchomienie

Wspierana konfiguracja repozytorium działa w Docker Compose, ponieważ serwer
gRPC wymaga plików CA oraz certyfikatu serwera pod ścieżkami `/certs/...`:

```bash
cp .env.example .env
sh infra/tls/generate-dev-certs.sh
docker compose up --build llm_service
```

Obraz jest budowany z kontekstu katalogu głównego, ponieważ potrzebuje zarówno
`llm_service/`, jak i wspólnego katalogu `proto/`. Skrypt `start.sh` generuje
stuby protobuf, po czym uruchamia Uvicorn na porcie `8888`; serwer gRPC na
porcie `8443` jest uruchamiany w cyklu życia aplikacji FastAPI.

W aktualnym Compose serwis ma limit pamięci `10GB` i trwały wolumen
`huggingface-model-cache` pod ścieżką wskazaną przez `HF_HOME`. Pierwszy start
wymaga pobrania modelu, ale kolejne kontenery korzystają z tego samego cache;
opcjonalne `HTTP_PROXY`, `HTTPS_PROXY` i `NO_PROXY` pozwalają skierować ruch
przez proxy. `HF_TOKEN` jest potrzebny tylko wtedy, gdy wybrany model wymaga
uwierzytelnienia.

Obraz runtime używa wariantu `torch+cpu`, ponieważ Compose nie przydziela tej
usłudze GPU. Wagi modelu nie są częścią obrazu: około 1,9 GiB danych znajduje
się w osobnym, trwałym wolumenie. Rekreacja kontenera może nadal sprawdzić
metadane modelu w Hugging Face, lecz nie pobiera ponownie pliku wag.

## Rozwiązywanie problemów

### Model nie jest gotowy

Sprawdź `docker compose logs llm_service`, dostęp do Hugging Face, ustawienia
proxy oraz miejsce w cache. Kontener pozostaje `unhealthy`, dopóki `/health`
nie zacznie zwracać HTTP `200`.

### gRPC jest niedostępne

Sprawdź obecność plików w `infra/tls/dev/ca` i
`infra/tls/dev/llm_service`, wartość `LLM_GRPC_TARGET=llm_service:8443` oraz
zgodność certyfikatów backendu z lokalnym CA.

### Zmienił się plik `.proto`

Uruchom usługę ponownie. `start.sh` generuje stuby przy każdym starcie, więc
backend i serwis LLM powinny nadal korzystać z tego samego
`proto/incident_classifier.proto`.
