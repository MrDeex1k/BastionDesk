import fs from "node:fs";
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { env } from "./env";

const PROTO_PATH = path.resolve(
	import.meta.dir,
	"../../proto/incident_classifier.proto",
);

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

let client: {
	ClassifyIncident: (
		request: { incidentId: string; description: string },
		metadata: grpc.Metadata,
		options: grpc.CallOptions,
		callback: (
			error: grpc.ServiceError | null,
			response: { category?: string; modelName?: string },
		) => void,
	) => void;
} | null = null;

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

export async function classifyIncident(
	incidentId: string,
	description: string,
): Promise<string> {
	const rpcClient = getClient();

	return await new Promise((resolve, reject) => {
		rpcClient.ClassifyIncident(
			{ incidentId, description },
			new grpc.Metadata(),
			{ deadline: Date.now() + env.LLM_RPC_TIMEOUT_MS },
			(error, response) => {
				if (error) {
					reject(error);
					return;
				}

				const category = response?.category;
				if (!category || !allowedCategories.has(category)) {
					reject(
						new Error(
							`Invalid category returned by LLM: ${category ?? "empty"}`,
						),
					);
					return;
				}

				resolve(category);
			},
		);
	});
}
