import type { Request, Response } from "express";
import { Router } from "express";
import { query, queryOne, sql } from "../../lib/database.js";
import { getObjectBuffer, putObject } from "../../lib/storage.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { requireOrganizationAccess } from "../shared/middleware.js";
import type { Incident } from "../../types/index.js";
import { env } from "../../lib/env.js";

const router = Router();

/**
 * Pobierz incydenty przypisane do aktualnego analityka w jego organizacji
 */
async function getAssignedIncidents(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;
		const {
			page = 1,
			limit = 20,
			status,
			sortBy = "createdAt",
			sortOrder = "desc",
		} = req.query;

		let whereClause = 'WHERE i."analystId" = $1 AND i."organizationId" = $2';
		const params: unknown[] = [userId, organizationId];
		let paramIndex = 3;

		if (status) {
			whereClause += ` AND i.status = $${paramIndex}`;
			params.push(status);
			paramIndex++;
		}

		const offset = (Number(page) - 1) * Number(limit);

		// Pobierz incydenty
		const orderBy = `i."${sortBy}" ${sortOrder}`;
		const incidents = await query<Incident>(
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
				i."updatedAt"
			FROM incidents i
			${whereClause}
			ORDER BY ${orderBy}
			LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
		`,
			[...params, limit, offset],
		);

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
		console.error("[ANALYST] Get assigned incidents error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_ASSIGNED_INCIDENTS_ERROR",
				message: "Nie udało się pobrać przypisanych zgłoszeń",
			},
		});
	}
}

/**
 * Pobierz nieprzypisane incydenty w organizacji analityka
 */
async function getUnassignedIncidents(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = authReq.organizationId!;
		const {
			page = 1,
			limit = 20,
			status,
			sortBy = "createdAt",
			sortOrder = "desc",
		} = req.query;

		let whereClause = 'WHERE i."analystId" IS NULL AND i."organizationId" = $1';
		const params: unknown[] = [organizationId];
		let paramIndex = 2;

		if (status) {
			whereClause += ` AND i.status = $${paramIndex}`;
			params.push(status);
			paramIndex++;
		}

		const offset = (Number(page) - 1) * Number(limit);

		// Pobierz incydenty
		const orderBy = `i."${sortBy}" ${sortOrder}`;
		const incidents = await query<Incident>(
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
				i."updatedAt"
			FROM incidents i
			${whereClause}
			ORDER BY ${orderBy}
			LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
		`,
			[...params, limit, offset],
		);

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
		console.error("[ANALYST] Get unassigned incidents error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_UNASSIGNED_INCIDENTS_ERROR",
				message: "Nie udało się pobrać nieprzypisanych zgłoszeń",
			},
		});
	}
}

// GET /analyst/incidents/assigned - Incydenty przypisane do mnie
router.get("/assigned", getAssignedIncidents);

// GET /analyst/incidents/unassigned - Incydenty nieprzypisane
router.get("/unassigned", getUnassignedIncidents);

// POST /analyst/incidents/:id/assign - Przypisanie incydentu do siebie
router.post('/:id/assign', requireOrganizationAccess, assignIncident);

// POST /analyst/incidents/:id/unassign - Oddanie incydentu do puli
router.post('/:id/unassign', requireOrganizationAccess, unassignIncident);

// PUT /analyst/incidents/:id/status - Zmiana statusu incydentu
// router.put('/:id/status', requireOrganizationAccess, updateIncidentStatus);

// PUT /analyst/incidents/:id/notes - Zapisywanie notatek
// router.put('/:id/notes', requireOrganizationAccess, updateIncidentNotes);

// PUT /analyst/incidents/:id/resolve - Oznaczenie jako rozwiązane
// router.put('/:id/resolve', requireOrganizationAccess, resolveIncident);

// POST /analyst/incidents/:id/reports - Wgrywanie raportu
// router.post('/:id/reports', requireOrganizationAccess, uploadReport);

// GET /analyst/incidents/:id/reports - Pobieranie raportów
// router.get('/:id/reports', requireOrganizationAccess, getIncidentReports);

// POST /analyst/incidents/:id/statements - Wgrywanie sprawozdania
// router.post('/:id/statements', requireOrganizationAccess, uploadStatement);

