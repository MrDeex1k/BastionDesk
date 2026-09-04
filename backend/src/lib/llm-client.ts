import fs from "node:fs";
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { env } from "./env";

const PROTO_PATH = path.resolve(import.meta.dir, "../../../proto/incident_classifier.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
	keepCase: false,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});

const grpcObject = grpc.loadPackageDefinition(packageDefinition) as unknown as {
	bastiondesk: {
		llm: {
			v1: {
				IncidentClassifier: new (
					target: string,
					credentials: grpc.ChannelCredentials,
				) => {
					ClassifyIncident: (
						request: { incidentId: string; description: string },
						metadata: grpc.Metadata,
						options: grpc.CallOptions,
						callback: (
							error: grpc.ServiceError | null,
							response: { category?: string; modelName?: string },
						) => void,
					) => void;
				};
			};
		};
	};
};

const allowedCategories = new Set(["Czerwony", "Żółty", "Zielony"]);

export class LlmServiceError extends Error {
	constructor(
		public code:
			| "LLM_INVALID_REQUEST"
			| "LLM_TIMEOUT"
			| "LLM_UNAVAILABLE"
			| "LLM_UPSTREAM_ERROR"
			| "LLM_INVALID_RESPONSE",
		message: string,
		public statusCode: number,
		public retryable: boolean,
		public grpcStatus?: grpc.status,
		public details?: string,
	) {
		super(message);
		this.name = "LlmServiceError";
	}
}

export interface IncidentClassifierClient {
	ClassifyIncident: (
		request: { incidentId: string; description: string },
		metadata: grpc.Metadata,
		options: grpc.CallOptions,
		callback: (
			error: grpc.ServiceError | null,
			response: { category?: string; modelName?: string },
		) => void,
	) => void;
}

let client: IncidentClassifierClient | null = null;

function getClient() {
	if (!client) {
		const ca = fs.readFileSync(env.LLM_TLS_CA_PATH);
		const key = fs.readFileSync(env.LLM_TLS_KEY_PATH);
		const cert = fs.readFileSync(env.LLM_TLS_CERT_PATH);
		const credentials = grpc.credentials.createSsl(ca, key, cert);

		client = new grpcObject.bastiondesk.llm.v1.IncidentClassifier(
			env.LLM_GRPC_TARGET,
			credentials,
		);
	}

	return client;
}

function createLlmGrpcError(error: grpc.ServiceError): LlmServiceError {
	switch (error.code) {
		case grpc.status.DEADLINE_EXCEEDED:
			return new LlmServiceError(
				"LLM_TIMEOUT",
				"Usługa klasyfikacji nie odpowiedziała w wymaganym czasie",
				504,
				true,
				error.code,
				error.details,
			);
		case grpc.status.UNAVAILABLE:
			return new LlmServiceError(
				"LLM_UNAVAILABLE",
				"Usługa klasyfikacji jest chwilowo niedostępna",
				503,
				true,
				error.code,
				error.details,
			);
		case grpc.status.RESOURCE_EXHAUSTED:
			return new LlmServiceError(
				"LLM_UNAVAILABLE",
				"Usługa klasyfikacji jest przeciążona",
				503,
				true,
				error.code,
				error.details,
			);
		case grpc.status.INVALID_ARGUMENT:
			return new LlmServiceError(
				"LLM_INVALID_REQUEST",
				"Usługa klasyfikacji odrzuciła nieprawidłowe dane wejściowe",
				502,
				false,
				error.code,
				error.details,
			);
		default:
			return new LlmServiceError(
				"LLM_UPSTREAM_ERROR",
				"Usługa klasyfikacji zwróciła nieoczekiwany błąd",
				502,
				false,
				error.code,
				error.details,
			);
	}
}

export async function classifyIncident(
	incidentId: string,
	description: string,
	clientOverride?: IncidentClassifierClient,
): Promise<string> {
	if (!incidentId.trim()) {
		throw new LlmServiceError(
			"LLM_INVALID_REQUEST",
			"Brak identyfikatora incydentu dla klasyfikacji",
			400,
			false,
		);
	}

	if (!description.trim()) {
		throw new LlmServiceError(
			"LLM_INVALID_REQUEST",
			"Brak opisu incydentu do klasyfikacji",
			400,
			false,
		);
	}

	const rpcClient = clientOverride ?? getClient();

	return await new Promise((resolve, reject) => {
		rpcClient.ClassifyIncident(
			{ incidentId, description },
			new grpc.Metadata(),
			{ deadline: Date.now() + env.LLM_RPC_TIMEOUT_MS },
			(error, response) => {
				if (error) {
					reject(createLlmGrpcError(error));
					return;
				}

				const category = response?.category;
				if (!category || !allowedCategories.has(category)) {
					reject(
						new LlmServiceError(
							"LLM_INVALID_RESPONSE",
							"Usługa klasyfikacji zwróciła nieprawidłową kategorię",
							502,
							false,
							undefined,
							`category=${category ?? "empty"}`,
						),
					);
					return;
				}

				resolve(category);
			},
		);
	});
}
