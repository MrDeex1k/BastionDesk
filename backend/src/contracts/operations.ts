import { createHash } from "node:crypto";
import { z } from "zod";
import { actorSchema, identityIdSchema } from "./index";
import { DomainError } from "./errors";

export const resourceSchema = z.strictObject({
	type: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
	id: identityIdSchema,
});
export const operationSchema = z
	.string()
	.regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.v[1-9][0-9]*$/)
	.refine((value) => !/\s/u.test(value))
	.max(128);
export const operationContextSchema = z.strictObject({
	organizationId: identityIdSchema,
	actor: actorSchema,
	correlationId: z.uuid(),
	causationId: z.uuid().nullable(),
});
const idempotencyKeySchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9_-]+$/)
	.refine((value) => !/\s/u.test(value));
const jsonSchema = z.json();
type Json = z.infer<typeof jsonSchema>;

const baseCommandSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: z.uuid(),
	operation: operationSchema,
	context: operationContextSchema,
	idempotencyKey: idempotencyKeySchema,
	target: resourceSchema,
	payload: jsonSchema,
});

export function commandSchema<const K extends string, T extends z.ZodType>(
	operation: K,
	payload: T,
) {
	operationSchema.parse(operation);
	return baseCommandSchema.extend({ operation: z.literal(operation), payload });
}
export type Command = z.infer<typeof baseCommandSchema>;

function canonical(value: Json): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`)
		.join(",")}}`;
}

export function commandFingerprint(input: Command): string {
	const command = baseCommandSchema.parse(input);
	return createHash("sha256")
		.update(
			canonical({
				schemaVersion: command.schemaVersion,
				operation: command.operation,
				target: command.target,
				payload: command.payload,
			}),
		)
		.digest("hex");
}

export const receiptScopeSchema = z.strictObject({
	organizationId: identityIdSchema,
	actor: actorSchema,
	operation: operationSchema,
	idempotencyKey: idempotencyKeySchema,
});
const receiptBase = { scope: receiptScopeSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) };
export const receiptSchema = z.discriminatedUnion("state", [
	z.strictObject({ ...receiptBase, state: z.literal("in_progress") }),
	z.strictObject({ ...receiptBase, state: z.literal("completed"), result: jsonSchema }),
]);
export type Receipt = z.infer<typeof receiptSchema>;

export function receiptScope(command: Command): z.infer<typeof receiptScopeSchema> {
	return receiptScopeSchema.parse({
		organizationId: command.context.organizationId,
		actor: command.context.actor,
		operation: command.operation,
		idempotencyKey: command.idempotencyKey,
	});
}

/** Pure decision; the storage adapter must read/claim atomically before execution. */
export function decideIdempotency(
	input: Command,
	saved: unknown,
): { kind: "execute" } | { kind: "replay"; result: Json } {
	const command = baseCommandSchema.parse(input);
	const fingerprint = commandFingerprint(command);
	if (saved === null) return { kind: "execute" };
	const receipt = receiptSchema.parse(saved);
	if (canonical(receipt.scope) !== canonical(receiptScope(command)))
		throw new DomainError("NOT_FOUND");
	if (receipt.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
	if (receipt.state === "in_progress") throw new DomainError("OPERATION_IN_PROGRESS");
	return { kind: "replay", result: receipt.result };
}

/** Called after authentication and policy checks; does not establish identity. */
export function requireResourceTenant(
	context: z.infer<typeof operationContextSchema>,
	organizationId: string,
): void {
	operationContextSchema.parse(context);
	if (context.organizationId !== organizationId) throw new DomainError("NOT_FOUND");
}
