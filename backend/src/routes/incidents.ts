/**
 * Incidents Router - Endpointy dla zarządzania incydentami
 *
 * Implementuje wszystkie endpointy dla:
 * - Pracownik: zgłaszanie, przeglądanie własnych incydentów
 * - Analityk: przypisywanie, notatki, statusy, uploady raportów/sprawozdań
 * - Admin: przeglądanie wszystkich, statystyki
 */

import type { Request, Response } from "express";
import { Router } from "express";
import { getDb, query, queryOne } from "../lib/database";
import { classifyIncident } from "../lib/llm-client";
import { getObjectBuffer, presignObject, storageClient } from "../lib/storage";
import {
	type AuthenticatedRequest,
	getRequiredOrganizationId,
	requireAuth,
	requireRole,
} from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import type { FileMetadata, Incident, IncidentCategory } from "../types";
import {
	generateStorageKey,
	parseMultipartFormData,
	validateFile,
} from "../utils/file.helper";
import {
	createIncidentSchema,
	paginationSchema,
	resolveIncidentSchema,
	updateIncidentNoteSchema,
	updateIncidentStatusSchema,
	uuidSchema,
	validate,
} from "../utils/validation";
import {
	createContentDispositionHeader,
	findStoredFileMetadata,
	parseStoredFileMetadata,
	type StoredFileMetadata,
	type StoredFileMetadataPayload,
} from "./shared/file-metadata";

/**
 * Asynchroniczna analiza kategorii incydentu za pomocą LLM_SERVICE
 */
async function analyzeIncidentCategory(
	incidentId: string,
	description: string,
) {
	try {
		const category = (await classifyIncident(
			incidentId,
			description,
		)) as IncidentCategory;

		// Aktualizuj kategorię w bazie danych
		await query('UPDATE incidents SET "llmCategory" = $1 WHERE id = $2', [
			category,
			incidentId,
		]);

		console.log(`[LLM] Incident ${incidentId} categorized as ${category}`);
	} catch (error) {
		console.error("[LLM] Error analyzing incident:", error);
		// W przypadku błędu, kategoria pozostaje null
	}
}

const router = Router();

/**
 * POST /api/incidents
 * Zgłoszenie nowego incydentu przez pracownika
 *
 * Body (multipart/form-data):
 * - userDescription: string (wymagane)
 * - screenshot: File (opcjonalny)
 * - attachment: File (opcjonalny)
 */
router.post(
	"/",
	requireAuth,
	requireRole(["pracownik", "analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		// Parsuj multipart/form-data
		const { fields, files } = await parseMultipartFormData(req);

		// Walidacja pola userDescription
		const validatedFields = createIncidentSchema.parse({
			userDescription: fields.userDescription,
		});

		const _db = getDb();
		const incidentId = crypto.randomUUID();

		// Przygotuj dane dla plików
		let screenshotPath: string | null = null;
		let screenshotMetadata: FileMetadata | null = null;
		let attachmentPath: string | null = null;
		let attachmentMetadata: FileMetadata | null = null;

		// Obsługa screenshot (opcjonalny)
		if (files.screenshot) {
			validateFile(files.screenshot, "screenshot");
			screenshotPath = generateStorageKey(
				incidentId,
				"screenshot",
				files.screenshot.metadata.originalName,
			);

			// Upload do MinIO
			await storageClient.putObject(
				screenshotPath,
				Buffer.from(files.screenshot.buffer),
				{ contentType: files.screenshot.metadata.mimeType },
			);

			screenshotMetadata = files.screenshot.metadata;
		}

		// Obsługa attachment (opcjonalny)
		if (files.attachment) {
			validateFile(files.attachment, "attachment");
			attachmentPath = generateStorageKey(
				incidentId,
				"attachment",
				files.attachment.metadata.originalName,
			);

			// Upload do MinIO
			await storageClient.putObject(
				attachmentPath,
				Buffer.from(files.attachment.buffer),
				{ contentType: files.attachment.metadata.mimeType },
			);

			attachmentMetadata = files.attachment.metadata;
		}

		// Zapisz incydent do bazy danych
		const incident = await queryOne<Incident>(
			`INSERT INTO incidents (
				id,
				"userId",
				"organizationId",
				"userDescription",
				"userScreenshotPath",
				"userScreenshotMetadata",
				"userAttachmentPath",
				"userAttachmentMetadata"
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING *`,
			[
				incidentId,
				req.user.id,
				req.organizationId,
				validatedFields.userDescription,
				screenshotPath,
				screenshotMetadata ? JSON.stringify(screenshotMetadata) : "{}",
				attachmentPath,
				attachmentMetadata ? JSON.stringify(attachmentMetadata) : "{}",
			],
		);

		if (!incident) {
			throw new Error("Nie udało się utworzyć incydentu");
		}

		res.status(201).json({
			success: true,
			data: incident,
		});

		// Asynchroniczna analiza kategorii przez LLM_SERVICE
		analyzeIncidentCategory(incident.id, validatedFields.userDescription).catch(
			console.error,
		);
	}),
);

