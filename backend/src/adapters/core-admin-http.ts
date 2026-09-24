import type { Request, Response } from "express";
import { Effect } from "effect";
import { fromNodeHeaders } from "../identity/transport";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import { readAdmin, adminReadsLayer, type AdminProjection } from "../core/incidents/admin-reads";
import { runCore } from "../core/runtime";
import { DomainError } from "../contracts/errors";
import { adminIncidentsQuerySchema } from "../contracts/admin-queries";
import {
	adminIncidentsQueryFromLegacyGet,
	setDeprecatedGetHeaders,
	setQueryResponseHeaders,
	requireQueryJson,
} from "../routes/admin/query-schemas";
import { errorHandler } from "../middleware/error.middleware";
export const coreAdminRoutes = [
	{
		method: "get" as const,
		paths: [
			"/api/admin/incidents",
			"/api/admin/incidents/filters",
			"/api/incidents/admin/stats",
		],
	},
	{ method: "query" as const, paths: ["/api/admin/incidents"] },
];
export function coreAdminHandler(identity: IdentityReader, projection: AdminProjection) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			if (live.role !== "admin") throw new DomainError("FORBIDDEN");
			let request: Parameters<typeof readAdmin>[1];
			if (req.path.replace(/\/+$/, "").endsWith("/filters")) request = { type: "filters" };
			else if (req.path.replace(/\/+$/, "").endsWith("/stats")) request = { type: "summary" };
			else {
				if (req.method === "QUERY") {
					let valid = false;
					requireQueryJson(req, res, () => {
						valid = true;
					});
					if (!valid) return;
					setQueryResponseHeaders(req, res, () => {});
				} else setDeprecatedGetHeaders("query-admin-incidents")(req, res, () => {});
				request = {
					type: "query",
					input: adminIncidentsQuerySchema.parse(
						req.method === "QUERY"
							? req.body
							: adminIncidentsQueryFromLegacyGet(req.query),
					),
				};
			}
			return res.json(
				await runCore(
					readAdmin(live, request).pipe(Effect.provide(adminReadsLayer(projection))),
				),
			);
		} catch (error) {
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}
