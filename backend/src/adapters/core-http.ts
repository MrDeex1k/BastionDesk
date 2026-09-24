import type { Request, Response } from "express";
import { Effect } from "effect";
import { fromNodeHeaders } from "../identity/transport";
import { incidentStatusSchema } from "../contracts";
import { DomainError } from "../contracts/errors";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import {
	getIncident,
	listIncidents,
	readsLayer,
	type IncidentReads,
	type ListView,
} from "../core/incidents/reads";
import { runCore } from "../core/runtime";
import { errorHandler } from "../middleware/error.middleware";
import { paginationSchema, uuidSchema } from "../utils/validation";

export const coreReadPaths = [
	"/api/incidents/my",
	"/api/incidents/analyst/assigned",
	"/api/incidents/analyst/unassigned",
	"/api/incidents/admin/all",
	"/api/incidents/:id",
	"/api/analyst/incidents/assigned",
	"/api/analyst/incidents/unassigned",
	"/api/analyst/incidents/:id",
	"/api/admin/incidents/:id",
];
export function coreReadHandler(identity: IdentityReader, reads: IncidentReads) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			const roleRoute = /^\/api\/(analyst|admin)\//.exec(req.path)?.[1];
			if (
				roleRoute &&
				(live.role === "pracownik" || (roleRoute === "admin" && live.role !== "admin"))
			)
				throw new DomainError("FORBIDDEN");
			const last = req.path.replace(/\/+$/, "").split("/").at(-1)!;
			const views = new Map<string, ListView>([
				["my", "mine"],
				["assigned", "assigned"],
				["unassigned", "unassigned"],
				["all", "all"],
			]);
			const view = views.get(last);
			if (view) {
				const pagination = paginationSchema.parse(req.query);
				const sortBy =
					typeof req.query.sortBy === "string" ? req.query.sortBy : "createdAt";
				const sortOrder =
					typeof req.query.sortOrder === "string"
						? req.query.sortOrder.toLowerCase()
						: "desc";
				if (
					roleRoute &&
					(![
						"createdAt",
						"updatedAt",
						"status",
						"dataZgloszenia",
						"userId",
						"analystId",
					].includes(sortBy) ||
						!["asc", "desc"].includes(sortOrder))
				)
					return res.status(400).json({
						success: false,
						error: { code: "INVALID_SORT", message: "Nieprawidłowe sortowanie" },
					});
				const result = await runCore(
					listIncidents(live, view, {
						...pagination,
						...(roleRoute
							? {
									status: incidentStatusSchema
										.optional()
										.parse(
											typeof req.query.status === "string"
												? req.query.status
												: undefined,
										),
									sortBy,
									sortOrder: sortOrder as "asc" | "desc",
								}
							: {}),
					}).pipe(Effect.provide(readsLayer(reads))),
				);
				return res.json({
					success: true,
					data: result.incidents,
					pagination: {
						...pagination,
						total: roleRoute === "analyst" ? String(result.total) : result.total,
						totalPages: Math.ceil(result.total / pagination.limit),
					},
				});
			}
			const incident = await runCore(
				getIncident(live, uuidSchema.parse(last), Boolean(roleRoute)).pipe(
					Effect.provide(readsLayer(reads)),
				),
			);
			return res.json({ success: true, data: incident });
		} catch (error) {
			if (error instanceof DomainError && error.code === "NOT_FOUND") {
				const primary = req.path.startsWith("/api/incidents/");
				return res.status(404).json({
					success: false,
					error: {
						code: primary ? "NOT_FOUND" : "INCIDENT_NOT_FOUND",
						message: primary
							? "Incydent nie został znaleziony"
							: req.path.startsWith("/api/admin/")
								? "Zgłoszenie nie zostało znalezione lub nie masz do niego dostępu"
								: "Zgłoszenie nie zostało znalezione",
					},
				});
			}
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}