/**
 * GET /api/incidents/my
 * Pobieranie listy własnych incydentów
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - status: IncidentStatus (opcjonalny)
 */
router.get(
	"/my",
	requireAuth,
	requireRole(["pracownik", "analityk", "admin"]),
	validate(paginationSchema, "query"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { page, limit } = req.query as unknown as {
			page: number;
			limit: number;
		};
		const offset = (page - 1) * limit;

		// Pobierz incydenty
		const incidents = await query<Incident>(
			`SELECT * FROM incidents
			WHERE "userId" = $1 AND "organizationId" = $2
			ORDER BY "createdAt" DESC
			LIMIT $3 OFFSET $4`,
			[req.user.id, req.organizationId, limit, offset],
		);

		// Parsuj metadata z JSON strings do obiektów
		incidents.forEach((incident) => {
			if (
				incident.userScreenshotMetadata &&
				typeof incident.userScreenshotMetadata === "string"
			) {
				try {
					incident.userScreenshotMetadata = JSON.parse(
						incident.userScreenshotMetadata,
					);
				} catch (e) {
					console.error(
						"[INCIDENTS] Failed to parse userScreenshotMetadata:",
						e,
					);
				}
			}
			if (
				incident.userAttachmentMetadata &&
				typeof incident.userAttachmentMetadata === "string"
			) {
				try {
					incident.userAttachmentMetadata = JSON.parse(
						incident.userAttachmentMetadata,
					);
				} catch (e) {
					console.error(
						"[INCIDENTS] Failed to parse userAttachmentMetadata:",
						e,
					);
				}
			}
			if (
				incident.analystReportMetadata &&
				typeof incident.analystReportMetadata === "string"
			) {
				try {
					incident.analystReportMetadata = JSON.parse(
						incident.analystReportMetadata,
					);
				} catch (e) {
					console.error(
						"[INCIDENTS] Failed to parse analystReportMetadata:",
						e,
					);
				}
			}
			if (
				incident.analystStatementMetadata &&
				typeof incident.analystStatementMetadata === "string"
			) {
				try {
					incident.analystStatementMetadata = JSON.parse(
						incident.analystStatementMetadata,
					);
				} catch (e) {
					console.error(
						"[INCIDENTS] Failed to parse analystStatementMetadata:",
						e,
					);
				}
			}
		});

		// Policz wszystkie incydenty użytkownika
		const totalResult = await queryOne<{ count: string }>(
			`SELECT COUNT(*)::text as count FROM incidents
			WHERE "userId" = $1 AND "organizationId" = $2`,
			[req.user.id, req.organizationId],
		);

		const total = Number.parseInt(totalResult?.count || "0", 10);

		res.json({
			success: true,
			data: incidents,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		});
	}),
);

