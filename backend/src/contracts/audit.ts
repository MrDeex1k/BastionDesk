import { z } from "zod";
import { actorSchema, identityIdSchema } from "./index";
import {
	operationSchema,
	resourceSchema,
	operationContextSchema,
	requireResourceTenant,
} from "./operations";

export const provenanceSchema = z
	.strictObject({
		source: identityIdSchema,
		sourceRecordId: identityIdSchema,
		observedAt: z.iso.datetime(),
		collectedAt: z.iso.datetime(),
		contentHash: z.string().regex(/^[a-f0-9]{64}$/),
		transform: z.strictObject({ name: identityIdSchema, version: identityIdSchema }).nullable(),
	})
	.refine((value) => Date.parse(value.observedAt) <= Date.parse(value.collectedAt), {
		message: "Observation cannot follow collection",
	});

export const auditEntrySchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		id: z.uuid(),
		organizationId: identityIdSchema,
		commandId: z.uuid(),
		correlationId: z.uuid(),
		causationId: z.uuid().nullable(),
		actor: actorSchema,
		source: identityIdSchema,
		action: operationSchema,
		resource: resourceSchema,
		occurredAt: z.iso.datetime(),
		outcome: z.enum(["succeeded", "denied", "failed"]),
		reasonCode: z.enum([
			"USER_REQUEST",
			"SYSTEM_RULE",
			"POLICY_DENIED",
			"DEPENDENCY_FAILURE",
			"INTERNAL_FAILURE",
		]),
		changedFields: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)).max(64),
		provenance: z.array(provenanceSchema).max(100),
	})
	.superRefine((entry, ctx) => {
		const allowed = {
			succeeded: ["USER_REQUEST", "SYSTEM_RULE"],
			denied: ["POLICY_DENIED"],
			failed: ["DEPENDENCY_FAILURE", "INTERNAL_FAILURE"],
		};
		if (!allowed[entry.outcome].includes(entry.reasonCode))
			ctx.addIssue({ code: "custom", message: "Outcome/reason mismatch" });
		if (entry.outcome !== "succeeded" && entry.changedFields.length)
			ctx.addIssue({
				code: "custom",
				message: "Rolled-back or denied commands cannot report committed changes",
			});
		if (new Set(entry.changedFields).size !== entry.changedFields.length)
			ctx.addIssue({ code: "custom", message: "Duplicate changed field" });
	});

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export function createAuditEntry(
	context: z.infer<typeof operationContextSchema>,
	resourceOrganizationId: string,
	entry: Omit<
		AuditEntry,
		"schemaVersion" | "organizationId" | "actor" | "correlationId" | "causationId"
	>,
): AuditEntry {
	requireResourceTenant(context, resourceOrganizationId);
	return auditEntrySchema.parse({ ...entry, ...context, schemaVersion: 1 });
}
