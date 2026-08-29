import type { Request, Response } from "express";
import { Router } from "express";
import { query, queryOne } from "../../lib/database.js";
import { getObjectBuffer } from "../../lib/storage.js";
import {
	type AuthenticatedRequest,
	getRequiredOrganizationId,
} from "../../middleware/auth.middleware.js";
import type { Incident } from "../../types/index.js";
import { validate } from "../../utils/validation.js";
import {
	createContentDispositionHeader,
	findStoredFileMetadata,
	parseStoredFileMetadata,
	type StoredFileMetadataPayload,
} from "../shared/file-metadata.js";
import {
	adminIncidentsQueryFromLegacyGet,
	adminIncidentsQuerySchema,
	type AdminIncidentsQuery,
	rejectUnsupportedQueryMethod,
	requireQueryJson,
	setDeprecatedGetHeaders,
	setQueryResponseHeaders,
} from "./query-schemas.js";

const router = Router();

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

async function queryAllIncidents(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;
		const input = req.body as AdminIncidentsQuery;
		const result = await executeAdminIncidentsQuery(input, organizationId);

		res.json({
			success: true,
			data: result.incidents,
			pagination: result.pagination,
		});
	} catch (error) {
		console.error("[ADMIN] Get all incidents error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_INCIDENTS_ERROR",
				message: "Nie udało się pobrać zgłoszeń",
			},
		});
	}
}

async function getIncidentFilters(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;

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

		res.json({
			success: true,
			data: {
				analysts,
			},
		});
	} catch (error) {
		console.error("[ADMIN] Get incident filters error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_INCIDENT_FILTERS_ERROR",
				message: "Nie udało się pobrać filtrów incydentów",
			},
		});
	}
}

/**
 * Pobierz szczegóły dowolnego incydentu w organizacji administratora
 */
