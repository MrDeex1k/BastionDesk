import { describe, expect, mock, test } from "bun:test";
import type { QueryResultRow } from "pg";
import type { query, queryOne } from "../../lib/database.js";
import { adminIncidentsQuerySchema, adminMetricsQuerySchema } from "./query-schemas.js";

await mock.module("../../middleware/auth.middleware.js", () => ({
	getRequiredOrganizationId: () => "organization-1",
}));

const { executeIncidentMetricsQuery } = await import("./analytics.js");
const { executeAdminIncidentsQuery } = await import("./incidents.js");

interface QueryCall {
	sql: string;
	params: unknown[];
}

describe("admin QUERY execution", () => {
	test("normalizes PostgreSQL aggregate values and reuses one analytics range", async () => {
		const input = adminMetricsQuerySchema.parse({
			range: { lastDays: 30 },
			timezone: "Europe/Warsaw",
			metrics: [
				"incidentsCreated",
				"incidentsResolved",
				"averageResolutionTime",
				"topUsers",
				"topAnalysts",
			],
		});
		const calls: QueryCall[] = [];
		const queryExecutor = (async <T extends QueryResultRow>(
			sql: string,
			params: unknown[] = [],
		): Promise<T[]> => {
			calls.push({ sql, params });

			if (sql.includes("avg_time_hours")) {
				return [{ date: "2026-08-01", avg_time_hours: "2.75" }] as unknown as T[];
			}
			if (sql.includes('as "userName"')) {
				return [{ userId: "user-1", userName: "User", count: "4" }] as unknown as T[];
			}
			if (sql.includes('as "analystName"')) {
				return [
					{ analystId: "analyst-1", analystName: "Analyst", resolved: "3" },
				] as unknown as T[];
			}
			if (sql.includes('i."dataRozwiazania"')) {
				return [{ date: "2026-08-01", count: "2" }] as unknown as T[];
			}

			return [{ date: "2026-08-01", count: "5" }] as unknown as T[];
		}) as typeof query;

		const result = await executeIncidentMetricsQuery(input, "organization-1", queryExecutor);

		expect(result.timeSeries.incidentsCreated[0]?.count).toBe(5);
		expect(result.timeSeries.incidentsResolved[0]?.count).toBe(2);
		expect(result.timeSeries.avgResolutionTimeHours).toEqual([
			{ date: "2026-08-01", avg_time_hours: 2.75 },
		]);
		expect(result.topUsers[0]?.count).toBe(4);
		expect(result.topAnalysts[0]?.resolved).toBe(3);

		for (const call of calls) {
			expect(call.params[0]).toBe("organization-1");
			expect(call.params[1]).toBe(result.period.startDate);
			expect(call.params[2]).toBe(result.period.endDate);
		}
	});

	test("executes only the requested analytics metrics", async () => {
		const input = adminMetricsQuerySchema.parse({
			range: {
				from: "2026-08-01T00:00:00.000Z",
				to: "2026-08-02T00:00:00.000Z",
			},
			metrics: ["averageResolutionTime"],
		});
		let queryCount = 0;
		const queryExecutor = (async <T extends QueryResultRow>(): Promise<T[]> => {
			queryCount++;
			return [{ date: "2026-08-01", avg_time_hours: 1.5 }] as unknown as T[];
		}) as typeof query;

		const result = await executeIncidentMetricsQuery(input, "organization-1", queryExecutor);

		expect(queryCount).toBe(1);
		expect(result.timeSeries.incidentsCreated).toEqual([]);
		expect(result.timeSeries.incidentsResolved).toEqual([]);
		expect(result.topUsers).toEqual([]);
		expect(result.topAnalysts).toEqual([]);
	});

	test("maps incident metadata and count results without losing organization scope", async () => {
		const input = adminIncidentsQuerySchema.parse({
			pagination: { page: 2, limit: 10 },
			filters: { search: "Alice" },
			sort: [{ field: "updatedAt", direction: "asc" }],
		});
		const listCalls: QueryCall[] = [];
		const countCalls: QueryCall[] = [];
		const queryExecutor = (async <T extends QueryResultRow>(
			sql: string,
			params: unknown[] = [],
		): Promise<T[]> => {
			listCalls.push({ sql, params });
			return [
				{
					id: "incident-1",
					userScreenshotMetadata: '{"name":"screenshot.png"}',
					userAttachmentMetadata: null,
					analystReportMetadata: null,
					analystStatementMetadata: null,
				},
			] as unknown as T[];
		}) as typeof query;
		const queryOneExecutor = (async <T extends QueryResultRow>(
			sql: string,
			params: unknown[] = [],
		): Promise<T | null> => {
			countCalls.push({ sql, params });
			return { count: "23" } as unknown as T;
		}) as typeof queryOne;

		const result = await executeAdminIncidentsQuery(
			input,
			"organization-1",
			queryExecutor,
			queryOneExecutor,
		);

		expect(result.incidents[0]?.userScreenshotMetadata).toEqual({ name: "screenshot.png" });
		expect(result.pagination).toEqual({ page: 2, limit: 10, total: 23, totalPages: 3 });
		expect(listCalls[0]?.sql).toContain('WHERE i."organizationId" = $1');
		expect(listCalls[0]?.sql).toContain('ORDER BY i."updatedAt" ASC, i.id ASC');
		expect(listCalls[0]?.params).toEqual(["organization-1", "%Alice%", 10, 10]);
		expect(countCalls[0]?.sql).toContain('WHERE i."organizationId" = $1');
		expect(countCalls[0]?.params).toEqual(["organization-1", "%Alice%"]);
	});
});
