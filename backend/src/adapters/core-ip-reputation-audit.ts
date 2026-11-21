import type { Pool } from "pg";
import { createAuditEntry } from "../contracts/audit";
import type { ReputationResult } from "../core/ioc/enrichment";
import type { LiveIdentity } from "../identity/contract";

export function ipReputationAudit(db: Pick<Pool, "query">) {
	return async (
		identity: LiveIdentity,
		incidentId: string,
		status: ReputationResult["status"],
	) => {
		const id = crypto.randomUUID();
		const outcome =
			status === "ready"
				? "succeeded"
				: status === "not_public" || status === "not_configured"
					? "denied"
					: "failed";
		const reasonCode =
			outcome === "succeeded"
				? "USER_REQUEST"
				: outcome === "denied"
					? "POLICY_DENIED"
					: "DEPENDENCY_FAILURE";
		const entry = createAuditEntry(
			{
				organizationId: identity.organizationId,
				actor: { kind: "user", id: identity.subject },
				correlationId: id,
				causationId: null,
			},
			identity.organizationId,
			{
				id,
				commandId: id,
				source: "abuseipdb",
				action: "incidents.ip_reputation.v1",
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
