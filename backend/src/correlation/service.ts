import type { Pool, PoolClient, QueryResult } from "pg";
import { incidentIndicators } from "../core/ioc/evidence";
import type { wazuhService } from "../wazuh/service";
import {
	configuredWindowMs,
	isAttachmentHash,
	matchReport,
	timeWindow,
	type CorrelationAlert,
} from "./rules";

export type { CorrelationAlert } from "./rules";
type Target = { reportId: string } | { caseId: string };
type Db = Pick<PoolClient, "query">;
type Wazuh = Pick<ReturnType<typeof wazuhService>, "correlationCandidates">;
export type CorrelationSuggestion = {
	id: string;
	status: "pending" | "accepted" | "rejected" | "expired";
	reportId: string;
	caseId: string | null;
	alert: CorrelationAlert;
	confidence: number;
	signals: string[];
	version: string;
};
type Match = Pick<
	CorrelationSuggestion,
	"reportId" | "alert" | "confidence" | "signals" | "version"
>;
type Job = {
	organization_id: string;
	target_kind: "case" | "report";
	target_id: string;
	lease_token: string;
};
type Report = {
	id: string;
	createdAt: Date;
	sourceId: string | null;
	agentId: string | null;
	userDescription: string;
	userAttachmentMetadata: unknown;
};

export async function enqueueCorrelation(db: Db, org: string, target: Target, force = false) {
	const report = "reportId" in target;
	await db.query(
		`INSERT INTO soc_correlation_jobs (organization_id,target_kind,target_id,available_at)
		 SELECT $1,$2,id,now() FROM ${report ? 'incidents WHERE "organizationId"' : "soc_incidents WHERE organization_id"}=$1 AND id=$3
		 ON CONFLICT (organization_id,target_kind,target_id) DO UPDATE
		 SET available_at=now(),lease_token=NULL,attempts=0,failed=false WHERE $4`,
		[org, report ? "report" : "case", report ? target.reportId : target.caseId, force],
	);
}

const evidenceJoins = `LEFT JOIN soc_evidence r ON r.organization_id=s.organization_id AND r.report_id=s.report_id AND r.incident_id IS NOT NULL
 LEFT JOIN soc_evidence a ON a.organization_id=s.organization_id AND a.source_id=s.source_id AND a.incident_id IS NOT NULL
 AND a.index_name=s.index_name AND a.document_id=s.document_id`;
const columns = `s.id,s.report_id AS "reportId",COALESCE(a.incident_id,r.incident_id) AS "caseId",
 s.alert,s.confidence,s.signals,s.version,s.status`;

export async function listSuggestions(db: Db, org: string, target: Target) {
	const report = "reportId" in target;
	return (
		await db.query<CorrelationSuggestion>(
			`SELECT ${columns} FROM soc_suggestions s ${evidenceJoins} WHERE s.organization_id=$1
		 AND s.status <> 'expired'
		 AND (s.status <> 'pending' OR a.incident_id IS NOT NULL OR EXISTS (
		   SELECT 1 FROM wazuh_sources w WHERE w.organization_id=s.organization_id AND w.source_id::text=s.source_id AND w.enabled))
		 AND
		 ${report ? "s.report_id=$2" : "(r.incident_id=$2 OR a.incident_id=$2)"} ORDER BY s.created_at DESC,s.id`,
			[org, report ? target.reportId : target.caseId],
		)
	).rows;
}

export async function getSuggestion(db: Db, org: string, id: string) {
	return (
		await db.query<CorrelationSuggestion>(
			`SELECT ${columns} FROM soc_suggestions s ${evidenceJoins}
		 WHERE s.organization_id=$1 AND s.id=$2 FOR UPDATE OF s`,
			[org, id],
		)
	).rows[0];
}

export async function currentSuggestionMatch(
	db: Db,
	org: string,
	suggestion: CorrelationSuggestion,
) {
	const report = await readReportSignals(db, org, suggestion.reportId);
	return (
		report &&
		matchReport(
			{ ...report, indicators: incidentIndicators(report) },
			suggestion.alert,
			configuredWindowMs(),
		)
	);
}

