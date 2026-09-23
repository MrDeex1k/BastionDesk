import { DomainError } from "../contracts/errors";
import { makeCommand, withReceipt, recordFailure } from "./core-receipts";
import type { IncidentWrites } from "../core/incidents/commands";
import { IncidentRuleError } from "../core/incidents/commands";
import { getPgPool } from "../lib/database";
import type { Incident } from "../types";
import type { Command } from "../contracts/operations";
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
	async function audited<T>(
		command: Command,
		work: (client: PoolClient) => Promise<T>,
	): Promise<T> {
		try {
			return await transaction(work);
		} catch (error) {
			// The failed mutation is rolled back first. Denials must survive that rollback.
			try {
				await transaction((client) => recordFailure(client, command, error));
			} catch {
				console.error("[CORE] Could not persist failed-command audit");
			}
			throw error;
		}
	}
	return {
		async mutate(identity, id, change, mode, decide, request) {
			const command = makeCommand(
				identity,
				`${mode}_${change.type}`,
				id,
				change.type === "file"
					? {
							type: change.type,
							kind: change.kind,
							metadata: {
								contentHash: change.metadata.contentHash,
								originalName:
									change.metadata.originalName ?? change.metadata.filename,
								size: change.metadata.size,
								mimeType: change.metadata.mimeType,
							},
						}
					: change,
				request,
			);
			return audited(command, async (client) => {
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

				return withReceipt(
					client,
					command,
					async () => {
						const patch = decide(before);
						const entries = Object.entries(patch);
						const sets = entries.map(([key], i) => `"${key}" = $${i + 3}`);
						const incident = (
							await client.query<Incident>(
								`UPDATE incidents SET ${sets.join(", ")} WHERE id = $1 AND "organizationId" = $2 RETURNING *`,
								[id, identity.organizationId, ...entries.map(([, value]) => value)],
							)
						).rows[0]!;
						return {
							value: { before, incident },
							resourceId: id,
							changedFields: Object.keys(patch),
						};
					},
					() => {
						if (
							identity.role === "pracownik" ||
							(identity.role !== "admin" &&
								before.analystId !== identity.subject &&
								!(change.type === "unassign" && before.analystId === null))
						)
							throw new DomainError("FORBIDDEN");
					},
				);
			});
		},
		async create(identity, input, request) {
			const stableMetadata = (metadata: Record<string, unknown>) => ({
				originalName: metadata.originalName ?? null,
				size: metadata.size ?? null,
				mimeType: metadata.mimeType ?? null,
				contentHash: metadata.contentHash ?? null,
			});
			const command = makeCommand(
				identity,
				"create",
				identity.organizationId,
				{
					description: input.userDescription,
					screenshot: stableMetadata(input.userScreenshotMetadata),
					attachment: stableMetadata(input.userAttachmentMetadata),
				},
				request,
			);
			return audited(command, async (client) => {
				return withReceipt(
					client,
					command,
					async () => {
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
						return {
							value: result.rows[0]!,
							resourceId: input.id,
							changedFields: [
								"userDescription",
								"userScreenshotPath",
								"userAttachmentPath",
							],
						};
					},
					() => {},
				);
			});
		},
	};
}
export const coreIncidentWrites = createIncidentWrites();
