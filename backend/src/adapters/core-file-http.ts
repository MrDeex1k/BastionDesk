import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { fromNodeHeaders } from "better-auth/node";
import { DomainError } from "../contracts/errors";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import { getIncident, readsLayer, type IncidentReads } from "../core/incidents/reads";
import {
	changeIncident,
	writesLayer,
	IncidentRuleError,
	type IncidentWrites,
	type IncidentChange,
} from "../core/incidents/commands";
import {
	incidentFile,
	storageLayer,
	fileColumns,
	type StoredFileKind,
} from "../core/files/service";
import { createContentDispositionHeader } from "../core/files/metadata";
import { runCore } from "../core/runtime";
import { getObjectBuffer, presignObject, putObject, deleteObject } from "../lib/storage";
import { env } from "../lib/env";
import { errorHandler } from "../middleware/error.middleware";
import {
	generateStorageKey,
	parseBase64FileUpload,
	parseMultipartFormData,
	validateFile,
} from "../utils/file.helper";
import { uuidSchema } from "../utils/validation";
import { operationRequest } from "./core-operation";

export const coreFileRoutes = [
	{
		method: "get" as const,
		paths: [
			"/api/incidents/:id/files/:type/:filename",
			"/api/analyst/incidents/:id/files/:type/:filename",
			"/api/admin/incidents/:id/files/:type/:filename",
		],
	},
	{
		method: "post" as const,
		paths: [
			"/api/incidents/:id/report",
			"/api/incidents/:id/statement",
			"/api/analyst/incidents/:id/reports",
			"/api/analyst/incidents/:id/statements",
		],
	},
];
export function coreFileHandler(
	identity: IdentityReader,
	reads: IncidentReads,
	writes: IncidentWrites,
) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			const workflow = req.path.startsWith("/api/analyst/");
			const admin = req.path.startsWith("/api/admin/");
			if ((workflow && live.role === "pracownik") || (admin && live.role !== "admin"))
				throw new DomainError("FORBIDDEN");
			const parts = req.path.replace(/\/+$/, "").split("/");
			const id = uuidSchema.parse(parts[workflow || admin ? 4 : 3]);
			if (req.method === "GET" || req.method === "HEAD") {
				const type = parts.at(-2)!;
				const filename = decodeURIComponent(parts.at(-1)!);
				const singular = new Map([
					["screenshot", "screenshots"],
					["attachment", "attachments"],
					["report", "reports"],
					["statement", "statements"],
				]);
				const presign =
					!workflow && !admin && filename === "download" && singular.has(type);
				const kind = presign ? singular.get(type)! : type;
				if (!Object.hasOwn(fileColumns, kind))
					return res.status(400).json({
						success: false,
						error: {
							code: "INVALID_FILE_TYPE",
							message: "Nieprawidłowy typ pliku",
						},
					});
				const result = await runCore(
					incidentFile(
						live,
						id,
						kind as StoredFileKind,
						presign ? undefined : filename,
						presign,
						workflow || admin,
					).pipe(
						Effect.provide(readsLayer(reads)),
						Effect.provide(
							storageLayer({
								read: getObjectBuffer,
								presign: (key) => presignObject(key, { expiresIn: 3600 }),
							}),
						),
					),
				);
				if (presign)
					return res.json({
						success: true,
						data: { url: result.content, metadata: result.metadata, expiresIn: 3600 },
					});
				res.setHeader(
					"Content-Type",
					result.metadata.mimeType ?? "application/octet-stream",
				);
				res.setHeader(
					"Content-Disposition",
					createContentDispositionHeader(
						result.metadata.originalName ?? result.metadata.filename ?? filename,
					),
				);
				res.setHeader("Content-Length", Buffer.byteLength(result.content));
				return res.send(result.content);
			}
			if (live.role === "pracownik") throw new DomainError("FORBIDDEN");
			const operation = operationRequest(req);
			const kind = parts.at(-1)!.startsWith("report") ? "report" : "statement";
			const incident = await runCore(
				getIncident(live, id).pipe(Effect.provide(readsLayer(reads))),
			);
			if (live.role !== "admin" && incident.analystId !== live.subject)
				throw new DomainError("FORBIDDEN");
			let buffer: Buffer;
			let metadata: Record<string, unknown>;
			let originalName: string;
			let mimeType: string;
			if (workflow) {
				const file = parseBase64FileUpload(
					req.body[kind === "report" ? "reportData" : "statementData"],
					kind,
				);
				buffer = file.buffer;
				metadata = { bucket: env.S3_BUCKET, ...file.metadata };
				originalName = file.metadata.filename;
				mimeType = file.metadata.mimeType;
			} else {
				const { files } = await parseMultipartFormData(req);
				const file = files[kind];
				if (!file)
					return res.status(400).json({
						success: false,
						error: {
							code: "MISSING_FILE",
							message:
								kind === "report"
									? "Plik raportu jest wymagany"
									: "Plik sprawozdania jest wymagany",
						},
					});
				validateFile(file, kind);
				buffer = Buffer.from(file.buffer);
				metadata = { ...file.metadata };
				originalName = file.metadata.originalName;
				mimeType = file.metadata.mimeType;
			}
			metadata.contentHash = createHash("sha256").update(buffer).digest("hex");
			const path = generateStorageKey(id, kind, originalName);
			await putObject(path, buffer, { contentType: mimeType });
			const change: IncidentChange = { type: "file", kind, path, metadata };
			const result = await runCore(
				changeIncident(live, id, change, workflow ? "workflow" : "simple", operation).pipe(
					Effect.provide(writesLayer(writes)),
				),
			);
			const committedPath =
				kind === "report"
					? result.incident.analystReportPath
					: result.incident.analystStatementPath;
			if (committedPath !== path)
				await deleteObject(path).catch(() =>
					console.error("[CORE] Orphan upload cleanup failed"),
				);
			if (!workflow) return res.json({ success: true, data: result.incident });
			const prefix = kind === "report" ? "analystReport" : "analystStatement";
			return res.json({
				success: true,
				message:
					kind === "report"
						? "Raport został przesłany"
						: "Sprawozdanie zostało przesłane",
				data: {
					id,
					[`${prefix}Path`]: result.incident[`${prefix}Path`],
					[`${prefix}Metadata`]: result.incident[`${prefix}Metadata`],
					[`${prefix}Data`]: result.incident[`${prefix}Data`],
					status: result.incident.status,
				},
			});
		} catch (error) {
			if (error instanceof IncidentRuleError)
				return res
					.status(error.kind === "missing" ? 404 : error.kind === "denied" ? 403 : 400)
					.json({ success: false, error: { code: error.code, message: error.message } });
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}
