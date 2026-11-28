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
import { z } from "zod";
import type { LiveIdentity } from "../identity/contract";
import { isPublicIp, type IpReputation, type ReputationResult } from "../core/ioc/enrichment";
import { incidentIndicators } from "../core/ioc/evidence";
import {
	lookupEligibility,
	lookupProviders,
	type LookupProvider,
	type LookupResult,
	type ProviderLookups,
} from "../core/ioc/provider-lookups";
import { runCore } from "../core/runtime";
import { errorHandler } from "../middleware/error.middleware";
import { paginationSchema, uuidSchema } from "../utils/validation";
import type { Urlhaus, UrlhausLookup } from "./urlhaus";
import type { EnrichmentCheck, EnrichmentTarget } from "../core/ioc/automatic";

type ScheduleCheck = (
	org: string,
	id: string,
	target: EnrichmentTarget,
	subject: string,
) => Promise<EnrichmentCheck | undefined>;

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
export function coreReadHandler(
	identity: IdentityReader,
	reads: IncidentReads,
	reputation?: IpReputation,
	urlhaus?: Urlhaus,
	providerLookups?: ProviderLookups,
	readEnrichment?: (org: string, incidentId: string) => Promise<EnrichmentCheck[]>,
) {
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
			return res.json({
				success: true,
				data:
					live.role === "pracownik"
						? incident
						: {
								...incident,
								indicators: incidentIndicators(incident),
								ipReputation:
									(await reputation?.enabled(live.organizationId)) ?? false,
								urlhaus: Boolean(urlhaus),
								lookupProviders:
									(await providerLookups?.enabled(live.organizationId)) ?? [],
								...(readEnrichment
									? {
											enrichmentChecks: await readEnrichment(
												live.organizationId,
												incident.id,
											),
										}
									: {}),
							},
			});
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

const reputationBody = z.strictObject({ address: z.string().min(1).max(64) });
export const coreReputationPaths = ["/api/analyst/incidents/:id/ip-reputation"];
export function coreReputationHandler(
	identity: IdentityReader,
	reads: IncidentReads,
	audit: (
		actor: LiveIdentity,
		incidentId: string,
		status: ReputationResult["status"],
	) => Promise<void>,
	reputation?: IpReputation,
	schedule?: ScheduleCheck,
) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			if (live.role === "pracownik") throw new DomainError("FORBIDDEN");
			const body = reputationBody.safeParse(req.body);
			if (!body.success) throw new DomainError("VALIDATION_ERROR");
			const incident = await runCore(
				getIncident(live, uuidSchema.parse(req.params.id)).pipe(
					Effect.provide(readsLayer(reads)),
				),
			);
			const { address } = body.data;
			const present = incidentIndicators(incident).some(
				(indicator) =>
					(indicator.kind === "ipv4" || indicator.kind === "ipv6") &&
					indicator.value === address,
			);
			if (!present) throw new DomainError("NOT_FOUND");
			if (schedule && isPublicIp(address)) {
				const target = {
					provider: "abuseipdb",
					kind: address.includes(":") ? "ipv6" : "ipv4",
					value: address,
				} as const;
				const queued = await schedule(
					live.organizationId,
					incident.id,
					target,
					live.subject,
				);
				return res.json({ success: true, data: scheduledResult(queued) });
			}
			const data: ReputationResult = !isPublicIp(address)
				? { status: "not_public" }
				: ((await reputation?.check(live.organizationId, address)) ?? {
						status: "not_configured",
					});
			await audit(live, incident.id, data.status).catch(() =>
				console.error("[IOC] Could not persist lookup audit"),
			);
			return res.json({ success: true, data });
		} catch (error) {
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}

// Percent encoding can expand the extracted URL beyond the source token limit.
const urlhausBody = z.strictObject({ url: z.string().min(1).max(20_000) });
export const coreUrlhausPaths = ["/api/analyst/incidents/:id/urlhaus"];
export function coreUrlhausHandler(
	identity: IdentityReader,
	reads: IncidentReads,
	audit: (
		actor: LiveIdentity,
		incidentId: string,
		status: UrlhausLookup["status"],
	) => Promise<void>,
	urlhaus?: Urlhaus,
	schedule?: ScheduleCheck,
) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			if (live.role === "pracownik") throw new DomainError("FORBIDDEN");
			const body = urlhausBody.safeParse(req.body);
			if (!body.success) throw new DomainError("VALIDATION_ERROR");
			const incident = await runCore(
				getIncident(live, uuidSchema.parse(req.params.id)).pipe(
					Effect.provide(readsLayer(reads)),
				),
			);
			const { url } = body.data;
			if (
				!incidentIndicators(incident).some(
					({ kind, value }) => kind === "url" && value === url,
				)
			)
				throw new DomainError("NOT_FOUND");
			if (schedule) {
				const queued = await schedule(
					live.organizationId,
					incident.id,
					{ provider: "urlhaus", kind: "url", value: url },
					live.subject,
				);
				return res.json({
					success: true,
					data: { provider: "urlhaus", ...scheduledResult(queued) },
				});
			}
			const data: UrlhausLookup = (await urlhaus?.check(url)) ?? {
				provider: "urlhaus",
				status: "not_configured",
			};
			await audit(live, incident.id, data.status).catch(() =>
				console.error("[IOC] Could not persist lookup audit"),
			);
			return res.json({ success: true, data });
		} catch (error) {
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}

const lookupBody = z.strictObject({
	provider: z.enum(lookupProviders),
	kind: z.enum(["ipv4", "ipv6", "domain", "url", "md5", "sha1", "sha256"]),
	value: z.string().min(1).max(20_000),
});
export const coreLookupPaths = ["/api/analyst/incidents/:id/ioc-enrichment"];
export function coreLookupHandler(
	identity: IdentityReader,
	reads: IncidentReads,
	audit: (
		provider: LookupProvider,
		actor: LiveIdentity,
		id: string,
		status: LookupResult["status"],
	) => Promise<void>,
	lookups: ProviderLookups,
	schedule?: ScheduleCheck,
) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			if (live.role === "pracownik") throw new DomainError("FORBIDDEN");
			const body = lookupBody.safeParse(req.body);
			if (!body.success) throw new DomainError("VALIDATION_ERROR");
			const incident = await runCore(
				getIncident(live, uuidSchema.parse(req.params.id)).pipe(
					Effect.provide(readsLayer(reads)),
				),
			);
			const { provider, kind, value } = body.data;
			if (
				!incidentIndicators(incident).some(
					(indicator) => indicator.kind === kind && indicator.value === value,
				)
			)
				throw new DomainError("NOT_FOUND");
			if (schedule) {
				const target = { provider, kind, value };
				const status = lookupEligibility(provider, target);
				if (status !== "allowed") {
					await audit(provider, live, incident.id, status).catch(() =>
						console.error("[IOC] Could not persist lookup audit"),
					);
					return res.json({ success: true, data: { provider, status } });
				}
				const queued = await schedule(
					live.organizationId,
					incident.id,
					target,
					live.subject,
				);
				return res.json({ success: true, data: { provider, ...scheduledResult(queued) } });
			}
			const data = await lookups.check(live.organizationId, provider, { kind, value });
			await audit(provider, live, incident.id, data.status).catch(() =>
				console.error("[IOC] Could not persist lookup audit"),
			);
			return res.json({ success: true, data });
		} catch (error) {
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}

function scheduledResult(check: EnrichmentCheck | undefined) {
	if (!check) return { status: "not_configured" };
	if (!check.result) return { status: "pending" };
	return { ...check.result, retryAt: check.retryAt };
}
