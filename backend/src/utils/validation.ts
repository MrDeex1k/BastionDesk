//Schematy walidacji Zod dla danych wejściowych API

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { sendErrorResponse } from "../lib/api-response";

export const uuidSchema = z.string().uuid({ message: "Nieprawidłowy format UUID" });

export const emailSchema = z
	.string()
	.email({ message: "Nieprawidłowy adres email" })
	.min(5, { message: "Email musi mieć co najmniej 5 znaków" })
	.max(255, { message: "Email może mieć maksymalnie 255 znaków" });

// Password validation (zgodne z Better-Auth config)
export const passwordSchema = z
	.string()
	.min(10, { message: "Hasło musi mieć co najmniej 10 znaków" })
	.max(128, { message: "Hasło może mieć maksymalnie 128 znaków" });

// Pagination schemas
export const paginationSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Zgodne z 03-create-app.sql: incident_status ENUM
export const incidentStatusSchema = z.enum([
	"Zgłoszony",
	"Raport w trakcie",
	"Raport złożony",
	"Sprawozdanie w trakcie",
	"Sprawozdanie złożone",
	"Odrzucone",
]);

// Zgodne z 03-create-app.sql: incident_category ENUM
export const incidentCategorySchema = z.enum(["Czerwony", "Żółty", "Zielony"]);

// Schemat dla tworzenia incydentu (multipart/form-data)
// Pliki będą obsługiwane oddzielnie przez file middleware
export const createIncidentSchema = z.object({
	userDescription: z
		.string()
		.min(10, { message: "Opis musi mieć co najmniej 10 znaków" })
		.max(5000, { message: "Opis może mieć maksymalnie 5000 znaków" }),
});

// Schemat dla aktualizacji statusu incydentu
export const updateIncidentStatusSchema = z.object({
	status: incidentStatusSchema,
});

// Schemat dla notatek analityka
export const updateIncidentNoteSchema = z.object({
	analystNote: z
		.string()
		.min(1, { message: "Notatka nie może być pusta" })
		.max(10000, { message: "Notatka może mieć maksymalnie 10000 znaków" }),
});

// Schemat dla oznaczania incydentu jako rozwiązany
export const resolveIncidentSchema = z.object({
	resolved: z.boolean(),
});

export const userRoleSchema = z.enum(["admin", "analityk", "pracownik"]);

export const createOrganizationSchema = z.object({
	name: z
		.string()
		.min(2, { message: "Nazwa musi mieć co najmniej 2 znaki" })
		.max(100, { message: "Nazwa może mieć maksymalnie 100 znaków" }),
	slug: z
		.string()
		.min(2, { message: "Slug musi mieć co najmniej 2 znaki" })
		.max(50, { message: "Slug może mieć maksymalnie 50 znaków" })
		.regex(/^[a-z0-9-]+$/, {
			message: "Slug może zawierać tylko małe litery, cyfry i myślniki",
		}),
	logo: z.string().url({ message: "Nieprawidłowy URL logo" }).optional(),
});

export const incidentQuerySchema = paginationSchema.extend({
	status: incidentStatusSchema.optional(),
	userId: uuidSchema.optional(),
	sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

type ValidateTarget = "body" | "query" | "params";

function setValidatedRequestData(req: Request, target: ValidateTarget, result: unknown): void {
	if (target === "query") {
		// Express 5 exposes req.query through a getter, so mutating the temporary
		// object returned by it does not persist parsed defaults or coercions.
		Object.defineProperty(req, target, {
			value: result,
			writable: true,
			enumerable: true,
			configurable: true,
		});
		return;
	}

	req[target] = result;
}

/**
 * Middleware factory do walidacji danych wejściowych
 *
 * @param schema - Schemat Zod do walidacji
 * @param target - Część requestu do walidacji (body, query, params)
 *
 * @example
 * router.post('/incidents', validate(createIncidentSchema, 'body'), handler)
 * router.get('/incidents', validate(incidentQuerySchema, 'query'), handler)
 */
export function validate<T extends z.ZodTypeAny>(schema: T, target: ValidateTarget = "body") {
	return (req: Request, res: Response, next: NextFunction): void => {
		try {
			const data = req[target];
			const result = schema.parse(data);

			// Zastąp oryginalne dane zwalidowanymi (z transformacjami i defaults)
			setValidatedRequestData(req, target, result);

			next();
		} catch (error) {
			if (error instanceof z.ZodError) {
				const formattedErrors = error.issues.map((issue) => ({
					field: issue.path.join("."),
					message: issue.message,
				}));

				sendErrorResponse(
					res,
					400,
					"VALIDATION_ERROR",
					"Błąd walidacji danych",
					formattedErrors,
				);
				return;
			}

			next(error);
		}
	};
}

/**
 * Walidacja wielu części requestu jednocześnie
 *
 * @example
 * router.put('/incidents/:id',
 *   validateMultiple({
 *     params: z.object({ id: uuidSchema }),
 *     body: updateIncidentSchema
 *   }),
 *   handler
 * )
 */
export function validateMultiple(schemas: {
	body?: z.ZodTypeAny;
	query?: z.ZodTypeAny;
	params?: z.ZodTypeAny;
}) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const errors: { target: string; field: string; message: string }[] = [];

		for (const [target, schema] of Object.entries(schemas)) {
			if (!schema) continue;

			try {
				const data = req[target as ValidateTarget];
				const result = schema.parse(data);
				setValidatedRequestData(req, target as ValidateTarget, result);
			} catch (error) {
				if (error instanceof z.ZodError) {
					errors.push(
						...error.issues.map((issue) => ({
							target,
							field: issue.path.join("."),
							message: issue.message,
						})),
					);
				}
			}
		}

		if (errors.length > 0) {
			sendErrorResponse(res, 400, "VALIDATION_ERROR", "Błąd walidacji danych", errors);
			return;
		}

		next();
	};
}

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentStatusInput = z.infer<typeof updateIncidentStatusSchema>;
export type UpdateIncidentNoteInput = z.infer<typeof updateIncidentNoteSchema>;
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;
export type IncidentQueryInput = z.infer<typeof incidentQuerySchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
