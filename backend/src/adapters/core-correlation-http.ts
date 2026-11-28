import type { Request, Response } from "express";
import { Effect } from "effect";
import { z } from "zod";
import { DomainError, domainErrorResponse, errorResponse } from "../contracts/errors";
import { alertReference } from "../core/alerts/read";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import { runCore } from "../core/runtime";
import type { LiveIdentity } from "../identity/contract";
import { fromNodeHeaders } from "../identity/transport";
import { decodeQueueCursor } from "../correlation/pagination";
import type { wazuhService } from "../wazuh/service";
import { WazuhError, type wazuhSourceStore } from "../wazuh/source";
import { CorrelationConflict, type correlationCases } from "./core-correlation-store";

const pathId = z.uuid();
const lookup = z.string().trim().max(200).default("");
const reason = z.string().trim().min(1).max(1000);
const historyBefore = z
	.string()
	.regex(/^[1-9]\d{0,18}$/)
	.refine((value) => value.length < 19 || value <= "9223372036854775807");
const caseList = z.object({
	sort: z.enum(["recent", "risk"]).default("recent"),
	status: z.enum(["open", "closed"]).optional(),
	cursor: z.string().min(1).max(256).optional(),
});
const historyQuery = z.object({
	kind: z.enum(["operations", "risk"]),
	before: historyBefore.optional(),
});
const alertKey = alertReference
	.pick({ indexName: true, documentId: true })
	.extend({ revision: z.uuid() });
const createCase = z
	.strictObject({
		title: z.string().trim().min(1).max(200),
		note: z.string().trim().max(4000).optional(),
		reportId: z.uuid().optional(),
		alert: alertKey.optional(),
	})
	.refine(({ reportId, alert }) => Boolean(reportId || alert));
const caseAction = z.discriminatedUnion("action", [
	z.strictObject({ action: z.literal("take") }),
	z.strictObject({ action: z.literal("close") }),
	z.strictObject({ action: z.literal("reopen"), reason }),
	z.strictObject({ action: z.literal("unlink"), reason, evidenceId: z.uuid() }),
	z.strictObject({
		action: z.literal("move"),
		reason,
		evidenceId: z.uuid(),
		targetCaseId: z.uuid(),
	}),
	z.strictObject({ action: z.literal("attachReport"), reportId: z.uuid() }),
	z.strictObject({ action: z.literal("attachAlert"), alert: alertKey }),
]);

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw new DomainError("VALIDATION_ERROR");
	return parsed.data;
}

