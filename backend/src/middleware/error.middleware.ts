//Obsługa błędów dla całej aplikacji

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { sendErrorResponse } from "../lib/api-response";
import { env } from "../lib/env";
import { LlmServiceError } from "../lib/llm-client";

// Customowe klasy błędów

export class AppError extends Error {
	constructor(
		public statusCode: number,
		public code: string,
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = "AppError";
		Error.captureStackTrace(this, this.constructor);
	}
}

export class ValidationError extends AppError {
	constructor(message: string, details?: unknown) {
		super(400, "VALIDATION_ERROR", message, details);
		this.name = "ValidationError";
	}
}

export class NotFoundError extends AppError {
	constructor(resource = "Zasób") {
		super(404, "NOT_FOUND", `${resource} nie został znaleziony`);
		this.name = "NotFoundError";
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = "Wymagane zalogowanie") {
		super(401, "UNAUTHORIZED", message);
		this.name = "UnauthorizedError";
	}
}

export class ForbiddenError extends AppError {
	constructor(message = "Brak uprawnień do wykonania tej operacji") {
		super(403, "FORBIDDEN", message);
		this.name = "ForbiddenError";
	}
}

export class ConflictError extends AppError {
	constructor(message = "Konflikt danych") {
		super(409, "CONFLICT", message);
		this.name = "ConflictError";
	}
}

export class RateLimitError extends AppError {
	constructor(message = "Zbyt wiele żądań. Spróbuj ponownie później.") {
		super(429, "RATE_LIMIT_EXCEEDED", message);
		this.name = "RateLimitError";
	}
}

export class BadGatewayError extends AppError {
	constructor(message = "Usługa zależna zwróciła nieprawidłową odpowiedź") {
		super(502, "BAD_GATEWAY", message);
		this.name = "BadGatewayError";
	}
}

export class ServiceUnavailableError extends AppError {
	constructor(message = "Usługa jest chwilowo niedostępna") {
		super(503, "SERVICE_UNAVAILABLE", message);
		this.name = "ServiceUnavailableError";
	}
}

export class GatewayTimeoutError extends AppError {
	constructor(message = "Przekroczono czas oczekiwania na usługę zależną") {
		super(504, "GATEWAY_TIMEOUT", message);
		this.name = "GatewayTimeoutError";
	}
}

function sendError(
	res: Response,
	statusCode: number,
	code: string,
	message: string,
	details?: unknown,
): void {
	sendErrorResponse(res, statusCode, code, message, details);
}

// Error Handler Middleware

/**
 * Główny middleware do obsługi błędów
 * Musi być zarejestrowany jako ostatni middleware
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
	if (res.headersSent) {
		return;
	}

	// Log błędu
	console.error("[ERROR]", {
		method: req.method,
		path: req.path,
		name: err.name,
		message: err.message,
		stack: env.NODE_ENV === "development" ? err.stack : undefined,
	});

	// Obsługa błędów Zod
	if (err instanceof ZodError) {
		const formattedErrors = err.issues.map((issue) => ({
			field: issue.path.join("."),
			message: issue.message,
		}));

		sendError(res, 400, "VALIDATION_ERROR", "Błąd walidacji danych", formattedErrors);
		return;
	}

	// Obsługa własnych błędów aplikacji
	if (err instanceof AppError) {
		sendError(
			res,
			err.statusCode,
			err.code,
			err.message,
			err.details && env.NODE_ENV === "development" ? err.details : undefined,
		);
		return;
	}

	if (err instanceof LlmServiceError) {
		sendError(
			res,
			err.statusCode,
			err.code,
			err.message,
			env.NODE_ENV === "development"
				? {
						retryable: err.retryable,
						grpcStatus: err.grpcStatus,
						upstreamDetails: err.details,
					}
				: undefined,
		);
		return;
	}

	const operationalError = err as Error & { code?: string; syscall?: string };
	if (operationalError.name === "AbortError" || operationalError.code === "ETIMEDOUT") {
		sendError(res, 504, "GATEWAY_TIMEOUT", "Przekroczono czas oczekiwania na usługę zależną");
		return;
	}

	if (
		["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(
			operationalError.code ?? "",
		)
	) {
		sendError(res, 503, "SERVICE_UNAVAILABLE", "Usługa zależna jest chwilowo niedostępna");
		return;
	}

	// Obsługa błędów bazy danych PostgreSQL
	if (err.name === "PostgresError" || (err as { code?: string }).code?.startsWith("23")) {
		const pgError = err as { code?: string; constraint?: string };

		// Unique violation
		if (pgError.code === "23505") {
			sendError(
				res,
				409,
				"DUPLICATE_ENTRY",
				"Taki rekord już istnieje",
				env.NODE_ENV === "development" ? pgError.constraint : undefined,
			);
			return;
		}

		// Foreign key violation
		if (pgError.code === "23503") {
			sendError(
				res,
				400,
				"INVALID_REFERENCE",
				"Nieprawidłowe odwołanie do powiązanego zasobu",
			);
			return;
		}

		// Not null violation
		if (pgError.code === "23502") {
			sendError(res, 400, "MISSING_REQUIRED_FIELD", "Brakuje wymaganego pola");
			return;
		}
	}

	// Domyślna obsługa nieznanych błędów
	sendError(
		res,
		500,
		"INTERNAL_ERROR",
		env.NODE_ENV === "development" ? err.message : "Wystąpił błąd serwera",
		env.NODE_ENV === "development" ? { stack: err.stack } : undefined,
	);
}

// Async Handler Wrapper

/**
 * Wrapper dla async route handlers - automatycznie przekazuje błędy do error middleware
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await getUsers();
 *   res.json({ success: true, data: users });
 * }));
 */
export function asyncHandler<T extends Request = Request>(
	fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
	return (req: Request, res: Response, next: NextFunction): void => {
		Promise.resolve(fn(req as T, res, next)).catch(next);
	};
}

// Not Found Handler

/**
 * Middleware dla nieznalezionych tras (404)
 * Musi być zarejestrowany przed errorHandler
 */
export function notFoundHandler(req: Request, res: Response): void {
	res.status(404).json({
		success: false,
		error: {
			code: "NOT_FOUND",
			message: `Endpoint ${req.method} ${req.path} nie istnieje`,
		},
	});
}
