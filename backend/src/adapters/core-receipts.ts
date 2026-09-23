import { DomainError } from "../contracts/errors";
import { IncidentRuleError } from "../core/incidents/commands";
import type { PoolClient } from "pg";
import {
	commandFingerprint,
	decideIdempotency,
	receiptScope,
	type Command,
} from "../contracts/operations";
import { createAuditEntry } from "../contracts/audit";
import type { LiveIdentity } from "../identity/contract";
import type { OperationRequest } from "../core/incidents/commands";

export function makeCommand(
	identity: LiveIdentity,
	action: string,
	resourceId: string,
	payload: unknown,
	request?: OperationRequest,
): Command {
	return {
		schemaVersion: 1,
		id: request?.commandId ?? crypto.randomUUID(),
		operation: `incidents.${action}.v1`,
		context: {
			organizationId: identity.organizationId,
			actor: { kind: "user", id: identity.subject },
			correlationId: request?.correlationId ?? crypto.randomUUID(),
			causationId: null,
		},
		idempotencyKey: request?.idempotencyKey ?? crypto.randomUUID(),
		target: { type: action === "create" ? "incident_collection" : "incident", id: resourceId },
		payload: JSON.parse(JSON.stringify(payload)),
	};
}
export async function withReceipt<T>(
	client: PoolClient,
	command: Command,
	work: () => Promise<{ value: T; resourceId: string; changedFields: string[] }>,
	authorizeReplay: (value: T) => void,
): Promise<T> {
	const scope = receiptScope(command);
	const params = [scope.organizationId, scope.actor.id, scope.operation, scope.idempotencyKey];
	// Transaction-scoped lock serializes claims, including absent rows and retries.
	await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
		JSON.stringify(params),
	]);
	const saved = (
		await client.query(
			"SELECT fingerprint, result FROM core_command_receipts WHERE organization_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4",
			params,
		)
	).rows[0];
	const decision = decideIdempotency(
		command,
		saved
			? { scope, fingerprint: saved.fingerprint, state: "completed", result: saved.result }
			: null,
	);
	if (decision.kind === "replay") {
		const value = decision.result as T;
		authorizeReplay(value);
		return value;
	}
	const result = await work();
	const entry = createAuditEntry(command.context, command.context.organizationId, {
		id: crypto.randomUUID(),
		commandId: command.id,
		source: "core",
		action: command.operation,
		resource: { type: "incident", id: result.resourceId },
		occurredAt: new Date().toISOString(),
		outcome: "succeeded",
		reasonCode: "USER_REQUEST",
		changedFields: result.changedFields,
		provenance: [],
	});
	await client.query(
		"INSERT INTO core_audit (id,organization_id,command_id,entry) VALUES ($1,$2,$3,$4)",
		[entry.id, entry.organizationId, entry.commandId, JSON.stringify(entry)],
	);
	await client.query(
		"INSERT INTO core_command_receipts (organization_id,actor_id,operation,idempotency_key,fingerprint,result) VALUES ($1,$2,$3,$4,$5,$6)",
		[...params, commandFingerprint(command), JSON.stringify(result.value)],
	);
	return result.value;
}

export async function recordFailure(
	client: PoolClient,
	command: Command,
	error: unknown,
): Promise<void> {
	const denied =
		error instanceof IncidentRuleError ||
		(error instanceof DomainError &&
			error.code !== "INTERNAL_ERROR" &&
			error.code !== "SERVICE_UNAVAILABLE");
	const entry = createAuditEntry(command.context, command.context.organizationId, {
		id: crypto.randomUUID(),
		commandId: command.id,
		source: "core",
		action: command.operation,
		resource: command.target,
		occurredAt: new Date().toISOString(),
		outcome: denied ? "denied" : "failed",
		reasonCode: denied ? "POLICY_DENIED" : "INTERNAL_FAILURE",
		changedFields: [],
		provenance: [],
	});
	await client.query(
		"INSERT INTO core_audit (id,organization_id,command_id,entry) VALUES ($1,$2,$3,$4)",
		[entry.id, entry.organizationId, entry.commandId, JSON.stringify(entry)],
	);
}