export function coreCorrelationRoutes(
	identity: IdentityReader,
	cases: ReturnType<typeof correlationCases>,
	wazuh: ReturnType<typeof wazuhService>,
	sources: ReturnType<typeof wazuhSourceStore>,
) {
	type Work = (req: Request, actor: LiveIdentity, signal: AbortSignal) => Promise<unknown>;
	const endpoint = (method: "get" | "post", path: string, work: Work) => ({
		method,
		paths: ["/api/correlation/" + path],
		async handle(req: Request, res: Response) {
			res.setHeader("Cache-Control", "private, no-store");
			const request = new AbortController();
			const abort = () => request.abort();
			res.once("close", abort);
			try {
				const actor = await runCore(
					currentIdentity(fromNodeHeaders(req.headers)).pipe(
						Effect.provide(identityLayer(identity)),
					),
				);
				if (actor.role !== "admin" && actor.role !== "analityk")
					throw new DomainError("FORBIDDEN");
				const data = await work(req, actor, request.signal);
				if (!request.signal.aborted) return res.status(200).json({ success: true, data });
			} catch (error) {
				if (request.signal.aborted) return;
				if (error instanceof CorrelationConflict)
					return res.status(409).json(errorResponse(error.code, error.message));
				if (error instanceof WazuhError) {
					const code = error.code;
					const status =
						code === "NOT_FOUND"
							? 404
							: code === "STALE" || code === "DISABLED"
								? 409
								: 503;
					const message =
						code === "NOT_FOUND"
							? "Alert nie jest już dostępny w Wazuh."
							: "Nie udało się odczytać danych z aktywnego źródła Wazuh.";
					return res.status(status).json(errorResponse("WAZUH_" + code, message));
				}
				const failure = domainErrorResponse(error);
				return res.status(failure.status).json(failure.body);
			} finally {
				res.off("close", abort);
			}
		},
	});
	const id = (req: Request) => validate(pathId, req.params.id);
	const remoteAlert = (
		actor: LiveIdentity,
		{ revision, indexName, documentId }: z.infer<typeof alertKey>,
		signal: AbortSignal,
	) => wazuh.correlationAlert(actor.organizationId, revision, { indexName, documentId }, signal);
	const timeRange = () => ({
		from: new Date(Date.now() - 30 * 86400_000).toISOString(),
		to: new Date().toISOString(),
	});

	async function pickAlerts(actor: LiveIdentity, query: string, signal: AbortSignal) {
		return wazuh.correlationPicker(actor.organizationId, { ...timeRange(), query }, signal);
	}

	return [
		endpoint("get", "cases", (req, actor) => {
			const { sort, status, cursor } = validate(caseList, req.query);
			const decoded = cursor ? decodeQueueCursor(cursor) : undefined;
			if (cursor && !decoded) throw new DomainError("VALIDATION_ERROR");
			return cases.list(actor.organizationId, sort, status, decoded);
		}),
		endpoint("get", "cases/:id", (req, actor) => cases.detail(actor.organizationId, id(req))),
		endpoint("get", "cases/:id/history", (req, actor) => {
			const { kind, before } = validate(historyQuery, req.query);
			return cases.history(actor.organizationId, id(req), kind, before);
		}),
		endpoint("get", "reports", (req, actor) =>
			cases.reports(actor.organizationId, validate(lookup, req.query.query)),
		),
		endpoint("get", "reports/:id", (req, actor) => cases.report(actor.organizationId, id(req))),
		endpoint("get", "alerts", (req, actor, signal) =>
			pickAlerts(actor, validate(lookup, req.query.query), signal),
		),
		endpoint("get", "agents", async (req, actor, signal) => {
			const rows = await pickAlerts(actor, validate(lookup, req.query.query), signal);
			return [
				...new Map(
					rows.map(({ sourceId, agentId, agentName }) => [
						agentId,
						{ sourceId, agentId, agentName },
					]),
				).values(),
			];
		}),
		endpoint("get", "alert-case", async (req, actor) => {
			const alert = validate(alertKey, req.query);
			const source = await sources.get(actor.organizationId);
			if (!source || alert.revision !== source.revision) return { caseId: null };
			return cases.alertCase(actor.organizationId, {
				...alert,
				sourceId: source.source_id ?? source.revision,
			});
		}),
		endpoint("post", "cases", async (req, actor, signal) => {
			const { alert, ...input } = validate(createCase, req.body);
			if (alert && !input.reportId) {
				const source = await sources.get(actor.organizationId);
				if (source && source.revision === alert.revision) {
					const existing = await cases.alertCase(actor.organizationId, {
						...alert,
						sourceId: source.source_id ?? source.revision,
					});
					if (existing.caseId) return { id: existing.caseId };
				}
			}
			return cases.create(actor, {
				...input,
				alert: alert ? await remoteAlert(actor, alert, signal) : undefined,
			});
		}),
		endpoint("post", "links", async (req, actor, signal) => {
			const input = validate(
				z.strictObject({ reportId: z.uuid(), alert: alertKey }),
				req.body,
			);
			return cases.link(actor, input.reportId, await remoteAlert(actor, input.alert, signal));
		}),
		endpoint("post", "reports/:id/asset", async (req, actor, signal) => {
			const asset = validate(
				z.strictObject({
					sourceId: z.uuid(),
					agentId: alertReference.shape.agentId,
				}),
				req.body,
			);
			const org = actor.organizationId;
			const rows = await wazuh.correlationCandidates(
				org,
				asset.sourceId,
				{ ...timeRange(), agentId: asset.agentId, sha256s: [] },
				signal,
			);
			if (
				!rows.some(
					(row) => row.sourceId === asset.sourceId && row.agentId === asset.agentId,
				)
			)
				throw new DomainError("NOT_FOUND");
			return cases.setAsset(actor, id(req), asset);
		}),
		endpoint("post", "reports/:id/refresh", (req, actor) =>
			cases.refresh(actor, { reportId: id(req) }),
		),
		endpoint("post", "cases/:id/refresh", (req, actor) =>
			cases.refresh(actor, { caseId: id(req) }),
		),
		endpoint("post", "cases/:id/actions", async (req, actor, signal) => {
			const action = validate(caseAction, req.body);
			return cases.change(
				actor,
				id(req),
				action.action === "attachAlert"
					? {
							action: "attachAlert",
							alert: await remoteAlert(actor, action.alert, signal),
						}
					: action,
			);
		}),
		endpoint("post", "suggestions/:id", (req, actor) => {
			const input = validate(
				z.strictObject({ decision: z.enum(["accepted", "rejected"]) }),
				req.body,
			);
			return cases.decide(actor, id(req), input.decision);
		}),
	];
}
