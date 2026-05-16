# Incident Classifier Protocol

This document describes the gRPC contract used between the backend and the LLM service.

## Source of Truth

The protocol definition lives in:

- [proto/incident_classifier.proto](/Users/jakubbatycki/KOD/BastionDesk/proto/incident_classifier.proto)

It is used by:

- [backend/src/lib/llm-client.ts](/Users/jakubbatycki/KOD/BastionDesk/backend/src/lib/llm-client.ts)
- [llm_service/start.sh](/Users/jakubbatycki/KOD/BastionDesk/llm_service/start.sh)

## Package

```proto
package bastiondesk.llm.v1;
```

## Service

```proto
service IncidentClassifier {
  rpc ClassifyIncident(ClassifyIncidentRequest) returns (ClassifyIncidentResponse);
}
```

The service exposes one unary RPC:

- `ClassifyIncident`

## Request Message

```proto
message ClassifyIncidentRequest {
  string incident_id = 1;
  string description = 2;
}
```

Fields:

- `incident_id`: internal incident identifier
- `description`: incident text passed to the classifier

## Response Message

```proto
message ClassifyIncidentResponse {
  string category = 1;
  string model_name = 2;
}
```

Fields:

- `category`: predicted incident category
- `model_name`: model identifier used for the classification

## Notes

- The protocol currently uses `proto3`.
- The contract is intentionally narrow: one request, one response, no streaming.
- If the request or response shape changes, both the backend client and LLM service startup flow must remain aligned with the same `.proto` file.