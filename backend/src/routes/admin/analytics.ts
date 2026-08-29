import type { Request, Response } from "express";
import { Router } from "express";
import { query, queryOne } from "../../lib/database.js";
import {
	type AuthenticatedRequest,
	getRequiredOrganizationId,
} from "../../middleware/auth.middleware.js";
import { validate } from "../../utils/validation.js";
import {
	adminMetricsQueryFromLegacyGet,
	adminMetricsQuerySchema,
	type AdminMetricsQuery,
	rejectUnsupportedQueryMethod,
	requireQueryJson,
	setDeprecatedGetHeaders,
	setQueryResponseHeaders,
} from "./query-schemas.js";

const router = Router();

// Autoryzacja i sprawdzanie roli admin są już zrobione w admin/index.ts

/**
 * Pobierz podstawowe statystyki incydentów dla organizacji administratora
 */
async function getIncidentStats(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;

		// Pobierz całkowitą liczbę incydentów
		const totalResult = await queryOne<{ count: string }>(
			`
			SELECT COUNT(*) as count FROM incidents WHERE "organizationId" = $1
		`,
			[organizationId],
		);

		const totalIncidents = parseInt(totalResult?.count || "0", 10);

		// Pobierz liczbę rozwiązanych incydentów
		const resolvedResult = await queryOne<{ count: string }>(
			`
			SELECT COUNT(*) as count FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true
		`,
			[organizationId],
		);

		const resolvedIncidents = parseInt(resolvedResult?.count || "0", 10);

		// Oblicz procent rozwiązanych
		const resolvedPercentage =
			totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 0;

		// Pobierz średni czas rozwiązywania w sekundach
		const avgTimeResult = await queryOne<{ avg_time_seconds: number | null }>(
			`
			SELECT
				AVG(EXTRACT(EPOCH FROM ("dataRozwiazania" - "dataZgloszenia"))) as avg_time_seconds
			FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true AND "dataRozwiazania" IS NOT NULL
		`,
			[organizationId],
		);

		let avgResolutionTime = null;
		if (avgTimeResult?.avg_time_seconds) {
			const totalSeconds = Math.floor(avgTimeResult.avg_time_seconds);
			const days = Math.floor(totalSeconds / 86400);
			const hours = Math.floor((totalSeconds % 86400) / 3600);
			const minutes = Math.floor((totalSeconds % 3600) / 60);
			const seconds = totalSeconds % 60;

			avgResolutionTime = {
				days,
				hours,
				minutes,
				seconds,
				totalSeconds,
			};
		}

		// Pobierz rozkład po statusach
		const statusStatsRaw = await query<{ status: string; count: string }>(
			`
			SELECT status, COUNT(*) as count
			FROM incidents
			WHERE "organizationId" = $1
			GROUP BY status
			ORDER BY count DESC
		`,
			[organizationId],
		);

		const statusStats = statusStatsRaw.map((stat) => ({
			status: stat.status,
			count: parseInt(stat.count, 10),
		}));

		// Pobierz rozkład po kategoriach LLM
		const categoryStatsRaw = await query<{ category: string; count: string }>(
			`
			SELECT "llmCategory" as category, COUNT(*) as count
			FROM incidents
			WHERE "organizationId" = $1 AND "llmCategory" IS NOT NULL
			GROUP BY "llmCategory"
			ORDER BY count DESC
		`,
			[organizationId],
		);

		const categoryStats = categoryStatsRaw.map((stat) => ({
			category: stat.category,
			count: parseInt(stat.count, 10),
		}));

		res.json({
			success: true,
			data: {
				totalIncidents,
				resolvedIncidents,
				resolvedPercentage: Math.round(resolvedPercentage * 100) / 100, // Zaokrąglij do 2 miejsc po przecinku
				avgResolutionTime,
				statusBreakdown: statusStats,
				categoryBreakdown: categoryStats,
			},
		});
	} catch (error) {
		console.error("[ADMIN] Get incident stats error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_STATS_ERROR",
				message: "Nie udało się pobrać statystyk",
			},
		});
	}
}