/**
 * GET /api/incidents/:id
 * Pobieranie szczegółów incydentu
 *
 * Pracownik: tylko własne incydenty
 * Analityk/Admin: dowolny incydent w organizacji
 */
router.get(
	"/:id",
	requireAuth,
	requireRole(["pracownik", "analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { id } = req.params;
		uuidSchema.parse(id);

		let incident: Incident | null = null;

		// Pracownik może widzieć tylko swoje
		if (req.memberRole === "pracownik") {
			incident = await queryOne<Incident>(
				`SELECT * FROM incidents
				WHERE id = $1 AND "userId" = $2 AND "organizationId" = $3`,
				[id, req.user.id, req.organizationId],
			);
		} else {
			// Analityk i Admin widzą wszystko w organizacji
			incident = await queryOne<Incident>(
				`SELECT * FROM incidents
				WHERE id = $1 AND "organizationId" = $2`,
				[id, req.organizationId],
			);
		}

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message: "Incydent nie został znaleziony",
				},
			});
		}

		// Parsuj metadata z JSON strings do obiektów
		if (
			incident.userScreenshotMetadata &&
			typeof incident.userScreenshotMetadata === "string"
		) {
			try {
				incident.userScreenshotMetadata = JSON.parse(
					incident.userScreenshotMetadata,
				);
			} catch (e) {
				console.error("[INCIDENTS] Failed to parse userScreenshotMetadata:", e);
			}
		}
		if (
			incident.userAttachmentMetadata &&
			typeof incident.userAttachmentMetadata === "string"
		) {
			try {
				incident.userAttachmentMetadata = JSON.parse(
					incident.userAttachmentMetadata,
				);
			} catch (e) {
				console.error("[INCIDENTS] Failed to parse userAttachmentMetadata:", e);
			}
		}
		if (
			incident.analystReportMetadata &&
			typeof incident.analystReportMetadata === "string"
		) {
			try {
				incident.analystReportMetadata = JSON.parse(
					incident.analystReportMetadata,
				);
			} catch (e) {
				console.error("[INCIDENTS] Failed to parse analystReportMetadata:", e);
			}
		}
		if (
			incident.analystStatementMetadata &&
			typeof incident.analystStatementMetadata === "string"
		) {
			try {
				incident.analystStatementMetadata = JSON.parse(
					incident.analystStatementMetadata,
				);
			} catch (e) {
				console.error(
					"[INCIDENTS] Failed to parse analystStatementMetadata:",
					e,
				);
			}
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * GET /api/incidents/analyst/assigned
 * Pobieranie incydentów przypisanych do zalogowanego analityka
 */
router.get(
	"/analyst/assigned",
	requireAuth,
	requireRole(["analityk", "admin"]),
	validate(paginationSchema, "query"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { page, limit } = req.query as unknown as {
			page: number;
			limit: number;
		};
		const offset = (page - 1) * limit;

		const incidents = await query<Incident>(
			`SELECT * FROM incidents
			WHERE "analystId" = $1 AND "organizationId" = $2
			ORDER BY "createdAt" DESC
			LIMIT $3 OFFSET $4`,
			[req.user.id, req.organizationId, limit, offset],
		);

		const totalResult = await queryOne<{ count: string }>(
			`SELECT COUNT(*)::text as count FROM incidents
			WHERE "analystId" = $1 AND "organizationId" = $2`,
			[req.user.id, req.organizationId],
		);

		const total = Number.parseInt(totalResult?.count || "0", 10);

		res.json({
			success: true,
			data: incidents,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		});
	}),
);

/**
 * GET /api/incidents/analyst/unassigned
 * Pobieranie incydentów nieprzypisanych do żadnego analityka
 */
