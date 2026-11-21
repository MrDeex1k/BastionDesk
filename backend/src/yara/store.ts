import type { Pool, PoolClient } from "pg";
import { failureDecision, leaseSeconds, maxAttempts } from "../messaging/contract";
import { baseRuleSet } from "./rules";

export type Attachment = {
	organizationId: string;
	incidentId: string;
	storageKey: string;
};
export type ScanState =
	"pending" | "running" | "clean" | "matched" | "failed" | "stale" | "unscanned";
type ScanDetails = {
	sha256: string;
	ruleVersion: string;
	matches: string[];
	scannedAt: Date | null;
};
export type ScanStatus = {
	state: ScanState;
	latest?: ScanDetails;
	history?: ScanDetails[];
};
type Job = {
	id: string;
	organization_id: string;
	content_hash: string;
	rule_version: string;
	state: "pending" | "running" | "completed" | "dead";
	attempts: number;
	lease_token: string;
	matches: string[] | null;
	completed_at: Date | null;
};
type Db = Pick<Pool, "query">;
export type Transaction = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;

export async function lockRules(client: PoolClient, org: string) {
	await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 71843))", [org]);
}

export async function activeVersion(db: Db, org: string) {
	const result = await db.query<{ version: string }>(
		"SELECT version FROM yara_active_rule_sets WHERE organization_id=$1",
		[org],
	);
	return result.rows[0]?.version ?? baseRuleSet.version;
}

async function saveRules(client: PoolClient, org: string, version: string, rules: string) {
	await client.query(
		"INSERT INTO yara_rule_sets (organization_id, version, rules) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
		[org, version, rules],
	);
}