// GET /analyst/incidents/:id/statements - Pobieranie sprawozdań
// router.get('/:id/statements', requireOrganizationAccess, getIncidentStatements);

// GET /analyst/incidents/:id - Szczegóły dowolnego incydentu
// router.get('/:id', requireOrganizationAccess, getIncidentDetails);

/**
 * Pobierz plik z incydentu przypisanego do analityka
 */
async function downloadFile(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id, type, filename } = req.params;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

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

		// Sprawdź czy analityk ma dostęp do tego incydentu (przypisany lub w tej samej organizacji)
		const incident = await queryOne<{
			organizationId: string;
			analystId: string | null;
		}>(
			`
			SELECT "organizationId", "analystId" FROM incidents
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

		// Admin ma dostęp do wszystkich plików
		// Analityk może pobierać pliki tylko z incydentów które są do niego przypisane
		// lub raporty/sprawozdania z jego organizacji
		// Dla screenshots i attachments - dostęp jeśli w organizacji
		const isAdmin = authReq.memberRole === 'admin';
		console.log('[DOWNLOAD] Access check:', {
			userId,
			memberRole: authReq.memberRole,
			isAdmin,
			analystId: incident.analystId,
			type
		});
		
		const hasAccess =
			isAdmin ||
			incident.analystId === userId ||
			type === "reports" ||
			type === "statements" ||
			type === "screenshots" ||
			type === "attachments";

		if (!hasAccess) {
			console.log('[DOWNLOAD] Access denied');
			return res.status(403).json({
				success: false,
				error: {
					code: "ACCESS_DENIED",
					message: "Brak dostępu do tego pliku",
				},
			});
		}

// Sprawdź metadane pliku i ścieżkę w bazie danych
	const metadataColumn =
		type === "screenshots"
			? "userScreenshotMetadata"
			: type === "attachments"
				? "userAttachmentMetadata"
				: type === "reports"
					? "analystReportMetadata"
					: "analystStatementMetadata";

	const pathColumn =
		type === "screenshots"
			? "userScreenshotPath"
			: type === "attachments"
				? "userAttachmentPath"
				: type === "reports"
					? "analystReportPath"
					: "analystStatementPath";

	const fileData = await queryOne<{ metadata: any; path: string }>(
		`
		SELECT "${metadataColumn}" as metadata, "${pathColumn}" as path FROM incidents
		WHERE id = $1 AND "organizationId" = $2
	`,
		[id, organizationId],
	);

	if (!fileData?.metadata || !fileData?.path) {
		console.log('[DOWNLOAD] No metadata or path found:', { hasMetadata: !!fileData?.metadata, hasPath: !!fileData?.path });
		return res.status(404).json({
			success: false,
			error: {
				code: "FILE_NOT_FOUND",
				message: "Plik nie został znaleziony",
			},
		});
	}

	console.log('[DOWNLOAD] File data:', {
		type,
		filename,
		metadata: fileData.metadata,
		path: fileData.path,
		isArray: Array.isArray(fileData.metadata)
	});

	// Znajdź plik w metadanych
	let fileMetadata = null;
	let filePath = null;
	
	// Parsuj metadata jeśli jest stringiem JSON
	let parsedMetadata = fileData.metadata;
	if (typeof fileData.metadata === 'string') {
		try {
			parsedMetadata = JSON.parse(fileData.metadata);
			console.log('[DOWNLOAD] Parsed metadata:', parsedMetadata);
		} catch (e) {
			console.log('[DOWNLOAD] Failed to parse metadata JSON:', e);
			return res.status(500).json({
				success: false,
				error: {
					code: "METADATA_PARSE_ERROR",
					message: "Błąd parsowania metadanych pliku",
				},
			});
		}
	}
	
	if (Array.isArray(parsedMetadata)) {
		// Dla wielu plików (screenshots/attachments mogą być tablicą)
		fileMetadata = parsedMetadata.find(
			(f: any) => f.filename === filename || f.originalName === filename,
		);
		filePath = fileMetadata?.path; // Ścieżka może być w metadanych dla wielu plików
	} else if (typeof parsedMetadata === "object") {
		// Dla pojedynczych plików - zawsze zwróć jeśli istnieje metadata
		// Nie wymagamy dokładnego filename, bo dla każdego typu jest tylko jeden plik
		const metaFilename = parsedMetadata?.filename || parsedMetadata?.originalName;
		console.log('[DOWNLOAD] Single file mode:', { metaFilename, requestedFilename: filename });
		// Zawsze zwracamy plik jeśli istnieje - frontend może nie mieć aktualnej nazwy
		fileMetadata = parsedMetadata;
		filePath = fileData.path;
	}

	console.log('[DOWNLOAD] Result:', { hasMetadata: !!fileMetadata, filePath });

	if (!fileMetadata || !filePath) {
		console.log('[DOWNLOAD] File not found in metadata');
		return res.status(404).json({
			success: false,
			error: {
				code: "FILE_NOT_FOUND",
				message: "Plik nie został znaleziony w metadanych",
			},
		});
	}

	// Pobierz plik z storage
	const fileBuffer = await getObjectBuffer(filePath);

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
		
		// Użyj prawdziwej nazwy pliku z metadanych (nie z URL)
		const realFilename = fileMetadata.filename || fileMetadata.originalName || filename;
		// RFC 5987 encoding dla nazw plików z polskimi znakami
		const encodedFilename = encodeURIComponent(realFilename);
		res.setHeader(
			"Content-Disposition", 
			`attachment; filename="${realFilename.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFilename}`
		);
		
		res.setHeader("Content-Length", fileBuffer.length);
		res.send(fileBuffer);
	} catch (error) {
		console.error("[ANALYST] Download file error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "DOWNLOAD_ERROR",
				message: "Nie udało się pobrać pliku",
			},
		});
	}
}