router.get(
	"/analyst/unassigned",
	requireAuth,
	requireRole(["analityk", "admin"]),
	validate(paginationSchema, "query"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { page, limit } = req.query as unknown as {
			page: number;
			limit: number;
		};
		const offset = (page - 1) * limit;

		const incidents = await query<Incident>(
			`SELECT * FROM incidents
			WHERE "analystId" IS NULL AND "organizationId" = $1
			ORDER BY "createdAt" DESC
			LIMIT $2 OFFSET $3`,
			[req.organizationId, limit, offset],
		);

		const totalResult = await queryOne<{ count: string }>(
			`SELECT COUNT(*)::text as count FROM incidents
			WHERE "analystId" IS NULL AND "organizationId" = $1`,
			[req.organizationId],
		);

		const total = Number.parseInt(totalResult?.count || "0", 10);

		res.json({
			success: true,
			data: incidents,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		});
	}),
);

/**
 * POST /api/incidents/:id/assign
 * Przypisanie incydentu do siebie (tylko jeśli jest nieprzypisany)
 */
router.post(
	"/:id/assign",
	requireAuth,
	requireRole(["analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { id } = req.params;
		uuidSchema.parse(id);

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET "analystId" = $1
			WHERE id = $2 AND "organizationId" = $3 AND "analystId" IS NULL
			RETURNING *`,
			[req.user.id, id, req.organizationId],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message: "Incydent nie został znaleziony lub jest już przypisany",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * POST /api/incidents/:id/unassign
 * Usunięcie przypisania incydentu (tylko jeśli jest przypisany do mnie)
 */
router.post(
	"/:id/unassign",
	requireAuth,
	requireRole(["analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { id } = req.params;
		uuidSchema.parse(id);

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET "analystId" = NULL
			WHERE id = $1 AND "organizationId" = $2 AND "analystId" = $3
			RETURNING *`,
			[id, req.organizationId, req.user.id],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message:
						"Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * PATCH /api/incidents/:id/status
 * Zmiana statusu incydentu (tylko przypisanego do mnie)
 */
router.patch(
	"/:id/status",
	requireAuth,
	requireRole(["analityk", "admin"]),
	validate(updateIncidentStatusSchema, "body"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { id } = req.params;
		uuidSchema.parse(id);

		const { status } = req.body;

		// Sprawdź czy incydent jest przypisany do analityka lub admin może wszystko
		const whereClause =
			req.memberRole === "admin"
				? `id = $1 AND "organizationId" = $2`
				: `id = $1 AND "organizationId" = $2 AND "analystId" = $3`;

		const params =
			req.memberRole === "admin"
				? [id, req.organizationId]
				: [id, req.organizationId, req.user.id];

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET status = $${params.length + 1}
			WHERE ${whereClause}
			RETURNING *`,
			[...params, status],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message:
						"Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * PATCH /api/incidents/:id/note
 * Dodanie/aktualizacja notatki analityka
 */
router.patch(
	"/:id/note",
	requireAuth,
	requireRole(["analityk", "admin"]),
	validate(updateIncidentNoteSchema, "body"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { id } = req.params;
		uuidSchema.parse(id);

		const { analystNote } = req.body;

		const whereClause =
			req.memberRole === "admin"
				? `id = $1 AND "organizationId" = $2`
				: `id = $1 AND "organizationId" = $2 AND "analystId" = $3`;

		const params =
			req.memberRole === "admin"
				? [id, req.organizationId]
				: [id, req.organizationId, req.user.id];

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET "analystNote" = $${params.length + 1}
			WHERE ${whereClause}
			RETURNING *`,
			[...params, analystNote],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message:
						"Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * PATCH /api/incidents/:id/resolve
 * Oznaczenie incydentu jako rozwiązany/nierozwiązany
 * Automatycznie ustawia dataRozwiazania przez trigger
 */
router.patch(
	"/:id/resolve",
	requireAuth,
	requireRole(["analityk", "admin"]),
	validate(resolveIncidentSchema, "body"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { id } = req.params;
		uuidSchema.parse(id);

		const { resolved } = req.body;

		const whereClause =
			req.memberRole === "admin"
				? `id = $1 AND "organizationId" = $2`
				: `id = $1 AND "organizationId" = $2 AND "analystId" = $3`;

		const params =
			req.memberRole === "admin"
				? [id, req.organizationId]
				: [id, req.organizationId, req.user.id];

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET "czyRozwiazany" = $${params.length + 1}
			WHERE ${whereClause}
			RETURNING *`,
			[...params, resolved],
		);

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message:
						"Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * POST /api/incidents/:id/report
 * Wgranie raportu analityka (PDF/DOCX)
 */
router.post(
	"/:id/report",
	requireAuth,
	requireRole(["analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const id = uuidSchema.parse(req.params.id);

		// Parsuj multipart/form-data
		const { files } = await parseMultipartFormData(req);

		if (!files.report) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_FILE",
					message: "Plik raportu jest wymagany",
				},
			});
		}

		// Waliduj plik
		validateFile(files.report, "report");

		// Generuj ścieżkę w MinIO
		const reportPath = generateStorageKey(
			id,
			"report",
			files.report.metadata.originalName,
		);

		// Upload do MinIO
		await storageClient.putObject(
			reportPath,
			Buffer.from(files.report.buffer),
			{ contentType: files.report.metadata.mimeType },
		);

		// Aktualizuj bazę danych
		const whereClause =
			req.memberRole === "admin"
				? `id = $1 AND "organizationId" = $2`
				: `id = $1 AND "organizationId" = $2 AND "analystId" = $3`;

		const params =
			req.memberRole === "admin"
				? [id, req.organizationId]
				: [id, req.organizationId, req.user.id];

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET 
				"analystReportPath" = $${params.length + 1},
				"analystReportMetadata" = $${params.length + 2},
				"analystReportData" = now()
			WHERE ${whereClause}
			RETURNING *`,
			[...params, reportPath, JSON.stringify(files.report.metadata)],
		);

		if (!incident) {
			// Rollback - usuń plik z MinIO
			await storageClient.deleteObject(reportPath);

			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message:
						"Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * POST /api/incidents/:id/statement
 * Wgranie sprawozdania analityka (PDF/DOCX)
 */
router.post(
	"/:id/statement",
	requireAuth,
	requireRole(["analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const id = uuidSchema.parse(req.params.id);

		// Parsuj multipart/form-data
		const { files } = await parseMultipartFormData(req);

		if (!files.statement) {
			return res.status(400).json({
				success: false,
				error: {
					code: "MISSING_FILE",
					message: "Plik sprawozdania jest wymagany",
				},
			});
		}

		// Waliduj plik
		validateFile(files.statement, "statement");

		// Generuj ścieżkę w MinIO
		const statementPath = generateStorageKey(
			id,
			"statement",
			files.statement.metadata.originalName,
		);

		// Upload do MinIO
		await storageClient.putObject(
			statementPath,
			Buffer.from(files.statement.buffer),
			{ contentType: files.statement.metadata.mimeType },
		);

		// Aktualizuj bazę danych
		const whereClause =
			req.memberRole === "admin"
				? `id = $1 AND "organizationId" = $2`
				: `id = $1 AND "organizationId" = $2 AND "analystId" = $3`;

		const params =
			req.memberRole === "admin"
				? [id, req.organizationId]
				: [id, req.organizationId, req.user.id];

		const incident = await queryOne<Incident>(
			`UPDATE incidents
			SET 
				"analystStatementPath" = $${params.length + 1},
				"analystStatementMetadata" = $${params.length + 2},
				"analystStatementData" = now()
			WHERE ${whereClause}
			RETURNING *`,
			[...params, statementPath, JSON.stringify(files.statement.metadata)],
		);

		if (!incident) {
			// Rollback - usuń plik z MinIO
			await storageClient.deleteObject(statementPath);

			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message:
						"Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
				},
			});
		}

		res.json({
			success: true,
			data: incident,
		});
	}),
);

/**
 * GET /api/incidents/:id/files/:fileType/download
 * Generowanie presigned URL do pobrania pliku
 *
 * fileType: screenshot | attachment | report | statement
 */
router.get(
	"/:id/files/:fileType/download",
	requireAuth,
	requireRole(["pracownik", "analityk", "admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const id = uuidSchema.parse(req.params.id);
		const { fileType } = req.params;

		if (
			!fileType ||
			!["screenshot", "attachment", "report", "statement"].includes(fileType)
		) {
			return res.status(400).json({
				success: false,
				error: {
					code: "INVALID_FILE_TYPE",
					message: "Nieprawidłowy typ pliku",
				},
			});
		}

		// Pobierz incydent
		let incident: Incident | null = null;

		if (req.memberRole === "pracownik") {
			// Pracownik może pobierać tylko pliki z własnych incydentów
			incident = await queryOne<Incident>(
				`SELECT * FROM incidents
				WHERE id = $1 AND "userId" = $2 AND "organizationId" = $3`,
				[id, req.user.id, req.organizationId],
			);
		} else {
			// Analityk i Admin widzą wszystko w organizacji
			incident = await queryOne<Incident>(
				`SELECT * FROM incidents
				WHERE id = $1 AND "organizationId" = $2`,
				[id, req.organizationId],
			);
		}

		if (!incident) {
			return res.status(404).json({
				success: false,
				error: {
					code: "NOT_FOUND",
					message: "Incydent nie został znaleziony",
				},
			});
		}

		// Pobierz ścieżkę do pliku
		let filePath: string | null = null;
		let metadata: unknown = null;

		switch (fileType) {
			case "screenshot":
				filePath = incident.userScreenshotPath;
				metadata = incident.userScreenshotMetadata;
				break;
			case "attachment":
				filePath = incident.userAttachmentPath;
				metadata = incident.userAttachmentMetadata;
				break;
			case "report":
				filePath = incident.analystReportPath;
				metadata = incident.analystReportMetadata;
				break;
			case "statement":
				filePath = incident.analystStatementPath;
				metadata = incident.analystStatementMetadata;
				break;
		}

		if (!filePath) {
			return res.status(404).json({
				success: false,
				error: {
					code: "FILE_NOT_FOUND",
					message: "Plik nie został jeszcze wgrany",
				},
			});
		}

		// Generuj presigned URL (ważny przez 1 godzinę)
		const presignedUrl = await presignObject(filePath, {
			expiresIn: 3600,
		});

		res.json({
			success: true,
			data: {
				url: presignedUrl,
				metadata,
				expiresIn: 3600,
			},
		});
	}),
);

/**
 * GET /api/incidents/admin/all
 * Pobieranie wszystkich incydentów w organizacji
 */
router.get(
	"/admin/all",
	requireAuth,
	requireRole(["admin"]),
	validate(paginationSchema, "query"),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		const { page, limit } = req.query as unknown as {
			page: number;
			limit: number;
		};
		const offset = (page - 1) * limit;

		const incidents = await query<Incident>(
			`SELECT * FROM incidents
			WHERE "organizationId" = $1
			ORDER BY "createdAt" DESC
			LIMIT $2 OFFSET $3`,
			[req.organizationId, limit, offset],
		);

		const totalResult = await queryOne<{ count: string }>(
			`SELECT COUNT(*)::text as count FROM incidents
			WHERE "organizationId" = $1`,
			[req.organizationId],
		);

		const total = Number.parseInt(totalResult?.count || "0", 10);

		res.json({
			success: true,
			data: incidents,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		});
	}),
);

/**
 * GET /api/incidents/admin/stats
 * Statystyki incydentów w organizacji
 */
router.get(
	"/admin/stats",
	requireAuth,
	requireRole(["admin"]),
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		// Liczba zgłoszeń ogółem
		const totalResult = await queryOne<{ count: string }>(
			`SELECT COUNT(*)::text as count FROM incidents
			WHERE "organizationId" = $1`,
			[req.organizationId],
		);
		const totalIncidents = Number.parseInt(totalResult?.count || "0", 10);

		// Liczba rozwiązanych
		const resolvedResult = await queryOne<{ count: string }>(
			`SELECT COUNT(*)::text as count FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true`,
			[req.organizationId],
		);
		const resolvedIncidents = Number.parseInt(resolvedResult?.count || "0", 10);

		// Procent rozwiązanych
		const resolvedPercentage =
			totalIncidents > 0
				? ((resolvedIncidents / totalIncidents) * 100).toFixed(2)
				: "0.00";

		// Średni czas rozwiązywania (w sekundach)
		const avgTimeResult = await queryOne<{ avg_seconds: string }>(
			`SELECT 
				AVG(EXTRACT(EPOCH FROM ("dataRozwiazania" - "dataZgloszenia")))::text as avg_seconds
			FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true AND "dataRozwiazania" IS NOT NULL`,
			[req.organizationId],
		);

		const avgSeconds = Number.parseFloat(avgTimeResult?.avg_seconds || "0");

		// Przelicz na dni, godziny, minuty, sekundy
		const days = Math.floor(avgSeconds / 86400);
		const hours = Math.floor((avgSeconds % 86400) / 3600);
		const minutes = Math.floor((avgSeconds % 3600) / 60);
		const seconds = Math.floor(avgSeconds % 60);

		res.json({
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
		});
	}),
);

