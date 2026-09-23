import { z } from "zod";

/** A wake-up pointer, never an authority for tenant identity or incident content. */
export const deliverySchema = z.strictObject({
	schemaVersion: z.literal(1),
	type: z.literal("incident.classify.v1"),
	jobId: z.uuid(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const topology = {
	exchange: "bastiondesk.jobs.v1",
	routingKey: "incident.classify.v1",
	queue: "bastiondesk.classifier.v1",
	deadExchange: "bastiondesk.dead.v1",
	deadQueue: "bastiondesk.classifier.dead.v1",
} as const;
export const maxAttempts = 4;
export const leaseSeconds = 120;
export function failureDecision(attempt: number, retryable: boolean) {
	if (!Number.isInteger(attempt) || attempt < 1) throw new Error("INVALID_ATTEMPT");
	return retryable && attempt < maxAttempts
		? { state: "pending" as const, delaySeconds: [5, 30, 120][attempt - 1]! }
		: { state: "dead" as const, delaySeconds: 0 };
}
export function decodeDelivery(body: Buffer): Delivery {
	if (body.length > 1024) throw new Error("MESSAGE_TOO_LARGE");
	return deliverySchema.parse(JSON.parse(body.toString("utf8")));
}
