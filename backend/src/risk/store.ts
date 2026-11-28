import type { PoolClient } from "pg";
import { ruleVersion, scoreRisk, type RiskInputs } from "./score";
import { historyPageSize, page } from "../correlation/pagination";

type Db = Pick<PoolClient, "query">;
type Transaction = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;

async function riskInputs(db: Db, org: string, caseId: string): Promise<RiskInputs> {
	const scope = [org, caseId];
	const evidence = await db.query<RiskInputs["evidence"][number]>(
		`SELECT e.id AS "evidenceId", e.report_id AS "reportId", COALESCE(e.source_id,r.source_id) AS "sourceId",
		    CASE WHEN e.source_id IS NULL THEN r.agent_id ELSE alert->>'agentId' END AS "agentId",
		    CASE WHEN e.source_id IS NOT NULL AND jsonb_typeof(alert->'ruleLevel')='number' THEN alert->'ruleLevel' END AS "ruleLevel"
		 FROM soc_evidence e LEFT JOIN soc_report_assets r ON r.organization_id=e.organization_id AND r.report_id=e.report_id
		 CROSS JOIN LATERAL (SELECT COALESCE(snapshot->'alert',snapshot) AS alert) a
		 WHERE e.organization_id=$1 AND e.incident_id=$2 ORDER BY e.id`,
		scope,
	);
	const scans = await db.query<RiskInputs["scans"][number]>(
		`SELECT s.evidence_id AS "evidenceId", j.id AS "jobId", j.content_hash AS hash, j.rule_version AS version,
		 j.matches, to_char(j.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "completedAt"
		 FROM soc_risk_yara_sources s JOIN yara_scan_jobs j ON j.organization_id=s.organization_id AND j.id=s.job_id
		 WHERE s.organization_id=$1 AND s.incident_id=$2 AND j.state='completed' ORDER BY s.evidence_id,j.id`,
		scope,
	);
	const checks = await db.query<RiskInputs["checks"][number]>(
		`SELECT s.evidence_id AS "evidenceId", j.id AS "jobId", j.provider, j.indicator_kind AS kind,
		 j.indicator_value AS indicator, j.result FROM soc_risk_ti_sources s
		 JOIN ioc_enrichment_jobs j ON j.organization_id=s.organization_id AND j.id=s.job_id
		 WHERE s.organization_id=$1 AND s.incident_id=$2 AND j.result IS NOT NULL ORDER BY s.evidence_id,j.id`,
		scope,
	);
	return { evidence: evidence.rows, scans: scans.rows, checks: checks.rows };
}

// The caller owns the transaction and changes evidence/status before calling.
// For closure, compute while still open, then set status to closed in that transaction.
async function refresh(db: Db, org: string, caseId: string, reason: string, fromQueue: boolean) {
	const scope = [org, caseId];
	const locked = await db.query<{ status: string }>(
		"SELECT status FROM soc_incidents WHERE organization_id=$1 AND id=$2 FOR UPDATE",
		scope,
	);
	await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 8009))", [org]);
	const updates = await db.query<{ cause: string }>(
		"DELETE FROM soc_risk_updates WHERE organization_id=$1 AND incident_id=$2 RETURNING cause",
		scope,
	);
	if (!locked.rowCount || (fromQueue && !updates.rowCount)) return;
	const data = await riskInputs(db, org, caseId);
	const inputs = JSON.stringify(data);
	const latest = await db.query<{ identical: boolean }>(
		`SELECT inputs=$3::jsonb AND rule_version=$4 AS identical FROM soc_risk_history
		 WHERE organization_id=$1 AND incident_id=$2 ORDER BY id DESC LIMIT 1`,
		[...scope, inputs, ruleVersion],
	);
	if (locked.rows[0]!.status === "closed") {
		if (!latest.rows[0]?.identical)
			await db.query(
				"UPDATE soc_incidents SET pending_risk_update=true WHERE organization_id=$1 AND id=$2",
				scope,
			);
		return;
	}
	if (fromQueue && latest.rows[0]?.identical) return;
	const result = scoreRisk(data);
	await db.query(
		`WITH revision AS (
		 INSERT INTO soc_risk_history (organization_id,incident_id,reason,rule_version,score,level,reasons,inputs)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at,score,level,reasons)
		 UPDATE soc_incidents SET risk_score=revision.score,risk_level=revision.level,risk_reasons=revision.reasons,
		 risk_updated_at=revision.created_at,pending_risk_update=false FROM revision WHERE organization_id=$1 AND id=$2`,
		[
			...scope,
			[...(fromQueue ? [] : [reason]), ...updates.rows.map((row) => row.cause).sort()].join(
				", ",
			),
			ruleVersion,
			result.score,
			result.level,
			JSON.stringify(result.reasons),
			inputs,
		],
	);
}

export function recomputeRisk(db: Db, org: string, caseId: string, reason: string) {
	return refresh(db, org, caseId, reason, false);
}

export async function readRisk(db: Db, org: string, caseId: string) {
	const result = await db.query<{
		riskScore: number | null;
		riskLevel: string | null;
		riskReasons: { label: string; points: number }[];
		riskUpdatedAt: Date | null;
		pendingRiskUpdate: boolean;
	}>(
		`SELECT risk_score AS "riskScore", risk_level AS "riskLevel", risk_reasons AS "riskReasons",
		 risk_updated_at AS "riskUpdatedAt", pending_risk_update AS "pendingRiskUpdate"
		 FROM soc_incidents WHERE organization_id=$1 AND id=$2`,
		[org, caseId],
	);
	const row = result.rows[0];
	return row ? { ...row, riskUpdatedAt: row.riskUpdatedAt?.toISOString() ?? null } : null;
}

export async function readRiskHistory(db: Db, org: string, caseId: string, before?: string) {
	const { rows } = await db.query<{
		id: string;
		reason: string;
		ruleVersion: string;
		riskScore: number | null;
		riskLevel: string | null;
		riskReasons: { label: string; points: number }[];
		createdAt: Date;
		inputs: RiskInputs;
	}>(
		`SELECT id::text,reason,rule_version AS "ruleVersion",score AS "riskScore",level AS "riskLevel",
		 reasons AS "riskReasons",created_at AS "createdAt",inputs
		 FROM soc_risk_history WHERE organization_id=$1 AND incident_id=$2 AND ($3::bigint IS NULL OR id<$3)
		 ORDER BY soc_risk_history.id DESC LIMIT $4`,
		[org, caseId, before ?? null, historyPageSize + 1],
	);
	return page(rows, historyPageSize, (row) => row.id);
}
export async function processRiskUpdate(transaction: Transaction) {
	return transaction(async (client) => {
		const next = await client.query<{ organization_id: string; id: string }>(
			`SELECT c.organization_id,c.id FROM soc_risk_updates u JOIN soc_incidents c
			 ON c.organization_id=u.organization_id AND c.id=u.incident_id
			 ORDER BY u.organization_id,u.incident_id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
		);
		const row = next.rows[0];
		if (!row) return false;
		await refresh(client, row.organization_id, row.id, "", true);
		return true;
	});
}

export function startRiskWorker(transaction: Transaction, onError: (error: unknown) => void) {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout>;
	let running: Promise<void> | undefined;
	function schedule(delay: number) {
		timer = setTimeout(() => {
			running = poll();
		}, delay);
	}
	async function poll() {
		let delay = 1000;
		try {
			if (await processRiskUpdate(transaction)) delay = 0;
		} catch (error) {
			onError(error);
		}
		if (!stopped) schedule(delay);
	}
	schedule(0);
	return async () => {
		stopped = true;
		clearTimeout(timer);
		await running;
	};
}
