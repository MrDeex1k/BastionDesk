import { expect, test } from "bun:test";
import { decodeDelivery, failureDecision } from "./contract";
import { brokerOptions } from "./broker";

test("delivery rejects browser identity, unknown versions and oversized input", () => {
	const value = {
		schemaVersion: 1 as const,
		type: "incident.classify.v1" as const,
		jobId: crypto.randomUUID(),
	};
	expect(decodeDelivery(Buffer.from(JSON.stringify(value)))).toEqual(value);
	for (const extra of [
		{ organizationId: "foreign" },
		{ schemaVersion: 2 },
		{ description: "secret" },
	])
		expect(() => decodeDelivery(Buffer.from(JSON.stringify({ ...value, ...extra })))).toThrow();
	expect(() => decodeDelivery(Buffer.alloc(1025))).toThrow("MESSAGE_TOO_LARGE");
});
test("bounded retry distinguishes transient and permanent failure", () => {
	expect([1, 2, 3].map((attempt) => failureDecision(attempt, true).delaySeconds)).toEqual([
		5, 30, 120,
	]);
	expect(failureDecision(4, true).state).toBe("dead");
	expect(failureDecision(1, false).state).toBe("dead");
	expect(() => failureDecision(0, true)).toThrow();
});
test("broker transport requires TLS outside explicitly enabled local tests", () => {
	expect(() => brokerOptions({ RABBITMQ_URL: "amqp://broker" })).toThrow("RABBITMQ_TLS_REQUIRED");
	expect(() => brokerOptions({ RABBITMQ_URL: "amqp://localhost" })).toThrow();
	expect(
		brokerOptions({ RABBITMQ_URL: "amqp://localhost", MESSAGING_ALLOW_LOCAL_PLAINTEXT: "true" })
			.socket.timeout,
	).toBe(5000);
});
