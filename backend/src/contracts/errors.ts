import { z } from "zod";

// Compatibility constructor: legacy details remain unchanged at the HTTP edge.
export function errorResponse(code: string, message: string, details?: unknown) {
	return {
		success: false as const,
		error: { code, message, ...(details !== undefined ? { details } : {}) },
	};
}

const catalog = {
	VALIDATION_ERROR: { status: 400, message: "Błąd walidacji danych", retryable: false },
	UNAUTHORIZED: { status: 401, message: "Wymagane zalogowanie", retryable: false },
	FORBIDDEN: {
		status: 403,
		message: "Brak uprawnień do wykonania tej operacji",
		retryable: false,
	},
	NOT_FOUND: { status: 404, message: "Zasób nie został znaleziony", retryable: false },
	IDEMPOTENCY_CONFLICT: {
		status: 409,
		message: "Klucz operacji został użyty z innymi danymi",
		retryable: false,
	},
	OPERATION_IN_PROGRESS: {
		status: 409,
		message: "Operacja jest w trakcie wykonywania",
		retryable: true,
	},
	SERVICE_UNAVAILABLE: {
		status: 503,
		message: "Usługa jest chwilowo niedostępna",
		retryable: true,
	},
	INTERNAL_ERROR: { status: 500, message: "Wystąpił błąd serwera", retryable: false },
} as const;

export type DomainErrorCode = keyof typeof catalog;
export class DomainError extends Error {
	constructor(public readonly code: DomainErrorCode) {
		super(catalog[code].message);
		this.name = "DomainError";
	}
}

export const domainErrorSchema = z.strictObject({
	code: z.enum([
		"VALIDATION_ERROR",
		"UNAUTHORIZED",
		"FORBIDDEN",
		"NOT_FOUND",
		"IDEMPOTENCY_CONFLICT",
		"OPERATION_IN_PROGRESS",
		"SERVICE_UNAVAILABLE",
		"INTERNAL_ERROR",
	]),
	message: z.string(),
});

/** New domain responses; existing endpoint-specific success DTOs remain unchanged. */
export function domainResponseSchema<T extends z.ZodType>(data: T) {
	return z.discriminatedUnion("success", [
		z.strictObject({ success: z.literal(true), data }),
		z.strictObject({ success: z.literal(false), error: domainErrorSchema }),
	]);
}

/** Only allowlisted domain messages cross the HTTP boundary. */
export function domainErrorResponse(error: unknown) {
	const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
	const entry = catalog[code];
	return {
		status: entry.status,
		body: errorResponse(code, entry.message),
		retryable: entry.retryable,
	};
}
