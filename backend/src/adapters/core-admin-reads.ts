import { query, queryOne } from "../lib/database";
import type { Incident } from "../types";
import type { AdminIncidentsQuery } from "../contracts/admin-queries";
interface AdminIncidentFilterOption {
	id: string;
	name: string | null;
	email: string;
	role: string | null;
}

const ADMIN_INCIDENT_SORT_COLUMNS: Record<string, string> = {
	createdAt: 'i."createdAt"',
	updatedAt: 'i."updatedAt"',
	status: "i.status",
	dataZgloszenia: 'i."dataZgloszenia"',
	userId: 'i."userId"',
	analystId: 'i."analystId"',
};

function getAdminIncidentOrderBy(sort: AdminIncidentsQuery["sort"]): string {
	const clauses = sort.map(
		({ field, direction }) =>
			`${ADMIN_INCIDENT_SORT_COLUMNS[field] ?? ADMIN_INCIDENT_SORT_COLUMNS.createdAt} ${direction.toUpperCase()}`,
	);

	return [...clauses, "i.id ASC"].join(", ");
}

export async function executeAdminIncidentsQuery(
	input: AdminIncidentsQuery,
	organizationId: string,
	queryExecutor: typeof query = query,
	queryOneExecutor: typeof queryOne = queryOne,
) {
	const { page, limit } = input.pagination;
	const { filters } = input;
	const orderBy = getAdminIncidentOrderBy(input.sort);
	let whereClause = 'WHERE i."organizationId" = $1';
	const params: unknown[] = [organizationId];
	let paramIndex = 2;

	if (filters.statuses?.length) {
		whereClause += ` AND i.status = ANY($${paramIndex}::"IncidentStatus"[])`;
		params.push(filters.statuses);
		paramIndex++;
	}

	if (filters.search) {
		whereClause += ` AND (
			i."userId" ILIKE $${paramIndex}
			OR COALESCE(u.name, '') ILIKE $${paramIndex}
			OR COALESCE(u.email, '') ILIKE $${paramIndex}
		)`;
		params.push(`%${filters.search}%`);
		paramIndex++;
	}

	if (filters.assignment === "unassigned") {
		whereClause += ' AND i."analystId" IS NULL';
	} else if (filters.assignment === "assigned") {
		whereClause += ' AND i."analystId" IS NOT NULL';
	}

	if (filters.analystIds?.length) {
		whereClause += ` AND i."analystId" = ANY($${paramIndex}::text[])`;
		params.push(filters.analystIds);
		paramIndex++;
	}

	if (filters.resolved !== undefined) {
		whereClause += ` AND i."czyRozwiazany" = $${paramIndex}`;
		params.push(filters.resolved);
		paramIndex++;
	}

	if (filters.createdAt?.from) {
		whereClause += ` AND i."createdAt" >= $${paramIndex}`;
		params.push(filters.createdAt.from);
		paramIndex++;
	}

	if (filters.createdAt?.to) {
		whereClause += ` AND i."createdAt" <= $${paramIndex}`;
		params.push(filters.createdAt.to);
		paramIndex++;
	}

	if (filters.categories?.length) {
		whereClause += ` AND i."llmCategory" = ANY($${paramIndex}::"IncidentCategory"[])`;
		params.push(filters.categories);
		paramIndex++;
	}

	const offset = (page - 1) * limit;
	const incidents = await queryExecutor<Incident & { userName?: string; analystName?: string }>(
		`
		SELECT
			i.id,
			i."dataZgloszenia",
			i."userId",
			i."organizationId",
			i.status,
			i."userDescription",
			i."userScreenshotPath",
			i."userScreenshotMetadata",
			i."userAttachmentPath",
			i."userAttachmentMetadata",
			i."analystId",
			i."analystNote",
			i."czyRozwiazany",
			i."dataRozwiazania",
			i."analystReportPath",
			i."analystReportMetadata",
			i."analystReportData",
			i."analystStatementPath",
			i."analystStatementMetadata",
			i."analystStatementData",
			i."llmCategory",
			i."createdAt",
			i."updatedAt",
			u.name as "userName",
			a.name as "analystName"
		FROM incidents i
		LEFT JOIN "user" u ON i."userId" = u.id
		LEFT JOIN "user" a ON i."analystId" = a.id
		${whereClause}
		ORDER BY ${orderBy}
		LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
	`,
		[...params, limit, offset],
	);

	for (const incident of incidents) {
		for (const metadataKey of [
			"userScreenshotMetadata",
			"userAttachmentMetadata",
			"analystReportMetadata",
			"analystStatementMetadata",
		] as const) {
			if (typeof incident[metadataKey] === "string") {
				try {
					incident[metadataKey] = JSON.parse(incident[metadataKey]);
				} catch (error) {
					console.error(`[ADMIN] Failed to parse ${metadataKey}:`, error);
				}
			}
		}
	}

	const countResult = await queryOneExecutor<{ count: string }>(
		`
		SELECT COUNT(*)::text as count
		FROM incidents i
		LEFT JOIN "user" u ON i."userId" = u.id
		LEFT JOIN "user" a ON i."analystId" = a.id
		${whereClause}
	`,
		params,
	);
	const total = Number.parseInt(countResult?.count ?? "0", 10);

	return {
		incidents,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

export async function readIncidentFilters(organizationId: string) {
	const analysts = await query<AdminIncidentFilterOption>(
		`
				SELECT
				u.id,
				u.name,
				u.email,
				m.role
			FROM (
				SELECT m."userId"
				FROM member m
				WHERE m."organizationId" = $1 AND m.role IN ('analityk', 'admin')
				UNION
				SELECT i."analystId" AS "userId"
				FROM incidents i
				WHERE i."organizationId" = $1 AND i."analystId" IS NOT NULL
			) candidates
			JOIN "user" u ON u.id = candidates."userId"
			LEFT JOIN member m
				ON m."organizationId" = $1
				AND m."userId" = u.id
			ORDER BY COALESCE(NULLIF(u.name, ''), u.email), u.id
		`,
		[organizationId],
	);

	return { analysts };
}

export async function readIncidentSummary(organizationId: string) {
	// Liczba zgłoszeń ogółem
	const totalResult = await queryOne<{ count: string }>(
		`SELECT COUNT(*)::text as count FROM incidents
			WHERE "organizationId" = $1`,
		[organizationId],
	);
	const totalIncidents = Number.parseInt(totalResult?.count || "0", 10);

	// Liczba rozwiązanych
	const resolvedResult = await queryOne<{ count: string }>(
		`SELECT COUNT(*)::text as count FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true`,
		[organizationId],
	);
	const resolvedIncidents = Number.parseInt(resolvedResult?.count || "0", 10);

	// Procent rozwiązanych
	const resolvedPercentage =
		totalIncidents > 0 ? ((resolvedIncidents / totalIncidents) * 100).toFixed(2) : "0.00";

	// Średni czas rozwiązywania (w sekundach)
	const avgTimeResult = await queryOne<{ avg_seconds: string }>(
		`SELECT 
				AVG(EXTRACT(EPOCH FROM ("dataRozwiazania" - "dataZgloszenia")))::text as avg_seconds
			FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true AND "dataRozwiazania" IS NOT NULL`,
		[organizationId],
	);

	const avgSeconds = Number.parseFloat(avgTimeResult?.avg_seconds || "0");

	// Przelicz na dni, godziny, minuty, sekundy
	const days = Math.floor(avgSeconds / 86400);
	const hours = Math.floor((avgSeconds % 86400) / 3600);
	const minutes = Math.floor((avgSeconds % 3600) / 60);
	const seconds = Math.floor(avgSeconds % 60);

	return {
		success: true,
		data: {
			totalIncidents,
			resolvedIncidents,
			unresolvedIncidents: totalIncidents - resolvedIncidents,
			resolvedPercentage: `${resolvedPercentage}%`,
			averageResolutionTime: {
				totalSeconds: avgSeconds,
				formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
				days,
				hours,
				minutes,
				seconds,
			},
		},
	};
}
