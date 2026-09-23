import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { eventEnvelopeSchema, identityIdSchema, pageRequestSchema } from "./index";

const schema = eventEnvelopeSchema(
	"incidents.created.v1",
	z.strictObject({ incidentId: z.uuid() }),
);
const event: z.infer<typeof schema> = {
	schemaVersion: 1,
	id: "01997111-1111-7111-8111-111111111111",
	type: "incidents.created.v1",
	organizationId: "org-a",
	occurredAt: "2026-09-23T10:00:00Z",
	correlationId: "01997111-1111-7111-8111-222222222222",
	causationId: null,
	actor: { kind: "user", id: "user-a" },
	source: "incidents",
	payload: { incidentId: "01997111-1111-7111-8111-333333333333" },
};

describe("versioned domain contracts", () => {
	test("accepts an opaque auth ID without rewriting it", () => {
		expect(identityIdSchema.parse("Org_A-123")).toBe("Org_A-123");
		for (const id of ["", " ", "org a", "org-a\n", "a".repeat(129)]) {
			expect(identityIdSchema.safeParse(id).success).toBe(false);
		}
	});

	test("round-trips a root event and a service-caused event through JSON", () => {
		expect(schema.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
		const caused: z.infer<typeof schema> = {
			...event,
			causationId: event.id,
			actor: { kind: "service", id: "ingest-worker" },
		};
		expect(schema.parse(caused)).toEqual(caused);
	});

	test("rejects absent tenant and provenance instead of inventing defaults", () => {
		for (const key of ["organizationId", "actor", "source", "correlationId", "causationId"]) {
			const input: Record<string, unknown> = { ...event };
			delete input[key];
			expect(schema.safeParse(input).success).toBe(false);
		}
	});

	test("rejects unsupported versions, event types and malformed payloads", () => {
		for (const change of [
			{ schemaVersion: 2 },
			{ type: "incidents.deleted.v1" },
			{ payload: { incidentId: "not-a-uuid" } },
			{ payload: { ...event.payload, organizationId: "org-b" } },
			{ actor: { kind: "admin", id: "user-a" } },
			{ occurredAt: "2026-09-23T10:00:00" },
			{ token: "unexpected-secret" },
		]) {
			expect(schema.safeParse({ ...event, ...change }).success).toBe(false);
		}
	});

	test("preserves QUERY defaults and rejects coercion and oversized pages", () => {
		expect(pageRequestSchema.parse({})).toEqual({ page: 1, limit: 20 });
		for (const input of [
			{ page: "2" },
			{ page: 0 },
			{ page: 1001 },
			{ limit: 101 },
			{ limit: 1.5 },
			{ organizationId: "org-b" },
		]) {
			expect(pageRequestSchema.safeParse(input).success).toBe(false);
		}
	});
});
