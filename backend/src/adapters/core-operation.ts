import type { Request } from "express";
import { z } from "zod";
import type { OperationRequest } from "../core/incidents/commands";
export function operationRequest(req: Request): OperationRequest {
	return {
		idempotencyKey: z
			.string()
			.min(1)
			.max(128)
			.regex(/^[A-Za-z0-9_-]+$/)
			.parse(req.get("idempotency-key") ?? crypto.randomUUID()),
		commandId: crypto.randomUUID(),
		correlationId: z.uuid().parse(req.get("x-correlation-id") ?? crypto.randomUUID()),
	};
}
