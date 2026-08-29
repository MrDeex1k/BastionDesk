# Protokół klasyfikatora incydentów

Ten dokument opisuje kontrakt gRPC używany między backendem a usługą LLM.

## Źródło prawdy

Definicja protokołu znajduje się w:

- [`proto/incident_classifier.proto`](../../proto/incident_classifier.proto)

Korzystają z niej:

- [`backend/src/lib/llm-client.ts`](../../backend/src/lib/llm-client.ts)
- [`llm_service/start.sh`](../../llm_service/start.sh)

## Pakiet

```proto
package bastiondesk.llm.v1;
```

## Usługa

```proto
service IncidentClassifier {
  rpc ClassifyIncident(ClassifyIncidentRequest) returns (ClassifyIncidentResponse);
}
```

Usługa udostępnia jedną metodę RPC typu unary:

- `ClassifyIncident`

## Komunikat żądania

```proto
message ClassifyIncidentRequest {
  string incident_id = 1;
  string description = 2;
}
```

Pola:

- `incident_id`: wewnętrzny identyfikator incydentu;
- `description`: treść incydentu przekazywana do klasyfikatora.

## Komunikat odpowiedzi

```proto
message ClassifyIncidentResponse {
  string category = 1;
  string model_name = 2;
}
```

Pola:

- `category`: przewidziana kategoria incydentu;
- `model_name`: identyfikator modelu użytego do klasyfikacji.

## Uwagi

- Protokół korzysta obecnie ze składni `proto3`.
- Kontrakt jest celowo wąski: jedno żądanie, jedna odpowiedź, bez przesyłania strumieniowego.
- Jeśli struktura żądania lub odpowiedzi ulegnie zmianie, klient backendu i proces uruchamiania
  usługi LLM muszą nadal korzystać z tego samego pliku `.proto`.