interface MetricsRange {
	startDate: Date;
	endDate: Date;
	days: number;
}

function getMetricsRange(range: AdminMetricsQuery["range"]): MetricsRange {
	if ("lastDays" in range) {
		const endDate = new Date();
		const startDate = new Date(endDate);
		startDate.setUTCDate(startDate.getUTCDate() - range.lastDays);
		return { startDate, endDate, days: range.lastDays };
	}

	const startDate = new Date(range.from);
	const endDate = new Date(range.to);
	const days = Math.max(
		1,
		Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
	);
	return { startDate, endDate, days };
}

function buildMetricsWhere(
	input: AdminMetricsQuery,
	organizationId: string,
	dateColumn: 'i."createdAt"' | 'i."dataRozwiazania"',
	range: MetricsRange,
) {
	const { startDate, endDate } = range;
	const params: unknown[] = [organizationId, startDate.toISOString(), endDate.toISOString()];
	let clause = `WHERE i."organizationId" = $1 AND ${dateColumn} >= $2 AND ${dateColumn} <= $3`;
	let paramIndex = 4;

	if (input.filters.statuses?.length) {
		clause += ` AND i.status = ANY($${paramIndex}::"IncidentStatus"[])`;
		params.push(input.filters.statuses);
		paramIndex++;
	}

	if (input.filters.categories?.length) {
		clause += ` AND i."llmCategory" = ANY($${paramIndex}::"IncidentCategory"[])`;
		params.push(input.filters.categories);
		paramIndex++;
	}

	if (input.filters.analystIds?.length) {
		clause += ` AND i."analystId" = ANY($${paramIndex}::text[])`;
		params.push(input.filters.analystIds);
	}

	return { clause, params };
}

function getTimeBucketExpression(
	column: 'i."createdAt"' | 'i."dataRozwiazania"',
	groupBy: AdminMetricsQuery["groupBy"],
	timezoneParameter: number,
): string {
	const localizedColumn = `${column} AT TIME ZONE 'UTC' AT TIME ZONE $${timezoneParameter}`;

	if (groupBy === "week") {
		return `DATE_TRUNC('week', ${localizedColumn})::date`;
	}
	if (groupBy === "month") {
		return `DATE_TRUNC('month', ${localizedColumn})::date`;
	}
	return `DATE(${localizedColumn})`;
}