async function getIncidentDetails(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;
		const { id } = req.params;

		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		// Prosta walidacja UUID
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_ID",
					message: "Nieprawidłowy format ID",
				},
			});
		}

		const incident = await queryOne<Incident & { userName?: string; analystName?: string }>(
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
			WHERE i.id = $1 AND i."organizationId" = $2
		`,
			[id, organizationId],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "INCIDENT_NOT_FOUND",
					message: "Zgłoszenie nie zostało znalezione lub nie masz do niego dostępu",
				},
			});
		}

		// Parsuj metadata z JSON stringów do obiektów
		if (typeof incident.userScreenshotMetadata === "string") {
			try {
				incident.userScreenshotMetadata = JSON.parse(incident.userScreenshotMetadata);
			} catch (e) {
				console.error("[ADMIN] Failed to parse userScreenshotMetadata:", e);
			}
		}
		if (typeof incident.userAttachmentMetadata === "string") {
			try {
				incident.userAttachmentMetadata = JSON.parse(incident.userAttachmentMetadata);
			} catch (e) {
				console.error("[ADMIN] Failed to parse userAttachmentMetadata:", e);
			}
		}
		if (typeof incident.analystReportMetadata === "string") {
			try {
				incident.analystReportMetadata = JSON.parse(incident.analystReportMetadata);
			} catch (e) {
				console.error("[ADMIN] Failed to parse analystReportMetadata:", e);
			}
		}
		if (typeof incident.analystStatementMetadata === "string") {
			try {
				incident.analystStatementMetadata = JSON.parse(incident.analystStatementMetadata);
			} catch (e) {
				console.error("[ADMIN] Failed to parse analystStatementMetadata:", e);
			}
		}

		res.json({
			success: true,
			data: incident,
		});
	} catch (error) {
		console.error("[ADMIN] Get incident details error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_INCIDENT_ERROR",
				message: "Nie udało się pobrać szczegółów zgłoszenia",
			},
		});
	}
}

// Routes
router.get("/filters", getIncidentFilters);
router.get(
	"/",
	setDeprecatedGetHeaders("query-admin-incidents"),
	(req, _res, next) => {
		req.body = adminIncidentsQueryFromLegacyGet(req.query);
		next();
	},
	validate(adminIncidentsQuerySchema, "body"),
	queryAllIncidents,
);
router.query(
	"/",
	requireQueryJson,
	setQueryResponseHeaders,
	validate(adminIncidentsQuerySchema, "body"),
	queryAllIncidents,
);
router.all("/", rejectUnsupportedQueryMethod("GET, HEAD, QUERY, OPTIONS"));
router.get("/:id", getIncidentDetails);

/**
 * Pobierz plik z dowolnego incydentu w organizacji administratora
 */
async function downloadFile(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id, type, filename } = req.params;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;

		// Sprawdź wymagane parametry
		if (!id || !type || !filename) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_PARAMETERS",
					message: "Brak wymaganych parametrów",
				},
			});
		}

		// Walidacja typu pliku
		if (!["screenshots", "attachments", "reports", "statements"].includes(type)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_FILE_TYPE",
					message: "Nieprawidłowy typ pliku",
				},
			});
		}

		// Sprawdź czy incydent istnieje w organizacji administratora
		const incident = await queryOne<{ organizationId: string }>(
			`
			SELECT "organizationId" FROM incidents
			WHERE id = $1 AND "organizationId" = $2
		`,
			[id, organizationId],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "INCIDENT_NOT_FOUND",
					message: "Zgłoszenie nie zostało znalezione",
				},
			});
		}

		// Sprawdź metadane pliku w bazie danych
		const pathColumn =
			type === "screenshots"
				? "userScreenshotPath"
				: type === "attachments"
					? "userAttachmentPath"
					: type === "reports"
						? "analystReportPath"
						: "analystStatementPath";

		const metadataColumn =
			type === "screenshots"
				? "userScreenshotMetadata"
				: type === "attachments"
					? "userAttachmentMetadata"
					: type === "reports"
						? "analystReportMetadata"
						: "analystStatementMetadata";

		const fileData = await queryOne<{ path: string; metadata: unknown }>(
			`
			SELECT "${pathColumn}" as path, "${metadataColumn}" as metadata FROM incidents
			WHERE id = $1 AND "organizationId" = $2
		`,
			[id, organizationId],
		);

		if (!fileData?.path) {
			return res.status(404).json({
				success: false,
				error: {
					code: "FILE_NOT_FOUND",
					message: "Plik nie został znaleziony",
				},
			});
		}

		let parsedMetadata: StoredFileMetadataPayload;
		try {
			parsedMetadata = parseStoredFileMetadata(fileData.metadata);
		} catch (e) {
			console.error("[ADMIN] Failed to parse metadata JSON:", e);
			return res.status(500).json({
				success: false,
				error: {
					code: "METADATA_PARSE_ERROR",
					message: "Błąd parsowania metadanych pliku",
				},
			});
		}

		// Sprawdź czy filename się zgadza z originalName lub filename w metadanych
		// Screenshots i attachments używają originalName, reports i statements używają filename
		const fileMetadata = findStoredFileMetadata(parsedMetadata, filename);
		if (!fileMetadata) {
			return res.status(404).json({
				success: false,
				error: {
					code: "FILE_NOT_FOUND",
					message: "Plik nie został znaleziony",
				},
			});
		}

		// Pobierz plik z storage
		const fileBuffer = await getObjectBuffer(fileData.path);

		if (!fileBuffer) {
			return res.status(404).json({
				success: false,
				error: {
					code: "FILE_NOT_FOUND",
					message: "Plik nie jest dostępny w storage",
				},
			});
		}

		// Ustaw odpowiednie nagłówki i zwróć plik
		res.setHeader("Content-Type", fileMetadata.mimeType || "application/octet-stream");

		res.setHeader("Content-Disposition", createContentDispositionHeader(filename));
		res.setHeader("Content-Length", fileBuffer.length);
		res.send(fileBuffer);
	} catch (error) {
		console.error("[ADMIN] Download file error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "DOWNLOAD_ERROR",
				message: "Nie udało się pobrać pliku",
			},
		});
	}
}

// POST /admin/incidents/:id/unassign - Oddanie incydentu do puli (tylko admin)
async function unassignIncident(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;

		// Sprawdź czy incydent istnieje i należy do organizacji
		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET "analystId" = NULL
			WHERE id = $1 AND "organizationId" = $2 AND "analystId" IS NOT NULL
			RETURNING *`,
			[id, organizationId],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message: "Incydent nie został znaleziony lub nie jest przypisany",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	} catch (error) {
		console.error("[ADMIN] Unassign incident error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "UNASSIGN_ERROR",
				message: "Nie udało się oddać incydentu do puli",
			},
		});
	}
}

// GET /admin/incidents/:id/files/:type/:filename - Pobieranie plików z organizacji
router.get("/:id/files/:type/:filename", downloadFile);

// POST /admin/incidents/:id/unassign - Oddanie incydentu do puli
router.post("/:id/unassign", unassignIncident);

export default router;
