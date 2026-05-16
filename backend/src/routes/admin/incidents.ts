import type { Request, Response } from "express";
import { Router } from "express";
import { query, queryOne } from "../../lib/database.js";
import { getObjectBuffer } from "../../lib/storage.js";
import {
	type AuthenticatedRequest,
	getRequiredOrganizationId,
} from "../../middleware/auth.middleware.js";
import type { Incident } from "../../types/index.js";
import {
	createContentDispositionHeader,
	findStoredFileMetadata,
	parseStoredFileMetadata,
	type StoredFileMetadataPayload,
} from "../shared/file-metadata.js";

const router = Router();

/**
 * Pobierz wszystkie incydenty w organizacji administratora
 */
async function getAllIncidents(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = getRequiredOrganizationId(authReq, res);
		if (!organizationId) return;
		const page = Number(req.query.page) || 1;
		const limit = Number(req.query.limit) || 20;
		const status = req.query.status as string | undefined;
		const userId = req.query.userId as string | undefined;
		const analystId = req.query.analystId as string | undefined;
		const sortBy = (req.query.sortBy as string) || "createdAt";
		const sortOrder = (req.query.sortOrder as string) || "desc";

		// Walidacja sortBy
		const allowedSortFields = [
			"createdAt",
			"updatedAt",
			"status",
			"dataZgloszenia",
			"userId",
			"analystId",
		];
		if (!allowedSortFields.includes(sortBy)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_SORT_FIELD",
					message: "Nieprawidłowe pole sortowania",
				},
			});
		}

		// Walidacja sortOrder
		if (!["asc", "desc"].includes(sortOrder)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_SORT_ORDER",
					message: "Nieprawidłowy kierunek sortowania",
				},
			});
		}

		let whereClause = 'WHERE i."organizationId" = $1';
		const params: unknown[] = [organizationId];
		let paramIndex = 2;

		if (status) {
			whereClause += ` AND i.status = $${paramIndex}`;
			params.push(status);
			paramIndex++;
		}

		if (userId) {
			whereClause += ` AND i."userId" = $${paramIndex}`;
			params.push(userId);
			paramIndex++;
		}

		if (analystId) {
			if (analystId === "null") {
				whereClause += ` AND i."analystId" IS NULL`;
			} else {
				whereClause += ` AND i."analystId" = $${paramIndex}`;
				params.push(analystId);
				paramIndex++;
			}
		}

		const offset = (page - 1) * limit;

		// Pobierz incydenty
		const orderBy = `i."${sortBy}" ${sortOrder}`;
		const incidents = await query<
			Incident & { userName?: string; analystName?: string }
		>(
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

		// Parsuj metadata z JSON stringów do obiektów
		incidents.forEach((incident) => {
			if (typeof incident.userScreenshotMetadata === "string") {
				try {
					incident.userScreenshotMetadata = JSON.parse(
						incident.userScreenshotMetadata,
					);
				} catch (e) {
					console.error("[ADMIN] Failed to parse userScreenshotMetadata:", e);
				}
			}
			if (typeof incident.userAttachmentMetadata === "string") {
				try {
					incident.userAttachmentMetadata = JSON.parse(
						incident.userAttachmentMetadata,
					);
				} catch (e) {
					console.error("[ADMIN] Failed to parse userAttachmentMetadata:", e);
				}
			}
			if (typeof incident.analystReportMetadata === "string") {
				try {
					incident.analystReportMetadata = JSON.parse(
						incident.analystReportMetadata,
					);
				} catch (e) {
					console.error("[ADMIN] Failed to parse analystReportMetadata:", e);
				}
			}
			if (typeof incident.analystStatementMetadata === "string") {
				try {
					incident.analystStatementMetadata = JSON.parse(
						incident.analystStatementMetadata,
					);
				} catch (e) {
					console.error("[ADMIN] Failed to parse analystStatementMetadata:", e);
				}
			}
		});

		// Pobierz całkowitą liczbę
		const countResult = await queryOne<{ count: number }>(
			`
			SELECT COUNT(*) as count FROM incidents i ${whereClause}
		`,
			params,
		);

		const total = countResult?.count || 0;
		const totalPages = Math.ceil(total / Number(limit));

		res.json({
			success: true,
			data: incidents,
			pagination: {
				page: Number(page),
				limit: Number(limit),
				total,
				totalPages,
			},
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
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				id,
			)
		) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_ID",
					message: "Nieprawidłowy format ID",
				},
			});
		}

		const incident = await queryOne<
			Incident & { userName?: string; analystName?: string }
		>(
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
					message:
						"Zgłoszenie nie zostało znalezione lub nie masz do niego dostępu",
				},
			});
		}

		// Parsuj metadata z JSON stringów do obiektów
		if (typeof incident.userScreenshotMetadata === "string") {
			try {
				incident.userScreenshotMetadata = JSON.parse(
					incident.userScreenshotMetadata,
				);
			} catch (e) {
				console.error("[ADMIN] Failed to parse userScreenshotMetadata:", e);
			}
		}
		if (typeof incident.userAttachmentMetadata === "string") {
			try {
				incident.userAttachmentMetadata = JSON.parse(
					incident.userAttachmentMetadata,
				);
			} catch (e) {
				console.error("[ADMIN] Failed to parse userAttachmentMetadata:", e);
			}
		}
		if (typeof incident.analystReportMetadata === "string") {
			try {
				incident.analystReportMetadata = JSON.parse(
					incident.analystReportMetadata,
				);
			} catch (e) {
				console.error("[ADMIN] Failed to parse analystReportMetadata:", e);
			}
		}
		if (typeof incident.analystStatementMetadata === "string") {
			try {
				incident.analystStatementMetadata = JSON.parse(
					incident.analystStatementMetadata,
				);
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
router.get("/", getAllIncidents);
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
		if (
			!["screenshots", "attachments", "reports", "statements"].includes(type)
		) {
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
		res.setHeader(
			"Content-Type",
			fileMetadata.mimeType || "application/octet-stream",
		);

		res.setHeader(
			"Content-Disposition",
			createContentDispositionHeader(filename),
		);
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
