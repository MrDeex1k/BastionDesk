// Controlled external boundary for browser tests; never loaded by the production server.
import { readFileSync } from "node:fs";
import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
const definition = grpc.loadPackageDefinition(
  loadSync("/app/proto/incident_classifier.proto", { keepCase: false, defaults: true }),
);
const service = (definition as any).bastiondesk.llm.v1.IncidentClassifier.service;
const server = new grpc.Server();
server.addService(service, {
  ClassifyIncident(
    call: grpc.ServerUnaryCall<{ incidentId: string; description: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>,
  ) {
    if (call.request.description.includes("[LLM_UNAVAILABLE]")) {
      callback({ code: grpc.status.UNAVAILABLE, message: "Controlled E2E failure" });
      return;
    }
    callback(null, { category: "Żółty", modelName: "phase1-fixture" });
  },
});
const credentials = grpc.ServerCredentials.createSsl(
  readFileSync("/certs/ca/ca.crt"),
  [
    {
      private_key: readFileSync("/certs/llm_service/server.key"),
      cert_chain: readFileSync("/certs/llm_service/server.crt"),
    },
  ],
  true,
);
await new Promise<void>((resolve, reject) =>
  server.bindAsync("0.0.0.0:8443", credentials, (error) => (error ? reject(error) : resolve())),
);
Bun.serve({ port: 8000, fetch: () => Response.json({ status: "ok", fixture: true }) });
process.on("SIGTERM", () => server.tryShutdown(() => process.exit(0)));