export async function decideSuggestion(
	db: Db,
	org: string,
	id: string,
	decision: "accepted" | "rejected",
) {
	return (
		(
			await db.query<CorrelationSuggestion>(
				`WITH changed AS (UPDATE soc_suggestions SET status=$3 WHERE organization_id=$1 AND id=$2 RETURNING *)
		 SELECT ${columns} FROM changed s ${evidenceJoins}`,
				[org, id, decision],
			)
		).rows[0] ?? null
	);
}

const reportSelect = `SELECT i.id,i."createdAt" AT TIME ZONE 'UTC' AS "createdAt",i."userDescription",i."userAttachmentMetadata",
 a.source_id AS "sourceId",a.agent_id AS "agentId" FROM incidents i
 LEFT JOIN soc_report_assets a ON i."organizationId"=a.organization_id AND a.report_id=i.id
 WHERE i."organizationId"=$1`;

async function readReportSignals(db: Db, org: string, reportId: string) {
	return (await db.query<Report>(reportSelect + " AND i.id=$2", [org, reportId])).rows[0];
}

async function reportMatches(db: Db, job: Job, wazuh: Wazuh, windowMs: number) {
	const report = await readReportSignals(db, job.organization_id, job.target_id);
	if (!report) return [];
	const indicators = incidentIndicators(report);
	const sha256s = indicators.filter(isAttachmentHash).map((i) => i.value);
	if (!report.agentId && !sha256s.length) return [];
	const alerts = await wazuh.correlationCandidates(
		job.organization_id,
		report.sourceId,
		{
			...timeWindow(report.createdAt, windowMs),
			agentId: report.agentId ?? undefined,
			sha256s,
		},
		AbortSignal.timeout(12_000),
	);
	const matches: Match[] = [];
	for (const alert of alerts) {
		const match = matchReport({ ...report, indicators }, alert, windowMs);
		if (match) matches.push({ ...match, reportId: report.id, alert });
	}
	return matches;
}

async function caseMatches(db: Db, job: Job, windowMs: number) {
	const matches: Match[] = [];
	const evidence = await db.query<{ snapshot: CorrelationAlert }>(
		`SELECT snapshot FROM soc_evidence WHERE organization_id=$1 AND incident_id=$2 AND document_id IS NOT NULL`,
		[job.organization_id, job.target_id],
	);
	for (const { snapshot: alert } of evidence.rows) {
		const range = timeWindow(new Date(alert.timestamp), windowMs);
		let after: string | null = null;
		for (;;) {
			const result: QueryResult<Report> = await db.query<Report>(
				reportSelect +
					` AND i."createdAt" BETWEEN ($2::timestamptz AT TIME ZONE 'UTC') AND ($3::timestamptz AT TIME ZONE 'UTC')
				 AND ($4::uuid IS NULL OR i.id>$4)
				 AND i.id IN (
				   SELECT report_id FROM soc_report_assets WHERE organization_id=$1 AND source_id=$5 AND agent_id=$6
				   UNION
				   SELECT id FROM incidents WHERE "organizationId"=$1
				     AND soc_attachment_sha256s("userAttachmentMetadata") && $7::text[]
				 )
				 ORDER BY i.id LIMIT 100`,
				[
					job.organization_id,
					range.from,
					range.to,
					after,
					alert.sourceId,
					alert.agentId,
					alert.sha256s,
				],
			);
			for (const report of result.rows) {
				const match = matchReport(
					{ ...report, indicators: incidentIndicators(report) },
					alert,
					windowMs,
				);
				if (match) matches.push({ ...match, reportId: report.id, alert });
			}
			if (result.rows.length < 100) break;
			after = result.rows[99]!.id;
		}
	}
	return matches;
}

