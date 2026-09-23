import { traceParent } from "./telemetry";
import type { Pool, PoolClient } from "pg";
import type { Command } from "../contracts/operations";
import { createAuditEntry } from "../contracts/audit";
import { incidentCategorySchema } from "../contracts";
import { failureDecision, leaseSeconds, maxAttempts, topology } from "./contract";

export interface Job {
	id: string;
	organization_id: string;
	incident_id: string;
	correlation_id: string;
	causation_id: string;
	traceparent: string | null;
	attempts: number;
	lease_token: string;
	state: "pending" | "running" | "completed" | "dead";
}
export async function enqueueClassification(
	client: PoolClient,
	command: Command,
	incidentId: string,
	traceparent?: string,
) {
	await client.query(
		`INSERT INTO core_jobs
  (id, organization_id, incident_id, kind, correlation_id, causation_id, traceparent)
  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		[
			crypto.randomUUID(),
			command.context.organizationId,
			incidentId,
			topology.routingKey,
			command.context.correlationId,
			command.id,
			traceparent ?? traceParent() ?? null,
		],
	);
}
export function jobStore(pool: Pool) {
	async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query("SET LOCAL statement_timeout = '10s'");
			await client.query("SET LOCAL lock_timeout = '5s'");
			const value = await work(client);
			await client.query("COMMIT");
			return value;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
	return {
		async metrics() {
			return (
				await pool.query<{
					state: string;
					count: number;
					lag: number;
				}>(`SELECT state, count(*)::int AS count,
  greatest(0, extract(epoch FROM clock_timestamp()-min(created_at)))::float AS lag
  FROM core_jobs WHERE state IN ('pending','running','dead') GROUP BY state`)
			).rows;
		},
		async dispatchBatch() {
			return transaction(async (client) => {
				// Exhausted leases include worker crashes, so a poison job cannot retry forever.
				await client.query(
					`UPDATE core_jobs SET state='dead', lease_token=NULL, lease_until=NULL,
     last_error='LEASE_EXHAUSTED', publish_after=clock_timestamp()
     WHERE state='running' AND lease_until < clock_timestamp() AND attempts >= $1`,
					[maxAttempts],
				);
				return (
					await client.query<Pick<Job, "id" | "state" | "traceparent">>(`WITH due AS (
     SELECT id FROM core_jobs WHERE publish_after <= clock_timestamp()
     AND ((state='pending' AND available_at <= clock_timestamp()) OR
      (state='running' AND lease_until < clock_timestamp()) OR state='dead')
     ORDER BY publish_after LIMIT 20 FOR UPDATE SKIP LOCKED)
     UPDATE core_jobs j SET publish_after=clock_timestamp()+interval '30 seconds'
     FROM due WHERE j.id=due.id RETURNING j.id,j.state,j.traceparent`)
				).rows;
			});
		},
		async publishedDead(id: string) {
			await pool.query(
				"UPDATE core_jobs SET publish_after='infinity' WHERE id=$1 AND state='dead'",
				[id],
			);
		},
		async claim(id: string): Promise<Job | null> {
			return (
				(
					await pool.query<Job>(
						`UPDATE core_jobs SET state='running', attempts=attempts+1,
    lease_token=$2, lease_until=clock_timestamp()+make_interval(secs => $3)
    WHERE id=$1 AND attempts < $4 AND ((state='pending' AND available_at <= clock_timestamp())
     OR (state='running' AND lease_until < clock_timestamp())) RETURNING *`,
						[id, crypto.randomUUID(), leaseSeconds, maxAttempts],
					)
				).rows[0] ?? null
			);
		},
		async description(job: Job): Promise<string | null> {
			const row = (
				await pool.query<{ userDescription: string }>(
					'SELECT "userDescription" FROM incidents WHERE id=$1 AND "organizationId"=$2',
					[job.incident_id, job.organization_id],
				)
			).rows[0];
			return row?.userDescription ?? null;
		},
		async complete(job: Job, category: string): Promise<boolean> {
			incidentCategorySchema.parse(category);
			return transaction(async (client) => {
				const owned = await client.query(
					`SELECT id FROM core_jobs WHERE id=$1 AND state='running'
     AND lease_token=$2 AND lease_until > clock_timestamp() FOR UPDATE`,
					[job.id, job.lease_token],
				);
				if (!owned.rowCount) return false;
				const changed = await client.query(
					`UPDATE incidents SET "llmCategory"=$1 WHERE id=$2
     AND "organizationId"=$3 AND "llmCategory" IS NULL RETURNING id`,
					[category, job.incident_id, job.organization_id],
				);
				if (changed.rowCount) {
					const entry = createAuditEntry(
						{
							organizationId: job.organization_id,
							actor: { kind: "service", id: "classifier" },
							correlationId: job.correlation_id,
							causationId: job.causation_id,
						},
						job.organization_id,
						{
							id: crypto.randomUUID(),
							commandId: job.id,
							source: "classifier",
							action: "incident.classify.v1",
							resource: { type: "incident", id: job.incident_id },
							occurredAt: new Date().toISOString(),
							outcome: "succeeded",
							reasonCode: "SYSTEM_RULE",
							changedFields: ["llmCategory"],
							provenance: [],
						},
					);
					await client.query(
						"INSERT INTO core_audit (id,organization_id,command_id,entry) VALUES ($1,$2,$3,$4)",
						[entry.id, job.organization_id, job.id, JSON.stringify(entry)],
					);
				}
				await client.query(
					`UPDATE core_jobs SET state='completed', completed_at=clock_timestamp(),
     lease_token=NULL, lease_until=NULL, last_error=NULL WHERE id=$1`,
					[job.id],
				);
				return true;
			});
		},
		async fail(job: Job, code: string, retryable: boolean) {
			if (!/^[A-Z_]{1,64}$/.test(code)) throw new Error("INVALID_FAILURE_CODE");
			const decision = failureDecision(job.attempts, retryable);
			await pool.query(
				`UPDATE core_jobs SET state=$3, last_error=$4, lease_token=NULL, lease_until=NULL,
    available_at=clock_timestamp()+make_interval(secs => $5),
    publish_after=clock_timestamp()+make_interval(secs => $5)
    WHERE id=$1 AND lease_token=$2 AND state='running'`,
				[job.id, job.lease_token, decision.state, code, decision.delaySeconds],
			);
		},

		async replay(id: string, organizationId: string, operator = "operator") {
			return transaction(async (client) => {
				const result = await client.query<Job>(
					`UPDATE core_jobs SET state='pending', attempts=0, last_error=NULL,
     available_at=clock_timestamp(), publish_after=clock_timestamp()
     WHERE id=$1 AND organization_id=$2 AND state='dead' RETURNING *`,
					[id, organizationId],
				);
				const job = result.rows[0];
				if (!job) return false;
				const commandId = crypto.randomUUID();
				const entry = createAuditEntry(
					{
						organizationId,
						actor: { kind: "service", id: operator },
						correlationId: job.correlation_id,
						causationId: job.id,
					},
					organizationId,
					{
						id: crypto.randomUUID(),
						commandId,
						source: "job-operator",
						action: "job.replay.v1",
						resource: { type: "job", id },
						occurredAt: new Date().toISOString(),
						outcome: "succeeded",
						reasonCode: "SYSTEM_RULE",
						changedFields: ["state", "attempts"],
						provenance: [],
					},
				);
				await client.query(
					"INSERT INTO core_audit (id,organization_id,command_id,entry) VALUES ($1,$2,$3,$4)",
					[entry.id, organizationId, commandId, JSON.stringify(entry)],
				);
				return true;
			});
		},
	};
}
export type JobStore = ReturnType<typeof jobStore>;
