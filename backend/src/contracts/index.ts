import { z } from "zod";

// Auth IDs are opaque strings, not UUIDs. Do not normalize identity values.
export const identityIdSchema = z
	.string()
	.min(1)
	.max(128)
	.refine((value) => !/\s/u.test(value));
export const userRoleSchema = z.enum(["admin", "analityk", "pracownik"]);
export const incidentStatusSchema = z.enum([
	"Zgłoszony",
	"Raport w trakcie",
	"Raport złożony",
	"Sprawozdanie w trakcie",
	"Sprawozdanie złożone",
	"Odrzucone",
]);
export const incidentCategorySchema = z.enum(["Czerwony", "Żółty", "Zielony"]);

// JSON QUERY contract; the legacy GET adapter retains its existing coercion.
export const pageRequestSchema = z.strictObject({
	page: z.number().int().min(1).max(1000).default(1),
	limit: z.number().int().min(1).max(100).default(20),
});

export const actorSchema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("user"), id: identityIdSchema }),
	z.strictObject({ kind: z.literal("service"), id: identityIdSchema }),
]);

/** A wire contract only: validation does not authenticate the producer. */
export function eventEnvelopeSchema<const K extends string, T extends z.ZodType>(
	type: K,
	payload: T,
) {
	return z.strictObject({
		schemaVersion: z.literal(1),
		id: z.uuid(),
		type: z.literal(type),
		organizationId: identityIdSchema,
		occurredAt: z.iso.datetime(),
		correlationId: z.uuid(),
		causationId: z.uuid().nullable(),
		actor: actorSchema,
		source: identityIdSchema,
		payload,
	});
}

export type UserRole = z.infer<typeof userRoleSchema>;
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export type IncidentCategory = z.infer<typeof incidentCategorySchema>;
export type PageRequest = z.infer<typeof pageRequestSchema>;