export async function executeIncidentMetricsQuery(
	input: AdminMetricsQuery,
	organizationId: string,
	queryExecutor: typeof query = query,
) {
	const selectedMetrics = new Set(input.metrics);
	const metricsRange = getMetricsRange(input.range);
	const createdWhere = buildMetricsWhere(input, organizationId, 'i."createdAt"', metricsRange);
	const resolvedWhere = buildMetricsWhere(
		input,
		organizationId,
		'i."dataRozwiazania"',
		metricsRange,
	);
	const createdBucket = getTimeBucketExpression(
		'i."createdAt"',
		input.groupBy,
		createdWhere.params.length + 1,
	);
	const resolvedBucket = getTimeBucketExpression(
		'i."dataRozwiazania"',
		input.groupBy,
		resolvedWhere.params.length + 1,
	);

	const [periodStats, resolutionStats, averageResolutionStats, userStats, analystStats] =
		await Promise.all([
			selectedMetrics.has("incidentsCreated")
				? queryExecutor<{ date: string; count: string }>(
						`
						SELECT ${createdBucket} as date, COUNT(*)::text as count
						FROM incidents i
						${createdWhere.clause}
						GROUP BY ${createdBucket}
						ORDER BY date
					`,
						[...createdWhere.params, input.timezone],
					)
				: Promise.resolve([]),
			selectedMetrics.has("incidentsResolved")
				? queryExecutor<{ date: string; count: string }>(
						`
						SELECT ${resolvedBucket} as date, COUNT(*)::text as count
						FROM incidents i
						${resolvedWhere.clause} AND i."czyRozwiazany" = true
						GROUP BY ${resolvedBucket}
						ORDER BY date
					`,
						[...resolvedWhere.params, input.timezone],
					)
				: Promise.resolve([]),
			selectedMetrics.has("averageResolutionTime")
				? queryExecutor<{ date: string; avg_time_hours: string | number }>(
						`
						SELECT
							${resolvedBucket} as date,
							AVG(EXTRACT(EPOCH FROM (i."dataRozwiazania" - i."dataZgloszenia")) / 3600) as avg_time_hours
						FROM incidents i
						${resolvedWhere.clause} AND i."czyRozwiazany" = true
						GROUP BY ${resolvedBucket}
						ORDER BY date
					`,
						[...resolvedWhere.params, input.timezone],
					)
				: Promise.resolve([]),
			selectedMetrics.has("topUsers")
				? queryExecutor<{ userId: string; userName: string; count: string }>(
						`
						SELECT i."userId", u.name as "userName", COUNT(*) as count
						FROM incidents i
						LEFT JOIN "user" u ON i."userId" = u.id
						${createdWhere.clause}
						GROUP BY i."userId", u.name
						ORDER BY count DESC
						LIMIT 10
					`,
						createdWhere.params,
					)
				: Promise.resolve([]),
			selectedMetrics.has("topAnalysts")
				? queryExecutor<{
						analystId: string;
						analystName: string;
						resolved: string;
					}>(
						`
						SELECT i."analystId", a.name as "analystName", COUNT(*) as resolved
						FROM incidents i
						LEFT JOIN "user" a ON i."analystId" = a.id
						${resolvedWhere.clause}
							AND i."czyRozwiazany" = true
							AND i."analystId" IS NOT NULL
						GROUP BY i."analystId", a.name
						ORDER BY resolved DESC
						LIMIT 10
					`,
						resolvedWhere.params,
					)
				: Promise.resolve([]),
		]);

	const { startDate, endDate, days } = metricsRange;
	return {
		period: {
			days,
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
			timezone: input.timezone,
			groupBy: input.groupBy,
		},
		timeSeries: {
			incidentsCreated: periodStats.map(({ date, count }) => ({
				date,
				count: Number(count),
			})),
			incidentsResolved: resolutionStats.map(({ date, count }) => ({
				date,
				count: Number(count),
			})),
			avgResolutionTimeHours: averageResolutionStats.map(({ avg_time_hours, ...stat }) => ({
				...stat,
				avg_time_hours: Number(avg_time_hours),
			})),
		},
		topUsers: userStats.map(({ count, ...user }) => ({ ...user, count: Number(count) })),
		topAnalysts: analystStats.map(({ resolved, ...analyst }) => ({
			...analyst,
			resolved: Number(resolved),
		})),
	};
}

/**
 * Pobierz szczegółowe metryki incydentów dla organizacji administratora.
 */
async function queryIncidentMetrics(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;
		const data = await executeIncidentMetricsQuery(
			req.body as AdminMetricsQuery,
			organizationId,
		);

		res.json({
			success: true,
			data,
		});
	} catch (error) {
		console.error("[ADMIN] Get incident metrics error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_METRICS_ERROR",
				message: "Nie udało się pobrać metryk",
			},
		});
	}
}

// Routes
router.get("/stats", getIncidentStats);
router.get(
	"/metrics",
	setDeprecatedGetHeaders("query-admin-analytics-metrics"),
	(req, _res, next) => {
		req.body = adminMetricsQueryFromLegacyGet(req.query);
		next();
	},
	validate(adminMetricsQuerySchema, "body"),
	queryIncidentMetrics,
);
router.query(
	"/metrics",
	requireQueryJson,
	setQueryResponseHeaders,
	validate(adminMetricsQuerySchema, "body"),
	queryIncidentMetrics,
);
router.all("/metrics", rejectUnsupportedQueryMethod("GET, HEAD, QUERY, OPTIONS"));

export default router;
