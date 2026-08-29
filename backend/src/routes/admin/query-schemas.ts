import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { incidentCategorySchema, incidentStatusSchema } from "../../utils/validation.js";

const userIdSchema = z.string().min(1).max(128);

const sortFieldSchema = z.enum([
	"createdAt",
	"updatedAt",
	"status",
	"dataZgloszenia",
	"userId",
	"analystId",
]);

const sortDirectionSchema = z.enum(["asc", "desc"]);

const dateRangeSchema = z
	.strictObject({
		from: z.iso.datetime({ offset: true }).optional(),
		to: z.iso.datetime({ offset: true }).optional(),
	})
	.refine(({ from, to }) => from !== undefined || to !== undefined, {
		message: "Zakres dat musi zawierać co najmniej pole from lub to",
	})
	.refine(({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to), {
		message: "Początek zakresu dat nie może być późniejszy niż koniec",
		path: ["to"],
	})
	.refine(
		({ from, to }) =>
			!from || !to || Date.parse(to) - Date.parse(from) <= 366 * 24 * 60 * 60 * 1000,
		{
			message: "Zakres dat nie może przekraczać 366 dni",
			path: ["to"],
		},
	);

const analyticsRangeSchema = z.union([
	z.strictObject({
		lastDays: z.number().int().min(1).max(365),
	}),
	z
		.strictObject({
			from: z.iso.datetime({ offset: true }),
			to: z.iso.datetime({ offset: true }),
		})
		.refine(({ from, to }) => Date.parse(from) <= Date.parse(to), {
			message: "Początek zakresu dat nie może być późniejszy niż koniec",
			path: ["to"],
		})
		.refine(({ from, to }) => Date.parse(to) - Date.parse(from) <= 366 * 24 * 60 * 60 * 1000, {
			message: "Zakres dat nie może przekraczać 366 dni",
			path: ["to"],
		}),
]);

const timezoneSchema = z
	.string()
	.min(1)
	.max(100)
	.refine(
		(timezone) => {
			try {
				new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
				return true;
			} catch {
				return false;
			}
		},
		{ message: "Nieprawidłowa strefa czasowa" },
	);

export const adminIncidentsQuerySchema = z
	.strictObject({
		pagination: z
			.strictObject({
				page: z.number().int().min(1).max(1000).default(1),
				limit: z.number().int().min(1).max(100).default(20),
			})
			.default({ page: 1, limit: 20 }),
		filters: z
			.strictObject({
				statuses: z.array(incidentStatusSchema).max(6).optional(),
				search: z.string().trim().min(1).max(200).optional(),
				analystIds: z.array(userIdSchema).max(50).optional(),
				assignment: z.enum(["all", "assigned", "unassigned"]).default("all"),
				resolved: z.boolean().optional(),
				createdAt: dateRangeSchema.optional(),
				categories: z.array(incidentCategorySchema).max(3).optional(),
			})
			.default({ assignment: "all" }),
		sort: z
			.array(
				z.strictObject({
					field: sortFieldSchema,
					direction: sortDirectionSchema,
				}),
			)
			.min(1)
			.max(3)
			.default([{ field: "createdAt", direction: "desc" }]),
	})
	.refine(({ filters }) => filters.assignment !== "unassigned" || !filters.analystIds?.length, {
		message: "Nie można łączyć assignment=unassigned z analystIds",
		path: ["filters", "analystIds"],
	});

const analyticsMetricSchema = z.enum([
	"incidentsCreated",
	"incidentsResolved",
	"averageResolutionTime",
	"topUsers",
	"topAnalysts",
]);

export const adminMetricsQuerySchema = z.strictObject({
	range: analyticsRangeSchema.default({ lastDays: 30 }),
	timezone: timezoneSchema.default("Europe/Warsaw"),
	groupBy: z.enum(["day", "week", "month"]).default("day"),
	filters: z
		.strictObject({
			statuses: z.array(incidentStatusSchema).max(6).optional(),
			categories: z.array(incidentCategorySchema).max(3).optional(),
			analystIds: z.array(userIdSchema).max(50).optional(),
		})
		.default({}),
	metrics: z
		.array(analyticsMetricSchema)
		.min(1)
		.max(5)
		.default([
			"incidentsCreated",
			"incidentsResolved",
			"averageResolutionTime",
			"topUsers",
			"topAnalysts",
		]),
});

export type AdminIncidentsQuery = z.infer<typeof adminIncidentsQuerySchema>;
export type AdminMetricsQuery = z.infer<typeof adminMetricsQuerySchema>;

export function requireQueryJson(req: Request, res: Response, next: NextFunction): void {
	if (!req.is("application/json")) {
		res.status(415)
			.set("Accept-Query", "application/json")
			.json({
				success: false,
				error: {
					code: "UNSUPPORTED_QUERY_MEDIA_TYPE",
					message: "Metoda QUERY wymaga Content-Type: application/json",
				},
			});
		return;
	}

	next();
}

export function setQueryResponseHeaders(_req: Request, res: Response, next: NextFunction): void {
	res.set({
		"Accept-Query": "application/json",
		"Cache-Control": "private, no-store",
	});
	next();
}

export function setDeprecatedGetHeaders(documentationAnchor: string) {
	return (_req: Request, res: Response, next: NextFunction): void => {
		res.set({
			Deprecation: "@1786665600",
			Sunset: "Sun, 14 Feb 2027 00:00:00 GMT",
			Link: `</docs/backend/api#${documentationAnchor}>; rel="deprecation"`,
			"Accept-Query": "application/json",
			"Cache-Control": "private, no-store",
		});
		next();
	};
}

export function rejectUnsupportedQueryMethod(allow: string) {
	return (req: Request, res: Response): void => {
		res.set({ Allow: allow, "Accept-Query": "application/json" });
		if (req.method === "OPTIONS") {
			res.status(204).end();
			return;
		}

		res.status(405).json({
			success: false,
			error: {
				code: "METHOD_NOT_ALLOWED",
				message: "Ta operacja obsługuje metody GET i QUERY",
			},
		});
	};
}

export function adminIncidentsQueryFromLegacyGet(query: Request["query"]): unknown {
	const analystId = typeof query.analystId === "string" ? query.analystId : undefined;

	return {
		pagination: {
			page: Number(query.page ?? 1),
			limit: Number(query.limit ?? 20),
		},
		filters: {
			statuses: typeof query.status === "string" ? [query.status] : undefined,
			search:
				typeof query.userQuery === "string" && query.userQuery
					? query.userQuery
					: undefined,
			analystIds: analystId && analystId !== "null" ? [analystId] : undefined,
			assignment: analystId === "null" ? "unassigned" : "all",
		},
		sort: [
			{
				field: typeof query.sortBy === "string" ? query.sortBy : "createdAt",
				direction: typeof query.sortOrder === "string" ? query.sortOrder : "desc",
			},
		],
	};
}

export function adminMetricsQueryFromLegacyGet(query: Request["query"]): unknown {
	return {
		range: {
			lastDays: Number(query.period ?? 30),
		},
		timezone: "Europe/Warsaw",
		groupBy: "day",
	};
}
