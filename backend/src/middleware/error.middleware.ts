//Obsługa błędów dla całej aplikacji

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../lib/env";

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

// Error Handler Middleware

/**
 * Główny middleware do obsługi błędów
 * Musi być zarejestrowany jako ostatni middleware
 */
export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	_next: NextFunction,
): void {
	// Log błędu
	console.error("[ERROR]", {
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

		res.status(400).json({
			success: false,
			error: {
				code: "VALIDATION_ERROR",
				message: "Błąd walidacji danych",
				details: formattedErrors,
			},
		});
		return;
	}

	// Obsługa własnych błędów aplikacji
	if (err instanceof AppError) {
		res.status(err.statusCode).json({
			success: false,
			error: {
				code: err.code,
				message: err.message,
				...(err.details && env.NODE_ENV === "development"
					? { details: err.details }
					: {}),
			},
		});
		return;
	}

	// Obsługa błędów bazy danych PostgreSQL
	if (
		err.name === "PostgresError" ||
		(err as { code?: string }).code?.startsWith("23")
	) {
		const pgError = err as { code?: string; constraint?: string };

		// Unique violation
		if (pgError.code === "23505") {
			res.status(409).json({
				success: false,
				error: {
					code: "DUPLICATE_ENTRY",
					message: "Taki rekord już istnieje",
					...(env.NODE_ENV === "development"
						? { details: pgError.constraint }
						: {}),
				},
			});
			return;
		}

		// Foreign key violation
		if (pgError.code === "23503") {
			res.status(400).json({
				success: false,
				error: {
					code: "INVALID_REFERENCE",
					message: "Nieprawidłowe odwołanie do powiązanego zasobu",
				},
			});
			return;
		}

		// Not null violation
		if (pgError.code === "23502") {
			res.status(400).json({
				success: false,
				error: {
					code: "MISSING_REQUIRED_FIELD",
					message: "Brakuje wymaganego pola",
				},
			});
			return;
		}
	}

	// Domyślna obsługa nieznanych błędów
	res.status(500).json({
		success: false,
		error: {
			code: "INTERNAL_ERROR",
			message:
				env.NODE_ENV === "development" ? err.message : "Wystąpił błąd serwera",
			...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
		},
	});
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
