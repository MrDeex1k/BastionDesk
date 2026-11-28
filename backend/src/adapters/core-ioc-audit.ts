import type { Pool } from "pg";
import { createAuditEntry } from "../contracts/audit";
import type { ReputationResult } from "../core/ioc/enrichment";
import type { LookupProvider, LookupResult } from "../core/ioc/provider-lookups";
import type { LiveIdentity } from "../identity/contract";
import type { UrlhausLookup } from "./urlhaus";

export function iocLookupAudit(
	db: Pick<Pool, "query">,
	provider: "abuseipdb" | "urlhaus" | LookupProvider,
) {
	const action = `incidents.${provider === "abuseipdb" ? "ip_reputation" : provider}.v1`;
	return async (
		identity: Pick<LiveIdentity, "organizationId" | "subject"> & { automatic?: boolean },
		incidentId: string,
		status: ReputationResult["status"] | UrlhausLookup["status"] | LookupResult["status"],
	) => {
		const id = crypto.randomUUID();
		const outcome =
			status === "ready" || status === "matched" || status === "not_found"
				? "succeeded"
				: status === "not_public" || status === "not_configured" || status === "unsupported"
					? "denied"
					: "failed";
		const reasonCode =
			outcome === "succeeded"
				? identity.automatic
					? "SYSTEM_RULE"
					: "USER_REQUEST"
				: outcome === "denied"
					? "POLICY_DENIED"
					: "DEPENDENCY_FAILURE";
		const entry = createAuditEntry(
			{
				organizationId: identity.organizationId,
				actor: { kind: identity.automatic ? "service" : "user", id: identity.subject },
				correlationId: id,
				causationId: null,
			},
			identity.organizationId,
			{
				id,
				commandId: id,
				source: provider,
				action,
				resource: { type: "incident", id: incidentId },
				occurredAt: new Date().toISOString(),
				outcome,
				reasonCode,
				changedFields: [],
				provenance: [],
			},
		);
		await db.query(
			"INSERT INTO core_audit (id,organization_id,command_id,entry) VALUES ($1,$2,$3,$4)",
			[entry.id, entry.organizationId, entry.commandId, JSON.stringify(entry)],
		);
	};
}
