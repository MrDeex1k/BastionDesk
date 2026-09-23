import { describe, expect, test, spyOn } from "bun:test";
import { z } from "zod";
import {
	commandSchema,
	commandFingerprint,
	decideIdempotency,
	receiptScope,
	requireResourceTenant,
	type Command,
} from "./operations";
import { createAuditEntry, auditEntrySchema, provenanceSchema } from "./audit";
import { DomainError, domainErrorResponse, domainResponseSchema, errorResponse } from "./errors";
import { sendErrorResponse } from "../lib/api-response";
import { errorHandler } from "../middleware/error.middleware";
import type { Request, Response } from "express";

const command: Command = {
	schemaVersion: 1,
	id: "01997111-1111-7111-8111-111111111111",
	operation: "incidents.note.v1",
	context: {
		organizationId: "org-a",
		actor: { kind: "user", id: "user-a" },
		correlationId: "01997111-1111-7111-8111-222222222222",
		causationId: null,
	},
	idempotencyKey: "request-1",
	target: { type: "incident", id: "01997111-1111-7111-8111-333333333333" },
	payload: { note: "Example note", labels: ["a", "b"] },
};
const receipt = () => ({
	scope: receiptScope(command),
	fingerprint: commandFingerprint(command),
	state: "completed",
	result: { id: command.target.id },
});
const audit = () =>
	createAuditEntry(command.context, "org-a", {
		id: "01997111-1111-7111-8111-444444444444",
		commandId: command.id,
		action: command.operation,
		source: "incidents",
		resource: command.target,
		occurredAt: "2026-09-23T12:00:00Z",
		outcome: "succeeded",
		reasonCode: "USER_REQUEST",
		changedFields: ["analystNote"],
		provenance: [],
	});

describe("operation contracts", () => {
	test("a domain command rejects unrecognized input and invalid operation versions", () => {
		const schema = commandSchema(
			"incidents.note.v1",
			z.strictObject({ note: z.string(), labels: z.array(z.string()) }),
		);
		expect(schema.safeParse(command).success).toBe(true);
		expect(
			schema.safeParse({
				...command,
				payload: { note: "text", labels: [], organizationId: "org-b" },
			}).success,
		).toBe(false);
		expect(schema.safeParse({ ...command, idempotencyKey: " " }).success).toBe(false);
		expect(schema.safeParse({ ...command, idempotencyKey: "key\n" }).success).toBe(false);
		expect(schema.safeParse({ ...command, schemaVersion: 2 }).success).toBe(false);
		expect(() => commandSchema("incidents.note", z.string())).toThrow();
		expect(() => commandSchema("incidents.note.v1\n", z.string())).toThrow();
	});

	test("retries ignore JSON key ordering and request tracing but preserve semantic input", () => {
		const retried = {
			...command,
			id: crypto.randomUUID(),
			context: { ...command.context, correlationId: crypto.randomUUID() },
			payload: { labels: ["a", "b"], note: "Example note" },
		};
		expect(commandFingerprint(retried)).toBe(commandFingerprint(command));
		expect(decideIdempotency(retried, receipt())).toEqual({
			kind: "replay",
			result: { id: command.target.id },
		});
		for (const changed of [
			{ ...command, payload: { note: "Changed note", labels: ["a", "b"] } },
			{ ...command, payload: { note: "Example note", labels: ["b", "a"] } },
			{ ...command, target: { ...command.target, id: crypto.randomUUID() } },
		])
			expect(() => decideIdempotency(changed, receipt())).toThrow("Klucz operacji");
	});

	test("only a missing receipt permits execution; concurrent execution asks for retry", () => {
		expect(decideIdempotency(command, null)).toEqual({ kind: "execute" });
		const saved = receipt();
		const running = {
			scope: saved.scope,
			fingerprint: saved.fingerprint,
			state: "in_progress",
		};
		try {
			decideIdempotency(command, running);
			throw new Error("Expected in-progress rejection");
		} catch (error) {
			expect(domainErrorResponse(error)).toMatchObject({
				status: 409,
				retryable: true,
				body: { error: { code: "OPERATION_IN_PROGRESS" } },
			});
		}
		expect(() => decideIdempotency(command, undefined)).toThrow();
		expect(() => decideIdempotency(command, { ...saved, state: "expired" })).toThrow();
	});

	test("a matching key never replays another tenant, actor, actor kind or operation", () => {
		for (const scope of [
			{ ...receipt().scope, organizationId: "org-b" },
			{ ...receipt().scope, actor: { kind: "user", id: "user-b" } },
			{ ...receipt().scope, actor: { kind: "service", id: "user-a" } },
			{ ...receipt().scope, operation: "incidents.resolve.v1" },
			{ ...receipt().scope, idempotencyKey: "request-2" },
		]) {
			try {
				decideIdempotency(command, { ...receipt(), scope });
				throw new Error("Expected scope rejection");
			} catch (error) {
				expect(domainErrorResponse(error).body.error.code).toBe("NOT_FOUND");
			}
		}
	});

	test("non-JSON values cannot silently disappear from a fingerprint", () => {
		for (const payload of [
			{ missing: undefined },
			{ value: NaN },
			{ value: Infinity },
			{ date: new Date() },
		]) {
			expect(() =>
				commandFingerprint({ ...command, payload } as unknown as Command),
			).toThrow();
		}
	});

	test("resource tenant checks do not reveal foreign resources", () => {
		expect(() => requireResourceTenant(command.context, "org-a")).not.toThrow();
		expect(() => requireResourceTenant(command.context, "org-b")).toThrow(
			"Zasób nie został znaleziony",
		);
	});
});

