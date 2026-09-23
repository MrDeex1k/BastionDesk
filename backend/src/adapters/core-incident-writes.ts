import type { IncidentWrites } from "../core/incidents/commands";
import { IncidentRuleError } from "../core/incidents/commands";
import { getPgPool } from "../lib/database";
import type { Incident } from "../types";
import type { PoolClient } from "pg";

export async function withIncidentTransaction<T>(
	work: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const client = await getPgPool().connect();
	try {
		await client.query("BEGIN");
		await client.query("SET LOCAL lock_timeout = '5s'");
		await client.query("SET LOCAL statement_timeout = '10s'");
		const result = await work(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
export function createIncidentWrites(transaction = withIncidentTransaction): IncidentWrites {
	return {
		async mutate(identity, id, _change, _mode, decide) {
			return transaction(async (client) => {
				const before = (
					await client.query<Incident>(
						'SELECT * FROM incidents WHERE id = $1 AND "organizationId" = $2 FOR UPDATE',
						[id, identity.organizationId],
					)
				).rows[0];
				if (!before)
					throw new IncidentRuleError(
						"INCIDENT_NOT_FOUND",
						"Zgłoszenie nie zostało znalezione",
						"missing",
					);
				const patch = decide(before);
				const entries = Object.entries(patch);
				const sets = entries.map(([key], i) => `"${key}" = $${i + 3}`);
				const incident = (
					await client.query<Incident>(
						`UPDATE incidents SET ${sets.join(", ")} WHERE id = $1 AND "organizationId" = $2 RETURNING *`,
						[id, identity.organizationId, ...entries.map(([, value]) => value)],
					)
				).rows[0]!;
				return { before, incident };
			});
		},
		async create(identity, input) {
			return transaction(async (client) => {
				const result = await client.query<Incident>(
					`INSERT INTO incidents (id, "userId", "organizationId", "userDescription", "userScreenshotPath", "userScreenshotMetadata", "userAttachmentPath", "userAttachmentMetadata") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
					[
						input.id,
						identity.subject,
						identity.organizationId,
						input.userDescription,
						input.userScreenshotPath,
						JSON.stringify(input.userScreenshotMetadata),
						input.userAttachmentPath,
						JSON.stringify(input.userAttachmentMetadata),
					],
				);
				return result.rows[0]!;
			});
		},
	};
}
export const coreIncidentWrites = createIncidentWrites();