export async function enqueueScan(
	client: PoolClient,
	attachment: Attachment,
	sha256: string,
	retry = false,
) {
	const { organizationId, incidentId, storageKey } = attachment;
	await lockRules(client, organizationId);
	const version = await activeVersion(client, organizationId);
	if (version === baseRuleSet.version)
		await saveRules(client, organizationId, version, baseRuleSet.rules);
	const proposedId = crypto.randomUUID();
	const { rows } = await client.query<{ id: string }>(
		`INSERT INTO yara_scan_jobs AS current_job (id, organization_id, content_hash, rule_version)
		 VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, content_hash, rule_version)
		 DO UPDATE SET
		   state = CASE WHEN $5 AND current_job.state='dead' THEN 'pending' ELSE current_job.state END,
		   attempts = CASE WHEN $5 AND current_job.state='dead' THEN 0 ELSE current_job.attempts END,
		   available_at = CASE WHEN $5 AND current_job.state='dead' THEN clock_timestamp() ELSE current_job.available_at END,
		   publish_after = CASE WHEN $5 AND current_job.state='dead' THEN clock_timestamp() ELSE current_job.publish_after END,
       publication_token = CASE WHEN $5 AND current_job.state='dead' THEN NULL ELSE current_job.publication_token END
		 RETURNING id`,
		[proposedId, organizationId, sha256, version, retry],
	);
	await client.query(
		`INSERT INTO yara_attachments (organization_id,incident_id,storage_key,job_id) VALUES ($1,$2,$3,$4)
		 ON CONFLICT (organization_id,incident_id,storage_key) DO UPDATE SET job_id=excluded.job_id`,
		[organizationId, incidentId, storageKey, rows[0]!.id],
	);
	await client.query(
		`INSERT INTO yara_attachment_history (organization_id,incident_id,storage_key,job_id)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
		[organizationId, incidentId, storageKey, rows[0]!.id],
	);
}

async function attachmentJob(db: Db, { organizationId, incidentId, storageKey }: Attachment) {
	const result = await db.query<Job & { active_version: string }>(
		`SELECT j.*, COALESCE(s.version,$4) AS active_version FROM yara_attachments a
		 JOIN yara_scan_jobs j ON j.organization_id=a.organization_id AND j.id=a.job_id
		 LEFT JOIN yara_active_rule_sets s ON s.organization_id=a.organization_id
		 WHERE a.organization_id=$1 AND a.incident_id=$2 AND a.storage_key=$3`,
		[organizationId, incidentId, storageKey, baseRuleSet.version],
	);
	return result.rows[0];
}

function status(job: Awaited<ReturnType<typeof attachmentJob>>): ScanStatus {
	if (!job) return { state: "unscanned" };
	const latest = {
		sha256: job.content_hash,
		ruleVersion: job.rule_version,
		matches: job.matches ?? [],
		scannedAt: job.completed_at,
	};
	if (job.rule_version !== job.active_version) return { state: "stale", latest };
	if (job.state === "completed")
		return { state: latest.matches.length ? "matched" : "clean", latest };
	return { state: job.state === "dead" ? "failed" : job.state, latest };
}

export function attachmentScans(db: Db, transaction: Transaction) {
	return {
		async status(attachment: Attachment, includeHistory = false): Promise<ScanStatus> {
			if (!includeHistory) return status(await attachmentJob(db, attachment));
			return transaction(async (client) => {
				await lockRules(client, attachment.organizationId);
				const job = await attachmentJob(client, attachment);
				const current = status(job);
				if (!job) return current;
				const { rows } = await client.query<ScanDetails>(
					`SELECT j.content_hash AS "sha256", j.rule_version AS "ruleVersion", j.matches,
                  j.completed_at AS "scannedAt" FROM yara_attachment_history h
           JOIN yara_scan_jobs j ON j.organization_id=h.organization_id AND j.id=h.job_id
           WHERE h.organization_id=$1 AND h.incident_id=$2 AND h.storage_key=$3
             AND h.job_id<>$4 AND j.state='completed' ORDER BY j.completed_at DESC, j.id`,
					[
						attachment.organizationId,
						attachment.incidentId,
						attachment.storageKey,
						job.id,
					],
				);
				return { ...current, history: rows };
			});
		},
		async request(attachment: Attachment, sha256: string) {
			return transaction(async (client) => {
				await enqueueScan(client, attachment, sha256, true);
				return status(await attachmentJob(client, attachment));
			});
		},
		async download(attachment: Attachment, refresh: boolean) {
			return transaction(async (client) => {
				await lockRules(client, attachment.organizationId);
				let job = await attachmentJob(client, attachment);
				if (refresh && job && job.rule_version !== job.active_version) {
					await enqueueScan(client, attachment, job.content_hash);
					job = await attachmentJob(client, attachment);
				}
				return status(job).state;
			});
		},
		async rules(org: string) {
			const version = await activeVersion(db, org);
			return { version, custom: version !== baseRuleSet.version };
		},
		async activate(org: string, set: typeof baseRuleSet) {
			await transaction(async (client) => {
				await lockRules(client, org);
				if (set.version === baseRuleSet.version) {
					await client.query(
						"DELETE FROM yara_active_rule_sets WHERE organization_id=$1",
						[org],
					);
					return;
				}
				await saveRules(client, org, set.version, set.rules);
				await client.query(
					`INSERT INTO yara_active_rule_sets (organization_id,version) VALUES ($1,$2)
					 ON CONFLICT (organization_id) DO UPDATE SET version=excluded.version`,
					[org, set.version],
				);
			});
			return {
				version: set.version,
				custom: set.version !== baseRuleSet.version,
			};
		},
	};
}
export type AttachmentScans = ReturnType<typeof attachmentScans>;

export function scanWorkerStore(db: Db) {
	return {
		async dispatch() {
			await db.query(
				`UPDATE yara_scan_jobs SET state='dead', lease_token=NULL, lease_until=NULL, publication_token=NULL, publish_after=clock_timestamp()
				 WHERE state='running' AND lease_until < clock_timestamp() AND attempts >= $1`,
				[maxAttempts],
			);
			return (
				await db.query<
					Pick<Job, "id" | "state"> & { publication_token: string }
				>(`WITH due AS (
			 SELECT id FROM yara_scan_jobs WHERE publish_after <= clock_timestamp()
			 AND ((state='pending' AND available_at <= clock_timestamp()) OR
			      (state='running' AND lease_until < clock_timestamp()) OR state='dead')
			 ORDER BY publish_after LIMIT 20 FOR UPDATE SKIP LOCKED)
			 UPDATE yara_scan_jobs j SET publish_after=clock_timestamp()+interval '30 seconds', publication_token=gen_random_uuid()
			 FROM due WHERE j.id=due.id RETURNING j.id,j.state,j.publication_token`)
			).rows;
		},
		async published(id: string, token: string) {
			await db.query(
				"UPDATE yara_scan_jobs SET publish_after='infinity', publication_token=NULL WHERE id=$1 AND publication_token=$2",
				[id, token],
			);
		},
		async claim(id: string) {
			return (
				await db.query<Job>(
					`UPDATE yara_scan_jobs SET state='running', attempts=attempts+1,
			 lease_token=$2, lease_until=clock_timestamp()+make_interval(secs=>$3),
       publish_after=clock_timestamp()+make_interval(secs=>$3), publication_token=NULL
			 WHERE id=$1 AND attempts < $4 AND ((state='pending' AND available_at<=clock_timestamp()) OR
			 (state='running' AND lease_until<clock_timestamp())) RETURNING *`,
					[id, crypto.randomUUID(), leaseSeconds, maxAttempts],
				)
			).rows[0];
		},
		async input(job: Job) {
			const rules = (
				await db.query<{ rules: string }>(
					"SELECT rules FROM yara_rule_sets WHERE organization_id=$1 AND version=$2",
					[job.organization_id, job.rule_version],
				)
			).rows[0]!.rules;
			const sources = (
				await db.query<{ storage_key: string }>(
					`SELECT a.storage_key FROM yara_attachments a JOIN yara_scan_jobs j
				 ON j.organization_id=a.organization_id AND j.id=a.job_id
				 WHERE a.organization_id=$1 AND j.content_hash=$2
				 ORDER BY (a.job_id=$3) DESC, a.storage_key LIMIT 20`,
					[job.organization_id, job.content_hash, job.id],
				)
			).rows;
			return { rules, sources };
		},
		async complete(job: Job, matches: string[]) {
			await db.query(
				`UPDATE yara_scan_jobs SET state='completed', completed_at=clock_timestamp(), matches=$3,
			 lease_token=NULL, lease_until=NULL WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()`,
				[job.id, job.lease_token, matches],
			);
		},
		async fail(job: Job, retryable: boolean) {
			const decision = failureDecision(job.attempts, retryable);
			await db.query(
				`UPDATE yara_scan_jobs SET state=$3, lease_token=NULL, lease_until=NULL,
			 available_at=clock_timestamp()+make_interval(secs=>$4), publish_after=clock_timestamp()+make_interval(secs=>$4)
			 WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()`,
				[job.id, job.lease_token, decision.state, decision.delaySeconds],
			);
		},
	};
}
