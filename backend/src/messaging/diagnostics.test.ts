import { expect, test } from "bun:test";
import { safeWorkerError } from "./diagnostics";
import { listOptions } from "./operations";

test("worker diagnostics identify known failures without leaking arbitrary values", () => {
	expect(safeWorkerError(new Error("RABBITMQ_TLS_REQUIRED"))).toBe("RABBITMQ_TLS_REQUIRED");
	expect(safeWorkerError({ code: "ECONNREFUSED" })).toBe("ECONNREFUSED");
	expect(safeWorkerError(new TypeError("amqps://user:secret@invalid"))).toBe("TYPE_ERROR");
	for (const value of [
		null,
		"secret",
		{ code: "SECRET", message: "SECRET", name: "secret" },
		{ message: "ECONNREFUSED\nsecret" },
	])
		expect(safeWorkerError(value)).not.toContain("secret");
	expect(safeWorkerError({ message: "SECRET" })).toBe("WORKER_OPERATION_FAILED");
});
test("operator listing validates state and cursor", () => {
	expect(listOptions.parse({})).toEqual({ state: "active" });
	expect(listOptions.safeParse({ state: "completed" }).success).toBe(false);
	expect(listOptions.safeParse({ after: "not-a-uuid" }).success).toBe(false);
});
