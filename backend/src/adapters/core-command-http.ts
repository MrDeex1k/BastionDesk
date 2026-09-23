import type { Request, Response } from "express";
import { Effect } from "effect";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { DomainError } from "../contracts/errors";
import { incidentStatusSchema } from "../contracts";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import {
	changeIncident,
	writesLayer,
	IncidentRuleError,
	type IncidentWrites,
	type IncidentChange,
	type CommandMode,
} from "../core/incidents/commands";
import { runCore } from "../core/runtime";
import { errorHandler } from "../middleware/error.middleware";
import { uuidSchema, updateIncidentNoteSchema, resolveIncidentSchema } from "../utils/validation";
export const coreWriteRoutes = [
	{
		method: "post" as const,
		paths: [
			"/api/incidents/:id/assign",
			"/api/incidents/:id/unassign",
			"/api/analyst/incidents/:id/assign",
			"/api/analyst/incidents/:id/unassign",
			"/api/admin/incidents/:id/unassign",
		],
	},
	{
		method: "patch" as const,
		paths: [
			"/api/incidents/:id/status",
			"/api/incidents/:id/note",
			"/api/incidents/:id/resolve",
		],
	},
	{
		method: "put" as const,
		paths: [
			"/api/analyst/incidents/:id/status",
			"/api/analyst/incidents/:id/notes",
			"/api/analyst/incidents/:id/resolve",
		],
	},
];
export function coreCommandHandler(identity: IdentityReader, writes: IncidentWrites) {
	return async (req: Request, res: Response) => {
		const mode: CommandMode = req.path.startsWith("/api/analyst/")
			? "workflow"
			: req.path.startsWith("/api/admin/")
				? "admin"
				: "simple";
		const parts = req.path.split("/");
		const action = parts.at(-1)!;
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			if (live.role === "pracownik" || (mode === "admin" && live.role !== "admin"))
				throw new DomainError("FORBIDDEN");
			const id = uuidSchema.parse(parts.at(-2));
			let change: IncidentChange;
			if (action === "status") {
				const status = incidentStatusSchema.safeParse(req.body.status);
				if (!status.success && mode === "workflow")
					return res.status(400).json({
						success: false,
						error: {
							code: req.body.status ? "INVALID_STATUS" : "MISSING_STATUS",
							message: req.body.status
								? "Nieprawidłowy status"
								: "Brak nowego statusu",
						},
					});
				change = { type: "status", status: incidentStatusSchema.parse(req.body.status) };
			} else if (action === "note" || action === "notes") {
				if (mode === "simple")
					change = {
						type: "note",
						note: updateIncidentNoteSchema.parse(req.body).analystNote,
					};
				else {
					const notes = z.string().max(10000).optional().safeParse(req.body.notes);
					if (!notes.success)
						return res.status(400).json({
							success: false,
							error: {
								code:
									typeof req.body.notes === "string"
										? "NOTES_TOO_LONG"
										: "INVALID_NOTES",
								message:
									typeof req.body.notes === "string"
										? "Notatki mogą mieć maksymalnie 10000 znaków"
										: "Notatki muszą być tekstem",
							},
						});
					change = { type: "note", note: notes.data ?? null };
				}
			} else if (action === "resolve")
				change = {
					type: "resolve",
					resolved:
						mode === "workflow" ? true : resolveIncidentSchema.parse(req.body).resolved,
				};
			else if (action === "assign" || action === "unassign") change = { type: action };
			else throw new DomainError("NOT_FOUND");
			const { before, incident } = await runCore(
				changeIncident(live, id, change, mode).pipe(Effect.provide(writesLayer(writes))),
			);
			if (mode !== "workflow") return res.json({ success: true, data: incident });
			const replies = {
				assign: {
					message: "Zgłoszenie zostało przypisane do Ciebie",
					data: { id, analystId: incident.analystId, status: incident.status },
				},
				unassign: {
					message: "Zgłoszenie zostało oddane do puli",
					data: { id, analystId: null, status: incident.status },
				},
				status: {
					message: "Status zgłoszenia został zaktualizowany",
					data: { id, oldStatus: before.status, newStatus: incident.status },
				},
				note: {
					message: "Notatki zostały zaktualizowane",
					data: { id, analystNote: incident.analystNote },
				},
				resolve: {
					message: "Zgłoszenie zostało oznaczone jako rozwiązane",
					data: { id, czyRozwiazany: true, dataRozwiazania: incident.dataRozwiazania },
				},
			};
			return res.json({ success: true, ...replies[change.type] });
		} catch (error) {
			if (error instanceof IncidentRuleError) {
				if (mode === "simple" && ["missing", "denied", "conflict"].includes(error.kind))
					return res.status(404).json({
						success: false,
						error: {
							code: "NOT_FOUND",
							message:
								action === "assign"
									? "Incydent nie został znaleziony lub jest już przypisany"
									: "Incydent nie został znaleziony lub nie jest przypisany do Ciebie",
						},
					});
				if (mode === "admin" && error.kind === "missing")
					return res.status(404).json({
						success: false,
						error: {
							code: "NOT_FOUND",
							message: "Incydent nie został znaleziony lub nie jest przypisany",
						},
					});
				return res
					.status({ missing: 404, denied: 403, conflict: 409, invalid: 400 }[error.kind])
					.json({ success: false, error: { code: error.code, message: error.message } });
			}
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}