describe("audit and provenance", () => {
	test("audit inherits verified context and contains no command payload", () => {
		const entry = audit();
		expect(entry.organizationId).toBe("org-a");
		expect(entry.actor).toEqual(command.context.actor);
		expect(entry.commandId).toBe(command.id);
		expect(JSON.stringify(entry)).not.toContain("Example note");
		expect(auditEntrySchema.safeParse({ ...entry, payload: command.payload }).success).toBe(
			false,
		);
		expect(() => createAuditEntry(command.context, "org-b", entry)).toThrow();
	});

	test("denied or rolled-back operations cannot claim committed changes", () => {
		expect(
			auditEntrySchema.safeParse({
				...audit(),
				outcome: "denied",
				reasonCode: "POLICY_DENIED",
			}).success,
		).toBe(false);
		expect(
			auditEntrySchema.safeParse({
				...audit(),
				outcome: "denied",
				reasonCode: "POLICY_DENIED",
				changedFields: [],
			}).success,
		).toBe(true);
		expect(
			auditEntrySchema.safeParse({ ...audit(), reasonCode: "INTERNAL_FAILURE" }).success,
		).toBe(false);
		expect(
			auditEntrySchema.safeParse({ ...audit(), changedFields: ["status", "status"] }).success,
		).toBe(false);
	});

	test("evidence references carry time, content hash and transformation version without raw secrets", () => {
		const source = {
			source: "wazuh",
			sourceRecordId: "alert-1",
			observedAt: "2026-09-23T10:00:00Z",
			collectedAt: "2026-09-23T11:00:00Z",
			contentHash: "a".repeat(64),
			transform: { name: "normalize", version: "1" },
		};
		expect(provenanceSchema.safeParse(source).success).toBe(true);
		for (const extra of [
			{ apiKey: "secret" },
			{ contentHash: "bad" },
			{ transform: { name: "normalize" } },
			{ observedAt: "2026-09-24T10:00:00Z" },
		]) {
			expect(provenanceSchema.safeParse({ ...source, ...extra }).success).toBe(false);
		}
	});
});

describe("error compatibility", () => {
	test("Express maps domain errors with the legacy response shape", () => {
		let status: number | undefined;
		let body: unknown;
		const response = {
			headersSent: false,
			status(value: number) {
				status = value;
				return this;
			},
			json(value: unknown) {
				body = value;
				return this;
			},
		} as unknown as Response;
		const logger = spyOn(console, "error").mockImplementation(() => {});
		try {
			errorHandler(
				new DomainError("IDEMPOTENCY_CONFLICT"),
				{ method: "POST", path: "/contract-test" } as Request,
				response,
				() => {
					throw new Error("Unexpected next");
				},
			);
			expect(status).toBe(409);
			expect(body).toEqual({
				success: false,
				error: {
					code: "IDEMPOTENCY_CONFLICT",
					message: "Klucz operacji został użyty z innymi danymi",
				},
			});
		} finally {
			logger.mockRestore();
		}
	});
	test("new domain failures expose allowlisted messages and no infrastructure details", () => {
		const response = domainErrorResponse(new Error("postgres://user:password@internal"));
		expect(response.status).toBe(500);
		expect(JSON.stringify(response)).not.toContain("password");
		expect(
			domainResponseSchema(z.strictObject({ id: z.string() })).safeParse(response.body)
				.success,
		).toBe(true);
		expect(domainErrorResponse(new DomainError("IDEMPOTENCY_CONFLICT"))).toMatchObject({
			status: 409,
			retryable: false,
		});
	});

	test("legacy HTTP helper preserves status, code, message and optional details byte-for-byte", () => {
		let body: unknown;
		let status: number | undefined;
		const response = {
			status(value: number) {
				status = value;
				return this;
			},
			json(value: unknown) {
				body = value;
				return this;
			},
		} as unknown as Response;
		for (const details of [
			undefined,
			null,
			false,
			[{ field: "description", message: "Required" }],
		]) {
			sendErrorResponse(response, 400, "LEGACY_CODE", "Legacy message", details);
			expect(status).toBe(400);
			expect(JSON.stringify(body)).toBe(
				JSON.stringify({
					success: false,
					error: {
						code: "LEGACY_CODE",
						message: "Legacy message",
						...(details !== undefined ? { details } : {}),
					},
				}),
			);
		}
		expect(errorResponse("NOT_FOUND", "Missing")).toEqual({
			success: false,
			error: { code: "NOT_FOUND", message: "Missing" },
		});
	});
});