// GET /analyst/incidents/:id/files/:type/:filename - Pobieranie plików z przypisanych incydentów
router.get(
	"/:id/files/:type/:filename",
	requireOrganizationAccess,
	downloadFile,
);

/**
 * Przypisanie incydentu do siebie
 */
async function assignIncident(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		// Sprawdź czy incydent istnieje i nie jest już przypisany
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			status: string;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", status, "organizationId"
			FROM incidents
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

		// Sprawdź czy incydent nie jest już przypisany
		if (incident.analystId) {
			return res.status(409).json({
				success: false,
				error: {
					code: "INCIDENT_ALREADY_ASSIGNED",
					message: "Zgłoszenie jest już przypisane do innego analityka",
				},
			});
		}

		// Sprawdź czy incydent ma odpowiedni status do przypisania
		const assignableStatuses = ["Zgłoszony", "Raport w trakcie"];
		if (!assignableStatuses.includes(incident.status)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_INCIDENT_STATUS",
					message: "Zgłoszenie ma nieodpowiedni status do przypisania",
				},
			});
		}

		// Przypisz incydent do analityka i zmień status
		await query(
			`
			UPDATE incidents
			SET "analystId" = $1, status = 'Raport w trakcie', "updatedAt" = now()
			WHERE id = $2 AND "organizationId" = $3
		`,
			[userId, id, organizationId],
		);

		res.json({
			success: true,
			message: "Zgłoszenie zostało przypisane do Ciebie",
			data: {
				id,
				analystId: userId,
				status: "Raport w trakcie",
			},
		});
	} catch (error) {
		console.error("[ANALYST] Assign incident error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "ASSIGN_INCIDENT_ERROR",
				message: "Nie udało się przypisać zgłoszenia",
			},
		});
	}
}

/**
 * Oddanie incydentu do puli
 */
