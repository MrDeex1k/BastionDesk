import { describe, expect, test } from "bun:test";
import { isCsrfSafeMethod } from "../../lib/csrf.js";
import {
	adminIncidentsQueryFromLegacyGet,
	adminIncidentsQuerySchema,
	adminMetricsQueryFromLegacyGet,
	adminMetricsQuerySchema,
} from "./query-schemas.js";

describe("admin QUERY schemas", () => {
	test("parses an advanced incident query", () => {
		const result = adminIncidentsQuerySchema.parse({
			pagination: { page: 2, limit: 50 },
			filters: {
				statuses: ["Zgłoszony", "Raport w trakcie"],
				assignment: "assigned",
				analystIds: ["A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6"],
				createdAt: {
					from: "2026-07-01T00:00:00Z",
					to: "2026-08-01T00:00:00Z",
				},
			},
			sort: [{ field: "createdAt", direction: "desc" }],
		});

		expect(result.pagination).toEqual({ page: 2, limit: 50 });
		expect(result.filters.assignment).toBe("assigned");
	});

	test("rejects contradictory incident assignment filters", () => {
		const result = adminIncidentsQuerySchema.safeParse({
			filters: {
				assignment: "unassigned",
				analystIds: ["A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6"],
			},
		});

		expect(result.success).toBe(false);
	});

	test("applies incident query defaults", () => {
		const result = adminIncidentsQuerySchema.parse({});

		expect(result.pagination).toEqual({ page: 1, limit: 20 });
		expect(result.filters).toEqual({ assignment: "all" });
		expect(result.sort).toEqual([{ field: "createdAt", direction: "desc" }]);
	});

	test("rejects excessive incident limits, date ranges and unknown fields", () => {
		expect(
			adminIncidentsQuerySchema.safeParse({ pagination: { page: 1, limit: 101 } }).success,
		).toBe(false);
		expect(
			adminIncidentsQuerySchema.safeParse({ pagination: { page: 1001, limit: 20 } }).success,
		).toBe(false);
		expect(
			adminIncidentsQuerySchema.safeParse({
				filters: {
					createdAt: {
						from: "2025-01-01T00:00:00Z",
						to: "2026-08-01T00:00:00Z",
					},
				},
			}).success,
		).toBe(false);
		expect(adminIncidentsQuerySchema.safeParse({ unexpected: true }).success).toBe(false);
	});

	test("maps the legacy incident GET contract", () => {
		const legacy = adminIncidentsQueryFromLegacyGet({
			page: "3",
			limit: "10",
			status: "Zgłoszony",
			analystId: "null",
			sortBy: "updatedAt",
			sortOrder: "asc",
		});
		const result = adminIncidentsQuerySchema.parse(legacy);

		expect(result.pagination.page).toBe(3);
		expect(result.filters.assignment).toBe("unassigned");
		expect(result.filters.statuses).toEqual(["Zgłoszony"]);
	});

	test("parses the legacy metrics GET contract with future-ready defaults", () => {
		const legacy = adminMetricsQueryFromLegacyGet({ period: "90" });
		const result = adminMetricsQuerySchema.parse(legacy);

		expect(result.range).toEqual({ lastDays: 90 });
		expect(result.groupBy).toBe("day");
		expect(result.metrics).toHaveLength(5);
	});

	test("rejects invalid analytics ranges and timezones", () => {
		expect(
			adminMetricsQuerySchema.safeParse({
				range: {
					from: "2026-08-01T00:00:00Z",
					to: "2026-07-01T00:00:00Z",
				},
			}).success,
		).toBe(false);
		expect(adminMetricsQuerySchema.safeParse({ timezone: "Not/A-Timezone" }).success).toBe(
			false,
		);
	});

	test("rejects duplicate-shape analytics ranges and empty metric selections", () => {
		expect(
			adminMetricsQuerySchema.safeParse({
				range: {
					lastDays: 30,
					from: "2026-08-01T00:00:00Z",
					to: "2026-08-02T00:00:00Z",
				},
			}).success,
		).toBe(false);
		expect(adminMetricsQuerySchema.safeParse({ metrics: [] }).success).toBe(false);
	});

	test("treats QUERY as a CSRF-safe method", () => {
		expect(isCsrfSafeMethod("QUERY")).toBe(true);
	});
});
