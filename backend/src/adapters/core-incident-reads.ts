import type { IncidentReads, IncidentScope } from "../core/incidents/reads";
import { query, queryOne } from "../lib/database";
import type { Incident } from "../types";

const sortColumns: Record<string, string> = {
	createdAt: 'i."createdAt"',
	updatedAt: 'i."updatedAt"',
	status: "i.status",
	dataZgloszenia: 'i."dataZgloszenia"',
	userId: 'i."userId"',
	analystId: 'i."analystId"',
};
function where(scope: IncidentScope) {
	const clauses = ['i."organizationId" = $1'];
	const params: unknown[] = [scope.organizationId];
	for (const [column, value] of [
		["userId", scope.userId],
		["analystId", scope.analystId],
	] as const) {
		if (value) {
			params.push(value);
			clauses.push(`i."${column}" = $${params.length}`);
		}
	}
	if (scope.unassigned) clauses.push('i."analystId" IS NULL');
	return { clauses, params };
}
export const coreIncidentReads: IncidentReads = {
	async list(scope, input) {
		const { clauses, params } = where(scope);
		if (input.status) {
			params.push(input.status);
			clauses.push(`i.status = $${params.length}`);
		}
		const count = await queryOne<{ count: string }>(
			`SELECT count(*)::text AS count FROM incidents i WHERE ${clauses.join(" AND ")}`,
			params,
		);
		const order = `${sortColumns[input.sortBy ?? "createdAt"] ?? sortColumns.createdAt} ${input.sortOrder === "asc" ? "ASC" : "DESC"}`;
		const incidents = await query<Incident>(
			`SELECT i.* FROM incidents i WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
			[...params, input.limit, (input.page - 1) * input.limit],
		);
		return { incidents, total: Number(count?.count ?? 0) };
	},
	async get(scope, id, names) {
		const { clauses, params } = where(scope);
		params.push(id);
		clauses.push(`i.id = $${params.length}`);
		// Compatibility enrichment belongs to this composition adapter, not Core.
		return queryOne<Incident>(
			`SELECT i.* ${names ? ', u.name AS "userName", a.name AS "analystName"' : ""} FROM incidents i ${names ? 'LEFT JOIN "user" u ON u.id = i."userId" LEFT JOIN "user" a ON a.id = i."analystId"' : ""} WHERE ${clauses.join(" AND ")}`,
			params,
		);
	},
};