async function unassignIncident(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		// Sprawdź czy incydent istnieje i jest przypisany do bieżącego analityka
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			status: string;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", status, "organizationId"
			FROM incidents
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

		// Sprawdź czy użytkownik ma prawo oddać incydent do puli
		// Admin może oddawać wszystkie incydenty, analityk tylko przypisane do niego
		const canUnassign =
			incident.analystId === userId || authReq.memberRole === "admin";

		if (!canUnassign) {
			return res.status(403).json({
				success: false,
				error: {
					code: "CANNOT_UNASSIGN_INCIDENT",
					message: "Brak uprawnień do oddania tego zgłoszenia do puli",
				},
			});
		}

		// Sprawdź czy incydent można oddać do puli (nie w końcowych statusach)
		const finalStatuses = ["Odrzucone", "Sprawozdanie złożone"];
		if (finalStatuses.includes(incident.status)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "CANNOT_UNASSIGN_FINAL_STATUS",
					message: "Nie można oddać zgłoszenia w końcowym statusie",
				},
			});
		}

		// Oddaj incydent do puli
		await query(
			`
			UPDATE incidents
			SET "analystId" = NULL, status = 'Zgłoszony', "updatedAt" = now()
			WHERE id = $1 AND "organizationId" = $2
		`,
			[id, organizationId],
		);

		res.json({
			success: true,
			message: "Zgłoszenie zostało oddane do puli",
			data: {
				id,
				analystId: null,
				status: "Zgłoszony",
			},
		});
	} catch (error) {
		console.error("[ANALYST] Unassign incident error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "UNASSIGN_INCIDENT_ERROR",
				message: "Nie udało się oddać zgłoszenia do puli",
			},
		});
	}
}

// POST /analyst/incidents/:id/assign - Przypisanie incydentu do siebie
router.post("/:id/assign", requireOrganizationAccess, assignIncident);

// POST /analyst/incidents/:id/unassign - Oddanie incydentu do puli
router.post("/:id/unassign", requireOrganizationAccess, unassignIncident);

/**
 * Zmiana statusu zgłoszenia
 */
async function updateIncidentStatus(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const { status, reason } = req.body;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		if (!status) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_STATUS",
					message: "Brak nowego statusu",
				},
			});
		}

		// Walidacja statusu
		const validStatuses = [
			"Zgłoszony",
			"Raport w trakcie",
			"Raport złożony",
			"Sprawozdanie w trakcie",
			"Sprawozdanie złożone",
			"Odrzucone",
		];

		if (!validStatuses.includes(status)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_STATUS",
					message: "Nieprawidłowy status",
				},
			});
		}

		// Sprawdź czy incydent istnieje i jest przypisany do bieżącego analityka
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			status: string;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", status, "organizationId"
			FROM incidents
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

		// Sprawdź czy analityk ma prawo zmienić status
		// Admin może zmieniać wszystko, analityk tylko przypisane do niego incydenty
		const canModify =
			incident.analystId === userId || authReq.memberRole === "admin";

		if (!canModify) {
			return res.status(403).json({
				success: false,
				error: {
					code: "CANNOT_MODIFY_STATUS",
					message: "Brak uprawnień do zmiany statusu tego zgłoszenia",
				},
			});
		}

		// Sprawdź czy przejście statusu jest prawidłowe
		const validTransitions: Record<string, string[]> = {
			Zgłoszony: ["Raport w trakcie", "Odrzucone"],
			"Raport w trakcie": ["Raport złożony"],
			"Raport złożony": ["Sprawozdanie w trakcie"],
			"Sprawozdanie w trakcie": ["Sprawozdanie złożone"],
			"Sprawozdanie złożone": [],
			Odrzucone: [],
		};

		if (!validTransitions[incident.status]?.includes(status)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_STATUS_TRANSITION",
					message: `Nieprawidłowe przejście statusu z '${incident.status}' na '${status}'`,
				},
			});
		}

		// Zaktualizuj status
		await query(
			`
			UPDATE incidents
			SET status = $1, "updatedAt" = now()
			WHERE id = $2 AND "organizationId" = $3
		`,
			[status, id, organizationId],
		);

		// Jeśli status to "Odrzucone" lub "Sprawozdanie złożone", ustaw datę rozwiązania
		if (status === "Odrzucone" || status === "Sprawozdanie złożone") {
			await query(
				`
				UPDATE incidents
				SET "czyRozwiazany" = true, "dataRozwiazania" = now()
				WHERE id = $1 AND "organizationId" = $2
			`,
				[id, organizationId],
			);
		}

		res.json({
			success: true,
			message: "Status zgłoszenia został zaktualizowany",
			data: {
				id,
				oldStatus: incident.status,
				newStatus: status,
			},
		});
	} catch (error) {
		console.error("[ANALYST] Update incident status error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "UPDATE_STATUS_ERROR",
				message: "Nie udało się zaktualizować statusu zgłoszenia",
			},
		});
	}
}

/**
 * Zapisywanie notatek dotyczących incydentu
 */