/**
 * GET /api/incidents/:id/files/:type/:filename
 * Pobieranie plików z własnych incydentów przez pracownika
 */
async function downloadFile(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const { id, type, filename } = req.params;
		const userId = authReq.user.id;
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

		// Sprawdź czy incydent należy do użytkownika
		const incident = await queryOne<{
			organizationId: string;
			userId: string;
		}>(
			`
			SELECT "organizationId", "userId" FROM incidents
			WHERE id = $1 AND "organizationId" = $2 AND "userId" = $3
		`,
			[id, organizationId, userId],
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

		// Określ kolumny do pobrania na podstawie typu pliku
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

		const fileData = await queryOne<{ metadata: unknown; path: string }>(
			`
			SELECT "${metadataColumn}" as metadata, "${pathColumn}" as path FROM incidents
			WHERE id = $1 AND "organizationId" = $2 AND "userId" = $3
		`,
			[id, organizationId, userId],
		);

		if (!fileData?.metadata || !fileData?.path) {
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
		} catch (_e) {
			return res.status(500).json({
				success: false,
				error: {
					code: "METADATA_PARSE_ERROR",
					message: "Błąd parsowania metadanych pliku",
				},
			});
		}

		// Znajdź plik w metadanych
		let fileMetadata: StoredFileMetadata | null = null;
		let filePath: string | null = null;

		if (Array.isArray(parsedMetadata)) {
			// Dla wielu plików
			fileMetadata = findStoredFileMetadata(parsedMetadata, filename);
			filePath = fileMetadata?.path ?? null;
		} else if (parsedMetadata) {
			// Dla pojedynczych plików
			fileMetadata = parsedMetadata;
			filePath = fileData.path;
		}

		if (!fileMetadata || !filePath) {
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

		const realFilename =
			fileMetadata.filename || fileMetadata.originalName || filename;
		res.setHeader(
			"Content-Disposition",
			createContentDispositionHeader(realFilename),
		);

		res.setHeader("Content-Length", fileBuffer.length);
		res.send(fileBuffer);
	} catch (error) {
		console.error("[EMPLOYEE] Download file error:", error);
		res.status(500).json({
			success: false,
			error: {
				code: "DOWNLOAD_ERROR",
				message: "Nie udało się pobrać pliku",
			},
		});
	}
}

router.get(
	"/:id/files/:type/:filename",
	requireAuth,
	requireRole(["pracownik", "analityk", "admin"]),
	asyncHandler(downloadFile),
);

export default router;
