import type { NextFunction, Request, Response } from "express";
export {
	adminIncidentsQuerySchema,
	adminMetricsQuerySchema,
	type AdminIncidentsQuery,
	type AdminMetricsQuery,
} from "../../contracts/admin-queries";

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