async function updateIncidentNotes(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const { notes } = req.body;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		if (notes !== undefined && typeof notes !== "string") {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_NOTES",
					message: "Notatki muszą być tekstem",
				},
			});
		}

		if (notes && notes.length > 10000) {
			return res.status(400).json({
				success: false,
				error: {
					code: "NOTES_TOO_LONG",
					message: "Notatki mogą mieć maksymalnie 10000 znaków",
				},
			});
		}

		// Sprawdź czy incydent istnieje i jest dostępny dla analityka
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", "organizationId"
			FROM incidents
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

		// Sprawdź czy analityk ma prawo edytować notatki
		const canModify =
			incident.analystId === userId || authReq.memberRole === "admin";

		if (!canModify) {
			return res.status(403).json({
				success: false,
				error: {
					code: "CANNOT_MODIFY_NOTES",
					message: "Brak uprawnień do edycji notatek tego zgłoszenia",
				},
			});
		}

		// Zaktualizuj notatki
		await query(
			`
			UPDATE incidents
			SET "analystNote" = $1, "updatedAt" = now()
			WHERE id = $2 AND "organizationId" = $3
		`,
			[notes, id, organizationId],
		);

		res.json({
			success: true,
			message: "Notatki zostały zaktualizowane",
			data: {
				id,
				analystNote: notes,
			},
		});
	} catch (error) {
		console.error("[ANALYST] Update incident notes error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "UPDATE_NOTES_ERROR",
				message: "Nie udało się zaktualizować notatek",
			},
		});
	}
}

// PUT /analyst/incidents/:id/status - Zmiana statusu zgłoszenia
router.put("/:id/status", requireOrganizationAccess, updateIncidentStatus);

// PUT /analyst/incidents/:id/notes - Zapisywanie notatek
router.put("/:id/notes", requireOrganizationAccess, updateIncidentNotes);

/**
 * Oznaczenie incydentu jako rozwiązanego
 */
async function resolveIncident(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		// Sprawdź czy incydent istnieje i jest dostępny dla analityka
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			status: string;
			czyRozwiazany: boolean;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", status, "czyRozwiazany", "organizationId"
			FROM incidents
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

		// Sprawdź czy analityk ma prawo oznaczyć jako rozwiązane
		const canResolve =
			incident.analystId === userId || authReq.memberRole === "admin";

		if (!canResolve) {
			return res.status(403).json({
				success: false,
				error: {
					code: "CANNOT_RESOLVE_INCIDENT",
					message: "Brak uprawnień do oznaczenia zgłoszenia jako rozwiązanego",
				},
			});
		}

		// Sprawdź czy incydent nie jest już rozwiązany
		if (incident.czyRozwiazany) {
			return res.status(400).json({
				success: false,
				error: {
					code: "ALREADY_RESOLVED",
					message: "Zgłoszenie jest już oznaczone jako rozwiązane",
				},
			});
		}

		// Rozwiązanie incydentu jest niezależne od statusu - można oznaczyć jako rozwiązane w dowolnym momencie

		// Oznacz jako rozwiązane
		await query(
			`
			UPDATE incidents
			SET "czyRozwiazany" = true, "dataRozwiazania" = now(), "updatedAt" = now()
			WHERE id = $1 AND "organizationId" = $2
		`,
			[id, organizationId],
		);

		res.json({
			success: true,
			message: "Zgłoszenie zostało oznaczone jako rozwiązane",
			data: {
				id,
				czyRozwiazany: true,
				dataRozwiazania: new Date().toISOString(),
			},
		});
	} catch (error) {
		console.error("[ANALYST] Resolve incident error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "RESOLVE_INCIDENT_ERROR",
				message: "Nie udało się oznaczyć zgłoszenia jako rozwiązanego",
			},
		});
	}
}

/**
 * Szczegóły dowolnego incydentu w organizacji analityka
 */
