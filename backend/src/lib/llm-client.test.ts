import { describe, expect, test } from "bun:test";
import { status, type CallOptions, type Metadata, type ServiceError } from "@grpc/grpc-js";
import { classifyIncident, type IncidentClassifierClient, LlmServiceError } from "./llm-client.js";

function classifierClient(
	result:
		| { response: { category?: string; modelName?: string } }
		| { error: Pick<ServiceError, "code" | "details"> },
): IncidentClassifierClient {
	return {
		ClassifyIncident: (
			_request: { incidentId: string; description: string },
			_metadata: Metadata,
			_options: CallOptions,
			callback: (
				error: ServiceError | null,
				response: { category?: string; modelName?: string },
			) => void,
		) => {
			if ("error" in result) {
				callback(result.error as ServiceError, {});
				return;
			}
			callback(null, result.response);
		},
	};
}

async function expectLlmError(promise: Promise<unknown>, code: LlmServiceError["code"]) {
	try {
		await promise;
		throw new Error("Expected LlmServiceError");
	} catch (error) {
		expect(error).toBeInstanceOf(LlmServiceError);
		expect((error as LlmServiceError).code).toBe(code);
	}
}

describe("incident classifier contract", () => {
	test("LLM-01-01 accepts only baseline categories", async () => {
		for (const category of ["Czerwony", "Żółty", "Zielony"]) {
			expect(
				await classifyIncident(
					"00000000-0000-4000-8000-000000000001",
					"Opis incydentu",
					classifierClient({ response: { category, modelName: "fixture" } }),
				),
			).toBe(category);
		}
	});

	test("LLM-01-02 rejects an empty and unknown category", async () => {
		for (const category of [undefined, "Niebieski"]) {
			await expectLlmError(
				classifyIncident(
					"00000000-0000-4000-8000-000000000001",
					"Opis incydentu",
					classifierClient({ response: { category } }),
				),
				"LLM_INVALID_RESPONSE",
			);
		}
	});

	test("LLM-01-03 maps timeout and unavailable responses to retryable errors", async () => {
		for (const [grpcCode, expectedCode] of [
			[status.DEADLINE_EXCEEDED, "LLM_TIMEOUT"],
			[status.UNAVAILABLE, "LLM_UNAVAILABLE"],
			[status.RESOURCE_EXHAUSTED, "LLM_UNAVAILABLE"],
		] as const) {
			const promise = classifyIncident(
				"00000000-0000-4000-8000-000000000001",
				"Opis incydentu",
				classifierClient({ error: { code: grpcCode, details: "fixture failure" } }),
			);

			try {
				await promise;
				throw new Error("Expected LlmServiceError");
			} catch (error) {
				expect(error).toBeInstanceOf(LlmServiceError);
				expect((error as LlmServiceError).code).toBe(expectedCode);
				expect((error as LlmServiceError).retryable).toBe(true);
			}
		}
	});

	test("LLM-01-04 rejects missing input before creating a real gRPC client", async () => {
		await expectLlmError(classifyIncident("", "Opis incydentu"), "LLM_INVALID_REQUEST");
		await expectLlmError(
			classifyIncident("00000000-0000-4000-8000-000000000001", ""),
			"LLM_INVALID_REQUEST",
		);
	});
});