export async function runCorrelationJob(pool: Pool, wazuh: Wazuh, windowMs = configuredWindowMs()) {
	const job = (
		await pool.query<Job>(
			`WITH due AS (SELECT organization_id,target_kind,target_id FROM soc_correlation_jobs
		 WHERE available_at <= statement_timestamp() ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED)
		 UPDATE soc_correlation_jobs j SET lease_token=gen_random_uuid(),available_at=clock_timestamp()+interval '2 minutes'
		 FROM due WHERE (j.organization_id,j.target_kind,j.target_id)=(due.organization_id,due.target_kind,due.target_id)
		 RETURNING j.*`,
		)
	).rows[0];
	if (!job) return false;
	const identity = [job.organization_id, job.target_kind, job.target_id, job.lease_token];
	const fence = "organization_id=$1 AND target_kind=$2 AND target_id=$3 AND lease_token=$4";
	try {
		const matches =
			job.target_kind === "case"
				? await caseMatches(pool, job, windowMs)
				: await reportMatches(pool, job, wazuh, windowMs);
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 8007))", [
				job.organization_id,
			]);
			const finish = await client.query(
				`UPDATE soc_correlation_jobs SET available_at=NULL,lease_token=NULL WHERE ${fence}`,
				identity,
			);
			if (finish.rowCount) {
				await client.query(
					`INSERT INTO soc_suggestions AS s (organization_id,report_id,source_id,index_name,document_id,alert,confidence,signals,version)
					 SELECT $1,r."reportId",r.alert->>'sourceId',r.alert->>'indexName',r.alert->>'documentId',r.alert,r.confidence,r.signals,r.version
					 FROM jsonb_to_recordset($2::jsonb) AS r("reportId" uuid,alert jsonb,confidence int,signals jsonb,version text)
					 JOIN incidents i ON i."organizationId"=$1 AND i.id=r."reportId"
					 WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.signals) AS signal WHERE signal LIKE 'asset:%')
					    OR EXISTS (SELECT 1 FROM soc_report_assets a WHERE a.organization_id=$1 AND a.report_id=r."reportId"
					                AND a.source_id=r.alert->>'sourceId' AND a.agent_id=r.alert->>'agentId')
					 ORDER BY r."reportId",r.alert->>'sourceId',r.alert->>'indexName',r.alert->>'documentId'
					 ON CONFLICT (organization_id,report_id,source_id,index_name,document_id) DO UPDATE
					 SET alert=excluded.alert,confidence=excluded.confidence,signals=excluded.signals,version=excluded.version,status='pending'
					 WHERE s.status IN ('pending','expired')`,
					[job.organization_id, JSON.stringify(matches)],
				);
				if (job.target_kind === "case") {
					const reports = await client.query<{ report_id: string }>(
						"SELECT report_id FROM soc_evidence WHERE organization_id=$1 AND incident_id=$2 AND report_id IS NOT NULL ORDER BY report_id",
						[job.organization_id, job.target_id],
					);
					for (const row of reports.rows)
						await enqueueCorrelation(
							client,
							job.organization_id,
							{ reportId: row.report_id },
							true,
						);
				}
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	} catch (error) {
		await pool.query(
			`UPDATE soc_correlation_jobs SET attempts=attempts+1,lease_token=NULL,
		 failed=attempts>=3,available_at=CASE WHEN attempts<3 THEN clock_timestamp()+interval '5 seconds' * power(4,attempts) END
		 WHERE ${fence}`,
			identity,
		);
		throw error;
	}
	return true;
}

export function startCorrelationWorker(pool: Pool, wazuh: Wazuh) {
	const windowMs = configuredWindowMs();
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running: Promise<void> | undefined;
	function tick() {
		running = runCorrelationJob(pool, wazuh, windowMs)
			.catch(() => {
				console.error("[Correlation] Could not process job");
				return false;
			})
			.then((worked) => {
				if (!stopped) timer = setTimeout(tick, worked ? 0 : 2000);
			});
	}
	tick();
	return async () => {
		stopped = true;
		clearTimeout(timer);
		await running;
	};
}