async function getIncidentDetails(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
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
					message: "Zgłoszenie nie zostało znalezione",
				},
			});
		}

		// Parsuj metadata JSON strings do obiektów
		if (incident.userScreenshotMetadata && typeof incident.userScreenshotMetadata === 'string') {
			try {
				incident.userScreenshotMetadata = JSON.parse(incident.userScreenshotMetadata);
			} catch (e) {
				console.error('[ANALYST] Failed to parse userScreenshotMetadata:', e);
			}
		}
		
		if (incident.userAttachmentMetadata && typeof incident.userAttachmentMetadata === 'string') {
			try {
				incident.userAttachmentMetadata = JSON.parse(incident.userAttachmentMetadata);
			} catch (e) {
				console.error('[ANALYST] Failed to parse userAttachmentMetadata:', e);
			}
		}
		
		if (incident.analystReportMetadata && typeof incident.analystReportMetadata === 'string') {
			try {
				incident.analystReportMetadata = JSON.parse(incident.analystReportMetadata);
			} catch (e) {
				console.error('[ANALYST] Failed to parse analystReportMetadata:', e);
			}
		}
		
		if (incident.analystStatementMetadata && typeof incident.analystStatementMetadata === 'string') {
			try {
				incident.analystStatementMetadata = JSON.parse(incident.analystStatementMetadata);
			} catch (e) {
				console.error('[ANALYST] Failed to parse analystStatementMetadata:', e);
			}
		}

		console.log('[ANALYST] Sending incident metadata:', {
			userScreenshotMetadata: incident.userScreenshotMetadata,
			userAttachmentMetadata: incident.userAttachmentMetadata,
			analystReportMetadata: incident.analystReportMetadata,
			analystStatementMetadata: incident.analystStatementMetadata,
		});

		res.json({
			success: true,
			data: incident,
		});
	} catch (error) {
		console.error("[ANALYST] Get incident details error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "GET_INCIDENT_ERROR",
				message: "Nie udało się pobrać szczegółów zgłoszenia",
			},
		});
	}
}

// PUT /analyst/incidents/:id/resolve - Oznaczenie jako rozwiązane
router.put("/:id/resolve", requireOrganizationAccess, resolveIncident);

// GET /analyst/incidents/:id - Szczegóły dowolnego incydentu
router.get("/:id", requireOrganizationAccess, getIncidentDetails);

/**
 * Upload pojedynczego pliku (raport lub sprawozdanie)
 */
async function uploadSingleFile(
	file: { filename: string; data: string; mimeType: string },
	incidentId: string,
	type: "reports" | "statements",
): Promise<{
	path: string;
	metadata: {
		bucket: string;
		filename: string;
		mimeType: string;
		size: number;
	};
}> {
	try {
		// Dekoduj base64 na Buffer
		const buffer = Buffer.from(file.data, "base64");

		// Buduj ścieżkę w storage
		const storagePath = `incidents/${incidentId}/${type}/${file.filename}`;

		// Upload do storage
		await putObject(storagePath, buffer, {
			contentType: file.mimeType,
			acl: "private",
		});

		return {
			path: storagePath,
			metadata: {
				bucket: env.S3_BUCKET,
				filename: file.filename,
				mimeType: file.mimeType,
				size: buffer.length,
			},
		};
	} catch (error) {
		console.error(
			`[UPLOAD] Failed to upload ${type} file ${file.filename}:`,
			error,
		);
		throw new Error(`Nie udało się przesłać pliku ${file.filename}`);
	}
}

/**
 * Wgrywanie raportu dotyczącego incydentu
 */
async function uploadReport(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const { reportData } = req.body;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		if (!reportData || typeof reportData !== "object") {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_REPORT_DATA",
					message: "Brak danych raportu",
				},
			});
		}

		// Sprawdź czy incydent istnieje i jest dostępny dla analityka
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			status: string;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", status, "organizationId"
			FROM incidents
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

		// Sprawdź czy analityk ma prawo uploadować raport
		const canUpload =
			incident.analystId === userId || authReq.memberRole === "admin";

		if (!canUpload) {
			return res.status(403).json({
				success: false,
				error: {
					code: "CANNOT_UPLOAD_REPORT",
					message: "Brak uprawnień do uploadu raportu dla tego zgłoszenia",
				},
			});
		}

		// Upload raportu do storage
		let uploadedReport;
		try {
			uploadedReport = await uploadSingleFile(reportData, id, "reports");
		} catch (error) {
			return res.status(500).json({
				success: false,
				error: {
					code: "REPORT_UPLOAD_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Nie udało się przesłać raportu",
				},
			});
		}

		// Zaktualizuj bazę danych
		await query(
			`
			UPDATE incidents
			SET "analystReportPath" = $1, "analystReportMetadata" = $2, "analystReportData" = now(), status = 'Raport złożony', "updatedAt" = now()
			WHERE id = $3 AND "organizationId" = $4
		`,
			[
				uploadedReport.path,
				JSON.stringify(uploadedReport.metadata),
				id,
				organizationId,
			],
		);

		res.json({
			success: true,
			message: "Raport został przesłany",
			data: {
				id,
				analystReportPath: uploadedReport.path,
				analystReportMetadata: uploadedReport.metadata,
				analystReportData: new Date().toISOString(),
				status: "Raport złożony",
			},
		});
	} catch (error) {
		console.error("[ANALYST] Upload report error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "UPLOAD_REPORT_ERROR",
				message: "Nie udało się przesłać raportu",
			},
		});
	}
}

