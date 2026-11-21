import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { z } from "zod";
import { identityIdSchema } from "../contracts";
import { DomainError, domainErrorResponse, errorResponse } from "../contracts/errors";
import { storedIncidentFile } from "../core/files/service";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import { getIncident, readsLayer, type IncidentReads } from "../core/incidents/reads";
import { IncidentRuleError } from "../core/incidents/commands";
import { runCore } from "../core/runtime";
import type { LiveIdentity } from "../identity/contract";
import { fromNodeHeaders } from "../identity/transport";
import { legacyScansAvailable } from "../yara/legacy";
import type { AttachmentScans } from "../yara/store";
import { baseRuleSet, maxRuleBytes, ruleSet } from "../yara/rules";
import type { yaraScanner } from "../yara/scanner";

const organization = z.object({ organizationId: identityIdSchema });
const target = z.object({
	id: z.uuid(),
	filename: z.string().min(1).max(512).optional(),
});
const custom = z.strictObject({
	rules: z
		.string()
		.trim()
		.min(1)
		.refine((text) => Buffer.byteLength(text) <= maxRuleBytes && !text.includes("\0")),
});
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export function coreYaraRoutes(
	identity: IdentityReader,
	reads: IncidentReads,
	scans: AttachmentScans,
	scanner: Pick<ReturnType<typeof yaraScanner>, "validate">,
	readObject: (key: string) => Promise<Buffer | null>,
) {
	function route(work: (live: LiveIdentity, req: Request) => Promise<unknown>) {
		return async (req: Request, res: Response) => {
			try {
				const live = await runCore(
					currentIdentity(fromNodeHeaders(req.headers)).pipe(
						Effect.provide(identityLayer(identity)),
					),
				);
				if (organization.parse(req.query).organizationId !== live.organizationId)
					throw new DomainError("FORBIDDEN");
				return res.json({ success: true, data: await work(live, req) });
			} catch (error) {
				if (error instanceof IncidentRuleError)
					return res.status(404).json(errorResponse(error.code, error.message));
				if (error instanceof LegacyScanLocked)
					return res
						.status(409)
						.json(
							errorResponse(
								"YARA_LEGACY_SCAN_LOCKED",
								"Ręczny skan starszych plików będzie dostępny po wycofaniu starych linków do pobrania.",
							),
						);
				if (error instanceof InvalidYaraRules)
					return res
						.status(422)
						.json(
							errorResponse(
								"YARA_INVALID_RULES",
								"Zestaw reguł YARA nie przeszedł kompilacji.",
							),
						);
				const response = domainErrorResponse(
					error instanceof z.ZodError ? new DomainError("VALIDATION_ERROR") : error,
				);
				return res.status(response.status).json(response.body);
			}
		};
	}

	async function attachment(live: LiveIdentity, req: Request) {
		const { id, filename } = target.parse({
			id: req.params.id,
			filename: req.query.filename,
		});
		const incident = await runCore(
			getIncident(live, id).pipe(Effect.provide(readsLayer(reads))),
		);
		const file = storedIncidentFile(incident, "attachments", filename, false);
		return {
			ref: {
				organizationId: live.organizationId,
				incidentId: id,
				storageKey: file.key,
			},
			metadata: file.metadata,
		};
	}

	const scanPath = ["/api/incidents/:id/attachment-scan"];
	const rulesPath = ["/api/admin/yara/rules"];
	return [
		{
			method: "get",
			paths: scanPath,
			handle: route(async (live, req) => {
				const { ref } = await attachment(live, req);
				const privileged = live.role === "analityk" || live.role === "admin";
				const status = await scans.status(ref, privileged);
				if (!privileged) return { state: status.state };
				return {
					...status,
					canRequest:
						status.state === "failed" ||
						status.state === "stale" ||
						(status.state === "unscanned" && legacyScansAvailable()),
				};
			}),
		},
		{
			method: "post",
			paths: scanPath,
			handle: route(async (live, req) => {
				if (live.role !== "analityk" && live.role !== "admin")
					throw new DomainError("FORBIDDEN");
				const { ref, metadata } = await attachment(live, req);
				if (!legacyScansAvailable() && (await scans.status(ref)).state === "unscanned")
					throw new LegacyScanLocked();
				const existing = sha256.safeParse(metadata.contentHash);
				if (existing.success) return scans.request(ref, existing.data);
				const content = await readObject(ref.storageKey).catch(() => {
					throw new DomainError("SERVICE_UNAVAILABLE");
				});
				if (!content) throw new DomainError("NOT_FOUND");
				return scans.request(ref, createHash("sha256").update(content).digest("hex"));
			}),
		},
		{
			method: "get",
			paths: rulesPath,
			handle: route(async (live) => {
				if (live.role !== "admin") throw new DomainError("FORBIDDEN");
				return scans.rules(live.organizationId);
			}),
		},
		{
			method: "put",
			paths: rulesPath,
			handle: route(async (live, req) => {
				if (live.role !== "admin") throw new DomainError("FORBIDDEN");
				const set = ruleSet(custom.parse(req.body).rules);
				const valid = await scanner.validate(set.rules).catch(() => {
					throw new DomainError("SERVICE_UNAVAILABLE");
				});
				if (!valid) throw new InvalidYaraRules();
				return scans.activate(live.organizationId, set);
			}),
		},
		{
			method: "delete",
			paths: rulesPath,
			handle: route(async (live) => {
				if (live.role !== "admin") throw new DomainError("FORBIDDEN");
				return scans.activate(live.organizationId, baseRuleSet);
			}),
		},
	] as const satisfies readonly {
		method: "get" | "post" | "put" | "delete";
		paths: string[];
		handle(req: Request, res: Response): Promise<unknown>;
	}[];
}

class InvalidYaraRules extends Error {}
class LegacyScanLocked extends Error {}
