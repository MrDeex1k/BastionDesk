import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
	enrichmentCooldown,
	type EnrichmentCheck,
	type EnrichmentResult,
	type EnrichmentTarget,
} from "../core/ioc/automatic";

export async function enqueueEnrichment(
	client: Pick<PoolClient, "query">,
	organizationId: string,
	incidentId: string,
	targets: readonly EnrichmentTarget[],
	subject?: string,
) {
	if (!targets.length) return;
	const rows = targets.map(({ provider, kind, value }) => ({
		id: crypto.randomUUID(),
		provider,
		kind,
		value,
		digest: createHash("sha256").update(value).digest("hex"),
	}));
	await client.query(
		`WITH jobs AS (
		 INSERT INTO ioc_enrichment_jobs AS j (id, organization_id, provider, indicator_kind, indicator_digest, indicator_value, requested_by, trigger_incident_id)
		 SELECT id, $1, provider, kind, digest, value, $4, $2
		 FROM jsonb_to_recordset($3::jsonb) AS t(id uuid, provider text, kind text, digest text, value text)
		 ORDER BY provider, kind, digest
		 ON CONFLICT (organization_id, provider, indicator_kind, indicator_digest) DO UPDATE
		 SET result = CASE WHEN j.retry_at <= statement_timestamp() THEN NULL ELSE j.result END,
		     available_at = CASE WHEN j.retry_at <= statement_timestamp() THEN statement_timestamp() ELSE j.available_at END,
		     queued_at = CASE WHEN j.retry_at <= statement_timestamp() THEN statement_timestamp() ELSE j.queued_at END,
		     requested_by = CASE WHEN j.retry_at <= statement_timestamp() THEN EXCLUDED.requested_by ELSE j.requested_by END,
		     trigger_incident_id = CASE WHEN j.retry_at <= statement_timestamp() THEN EXCLUDED.trigger_incident_id ELSE j.trigger_incident_id END,
		     retry_at = CASE WHEN j.retry_at <= statement_timestamp() THEN NULL ELSE j.retry_at END
		 RETURNING id
		)
		INSERT INTO incident_ioc_enrichment (organization_id, incident_id, job_id)
		SELECT $1, $2, id FROM jobs ON CONFLICT DO NOTHING`,
		[organizationId, incidentId, JSON.stringify(rows), subject ?? null],
	);
}

type Job = EnrichmentTarget & {
	id: string;
	organizationId: string;
	lease: string;
	queuedAt: Date;
	requestedBy: string | null;
};
type Transaction = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;

export function enrichmentStore(db: Pick<Pool, "query">, transaction: Transaction) {
	return {
		async forIncident(org: string, incidentId: string) {
			return (
				await db.query<EnrichmentCheck>(
					`SELECT j.provider, j.indicator_kind AS kind, j.indicator_value AS value, j.result, j.retry_at AS "retryAt"
				 FROM incident_ioc_enrichment i JOIN ioc_enrichment_jobs j
				 ON j.organization_id = i.organization_id AND j.id = i.job_id
				 WHERE i.organization_id=$1 AND i.incident_id=$2`,
					[org, incidentId],
				)
			).rows;
		},
		async enqueue(org: string, incidentId: string, target: EnrichmentTarget, subject: string) {
			await enqueueEnrichment(db, org, incidentId, [target], subject);
		},
		async claim() {
			return (
				await db.query<Job>(
					`WITH due AS (
				 SELECT j.id FROM ioc_enrichment_jobs j WHERE j.result IS NULL AND j.available_at <= clock_timestamp()
				 AND EXISTS (SELECT 1 FROM incident_ioc_enrichment i WHERE i.job_id=j.id)
				 ORDER BY available_at, id LIMIT 12 FOR UPDATE SKIP LOCKED
				)
				UPDATE ioc_enrichment_jobs j SET lease_token=$1, available_at=clock_timestamp()+interval '90 seconds'
				FROM due WHERE j.id=due.id
				RETURNING j.id, j.organization_id AS "organizationId", j.provider,
				 j.indicator_kind AS kind, j.indicator_value AS value, j.lease_token AS lease, j.queued_at AS "queuedAt",
				 j.requested_by AS "requestedBy"`,
					[crypto.randomUUID()],
				)
			).rows;
		},
		async defer(job: Job, seconds: number) {
			await db.query(
				`UPDATE ioc_enrichment_jobs SET lease_token=NULL, available_at=clock_timestamp()+make_interval(secs => $3)
				 WHERE id=$1 AND lease_token=$2`,
				[job.id, job.lease, seconds],
			);
		},
		async finish(
			job: Job,
			result: EnrichmentResult,
			audit: (client: PoolClient, incidentId: string) => Promise<void>,
		) {
			await transaction(async (client) => {
				const saved = await client.query(
					`UPDATE ioc_enrichment_jobs SET lease_token=NULL, result=$3, retry_at=clock_timestamp()+make_interval(secs => $4)
					 WHERE id=$1 AND lease_token=$2`,
					[job.id, job.lease, JSON.stringify(result), enrichmentCooldown(job, result)],
				);
				if (!saved.rowCount) return;
				const incidents = await client.query<{ incident_id: string }>(
					`SELECT i.incident_id FROM incident_ioc_enrichment i JOIN ioc_enrichment_jobs j ON j.id=i.job_id
					 WHERE i.organization_id=$1 AND i.job_id=$2
					 AND (j.requested_by IS NULL OR i.incident_id=j.trigger_incident_id)
					 ORDER BY (i.incident_id=j.trigger_incident_id) DESC, i.incident_id LIMIT 1`,
					[job.organizationId, job.id],
				);
				const incident = incidents.rows[0];
				if (incident) await audit(client, incident.incident_id);
			});
		},
	};
}

export type EnrichmentStore = ReturnType<typeof enrichmentStore>;