/**
 * Wgrywanie sprawozdania dotyczącego incydentu
 */
async function uploadStatement(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id } = req.params;
		const { statementData } = req.body;
		const userId = authReq.user.id;
		const organizationId = authReq.organizationId!;

		// Sprawdź wymagane parametry
		if (!id) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_INCIDENT_ID",
					message: "Brak ID incydentu",
				},
			});
		}

		if (!statementData || typeof statementData !== "object") {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_STATEMENT_DATA",
					message: "Brak danych sprawozdania",
				},
			});
		}

		// Sprawdź czy incydent istnieje i jest dostępny dla analityka
		const incident = await queryOne<{
			id: string;
			analystId: string | null;
			status: string;
			organizationId: string;
		}>(
			`
			SELECT id, "analystId", status, "organizationId"
			FROM incidents
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

		// Sprawdź czy analityk ma prawo uploadować sprawozdanie
		const canUpload =
			incident.analystId === userId || authReq.memberRole === "admin";

		if (!canUpload) {
			return res.status(403).json({
				success: false,
				error: {
					code: "CANNOT_UPLOAD_STATEMENT",
					message: "Brak uprawnień do uploadu sprawozdania dla tego zgłoszenia",
				},
			});
		}

		// Sprawdź czy można uploadować sprawozdanie (raport musi być już złożony)
		const allowedStatuses = ["Raport złożony", "Sprawozdanie w trakcie"];
		if (!allowedStatuses.includes(incident.status)) {
			return res.status(400).json({
				success: false,
				error: {
					code: "CANNOT_UPLOAD_STATEMENT_WITH_STATUS",
					message:
						"Sprawozdanie można uploadować tylko gdy raport jest już złożony",
				},
			});
		}

		// Upload sprawozdania do storage
		let uploadedStatement;
		try {
			uploadedStatement = await uploadSingleFile(
				statementData,
				id,
				"statements",
			);
		} catch (error) {
			return res.status(500).json({
				success: false,
				error: {
					code: "STATEMENT_UPLOAD_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Nie udało się przesłać sprawozdania",
				},
			});
		}

		// Zaktualizuj bazę danych
		await query(
			`
			UPDATE incidents
			SET "analystStatementPath" = $1, "analystStatementMetadata" = $2, "analystStatementData" = now(), status = 'Sprawozdanie złożone', "updatedAt" = now()
			WHERE id = $3 AND "organizationId" = $4
		`,
			[
				uploadedStatement.path,
				JSON.stringify(uploadedStatement.metadata),
				id,
				organizationId,
			],
		);

		res.json({
			success: true,
			message: "Sprawozdanie zostało przesłane",
			data: {
				id,
				analystStatementPath: uploadedStatement.path,
				analystStatementMetadata: uploadedStatement.metadata,
				analystStatementData: new Date().toISOString(),
				status: "Sprawozdanie złożone",
			},
		});
	} catch (error) {
		console.error("[ANALYST] Upload statement error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "UPLOAD_STATEMENT_ERROR",
				message: "Nie udało się przesłać sprawozdania",
			},
		});
	}
}

// POST /analyst/incidents/:id/reports - Wgrywanie raportu
router.post("/:id/reports", requireOrganizationAccess, uploadReport);

// POST /analyst/incidents/:id/statements - Wgrywanie sprawozdania
router.post("/:id/statements", requireOrganizationAccess, uploadStatement);

export default router;
