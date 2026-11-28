import type { Pool, PoolClient } from "pg";
import { DomainError } from "../contracts/errors";
import {
	currentSuggestionMatch,
	decideSuggestion,
	enqueueCorrelation,
	getSuggestion,
	listSuggestions,
	type CorrelationAlert,
} from "../correlation/service";
import type { LiveIdentity } from "../identity/contract";
import { readRiskHistory, recomputeRisk } from "../risk/store";
import {
	encodeQueueCursor,
	historyPageSize,
	page,
	type QueueCursor,
} from "../correlation/pagination";

type Db = Pick<Pool, "query">;
type Transaction = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
type Report = { id: string; description: string; createdAt: Date; analystId: string | null };
type Case = {
	id: string;
	title: string;
	note: string | null;
	status: "open" | "closed";
	analystId: string | null;
	createdAt: Date;
};
type Evidence = {
	id: string;
	caseId: string;
	reportId: string | null;
	alert: CorrelationAlert | null;
};
type Change =
	| { action: "take" | "close" }
	| { action: "reopen"; reason: string }
	| { action: "unlink"; reason: string; evidenceId: string }
	| { action: "move"; reason: string; evidenceId: string; targetCaseId: string }
	| { action: "attachReport"; reportId: string }
	| { action: "attachAlert"; alert: CorrelationAlert };

export class CorrelationConflict extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

const caseFields = 'id,title,note,status,analyst_id AS "analystId",created_at AS "createdAt"';
const caseReadFields = `${caseFields},risk_score AS "riskScore",risk_level AS "riskLevel",
 risk_reasons AS "riskReasons",pending_risk_update AS "pendingRiskUpdate", risk_updated_at AS "riskUpdatedAt"`;
type CaseRow = Case & { riskScore: number | null; riskLevel: string | null };
const reportFields = 'id,"userDescription" AS description,"createdAt","analystId"';
const evidenceFields = `id,incident_id AS "caseId",report_id AS "reportId",
	CASE WHEN source_id IS NOT NULL THEN snapshot END AS alert`;

function requireValue<T>(value: T | undefined | null): T {
	if (value == null) throw new DomainError("NOT_FOUND");
	return value;
}

function allowWrite(actor: LiveIdentity, analystId: string | null, allowUnassigned = false) {
	if (actor.role === "admin") return;
	if (
		actor.role !== "analityk" ||
		(analystId !== actor.subject && !(allowUnassigned && !analystId))
	)
		throw new DomainError("FORBIDDEN");
}

function allowOpen(incident: Case) {
	if (incident.status === "closed")
		throw new CorrelationConflict("CASE_CLOSED", "Wznów incydent przed zmianą dowodów.");
}

async function report(db: Db, org: string, id: string, lock = false) {
	const result = await db.query<Report>(
		`SELECT ${reportFields} FROM incidents WHERE "organizationId"=$1 AND id=$2${lock ? " FOR NO KEY UPDATE" : ""}`,
		[org, id],
	);
	return requireValue(result.rows[0]);
}

async function writableReport(db: Db, actor: LiveIdentity, id: string) {
	const item = await report(db, actor.organizationId, id, true);
	allowWrite(actor, item.analystId, true);
	return item;
}

async function incident(db: Db, org: string, id: string, lock = false) {
	const result = await db.query<Case>(
		`SELECT ${caseFields} FROM soc_incidents WHERE organization_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
		[org, id],
	);
	return requireValue(result.rows[0]);
}

async function reportEvidence(db: Db, org: string, reportId: string) {
	return (
		await db.query<Evidence>(
			`SELECT ${evidenceFields} FROM soc_evidence WHERE organization_id=$1 AND report_id=$2 AND incident_id IS NOT NULL`,
			[org, reportId],
		)
	).rows[0];
}

async function alertEvidence(
	db: Db,
	org: string,
	alert: Pick<CorrelationAlert, "sourceId" | "indexName" | "documentId">,
) {
	return (
		await db.query<Evidence>(
			`SELECT ${evidenceFields} FROM soc_evidence WHERE organization_id=$1 AND source_id=$2
		 AND index_name=$3 AND document_id=$4 AND incident_id IS NOT NULL`,
			[org, alert.sourceId, alert.indexName, alert.documentId],
		)
	).rows[0];
}

async function history(
	db: Db,
	actor: LiveIdentity,
	caseId: string,
	action: string,
	reason: string | null = null,
	detail: object = {},
) {
	await db.query(
		`INSERT INTO soc_case_history (organization_id,incident_id,actor_id,action,reason,detail)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		[actor.organizationId, caseId, actor.subject, action, reason, JSON.stringify(detail)],
	);
}

async function create(db: Db, actor: LiveIdentity, title: string, note?: string) {
	const result = await db.query<{ id: string }>(
		`INSERT INTO soc_incidents (organization_id,title,note,analyst_id) VALUES ($1,$2,$3,$4) RETURNING id`,
		[actor.organizationId, title, note ?? null, actor.subject],
	);
	const id = requireValue(result.rows[0]).id;
	await history(db, actor, id, "created");
	return id;
}

async function attachReport(db: Db, actor: LiveIdentity, caseId: string, item: Report) {
	const result = await db.query<{ id: string }>(
		`INSERT INTO soc_evidence (organization_id,incident_id,report_id,snapshot)
		 VALUES ($1,$2,$3,$4) RETURNING id`,
		[actor.organizationId, caseId, item.id, JSON.stringify({ createdAt: item.createdAt })],
	);
	await history(db, actor, caseId, "attachedReport", null, {
		evidenceId: result.rows[0]?.id,
		reportId: item.id,
	});
}

async function attachAlert(db: Db, actor: LiveIdentity, caseId: string, alert: CorrelationAlert) {
	const result = await db.query<{ id: string }>(
		`INSERT INTO soc_evidence (organization_id,incident_id,source_id,index_name,document_id,snapshot)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		[
			actor.organizationId,
			caseId,
			alert.sourceId,
			alert.indexName,
			alert.documentId,
			JSON.stringify(alert),
		],
	);
	await history(db, actor, caseId, "attachedAlert", null, {
		evidenceId: result.rows[0]?.id,
		sourceId: alert.sourceId,
		indexName: alert.indexName,
		documentId: alert.documentId,
	});
}

function evidenceConflict(caseId: string): never {
	throw new CorrelationConflict(
		"EVIDENCE_ALREADY_LINKED",
		`Dowód należy już do incydentu ${caseId}. Użyj przeniesienia.`,
	);
}

async function matchReportAlert(
	client: PoolClient,
	actor: LiveIdentity,
	reportId: string,
	alert: CorrelationAlert,
	preferredCaseId?: string | null,
) {
	const org = actor.organizationId;
	const item = await writableReport(client, actor, reportId);
	const [knownReport, knownAlert] = await Promise.all([
		reportEvidence(client, org, reportId),
		alertEvidence(client, org, alert),
	]);
	const boundCase = preferredCaseId ?? knownReport?.caseId ?? knownAlert?.caseId;
	if (knownReport && knownReport.caseId !== boundCase) evidenceConflict(knownReport.caseId);
	if (knownAlert && knownAlert.caseId !== boundCase) evidenceConflict(knownAlert.caseId);
	let id: string;
	if (boundCase) {
		const selected = await incident(client, org, boundCase, true);
		allowWrite(actor, selected.analystId);
		if (knownReport && knownAlert) return { id: boundCase };
		allowOpen(selected);
		id = boundCase;
	} else {
		id = await create(client, actor, item.description.trim().slice(0, 200) || "Incydent");
	}
	if (!knownReport) await attachReport(client, actor, id, item);
	if (!knownAlert) await attachAlert(client, actor, id, alert);
	await recomputeRisk(client, org, id, "evidence-linked");
	if (!boundCase) await enqueueCorrelation(client, org, { caseId: id });
	return { id };
}

export function correlationCases(db: Db, transaction: Transaction) {
	// Serialize changes to active ownership, including two simultaneous creates for a new alert.
	const mutate = <T>(org: string, work: (client: PoolClient) => Promise<T>) =>
		transaction(async (client) => {
			await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 8007))", [org]);
			return work(client);
		});

	return {
		async list(
			org: string,
			sort: "risk" | "recent",
			status?: "open" | "closed",
			cursor?: QueueCursor,
		) {
			const size = 50;
			const riskOrder = sort === "risk" ? "COALESCE(risk_score,-1)" : "(0::integer)";
			const { rows } = await db.query<CaseRow & { cursorTime: string }>(
				`SELECT ${caseReadFields}, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime"
				 FROM soc_incidents WHERE organization_id=$1 AND ($3::text IS NULL OR status=$3)
				 AND ($4::timestamptz IS NULL OR (${riskOrder},created_at,id)<($2::int,$4,$5::uuid))
				 ORDER BY ${sort === "risk" ? riskOrder + " DESC," : ""}created_at DESC,id DESC LIMIT $6`,
				[
					org,
					sort === "risk" ? (cursor?.[0] ?? -1) : 0,
					status ?? null,
					cursor?.[1] ?? null,
					cursor?.[2] ?? null,
					size + 1,
				],
			);
			const result = page(rows, size, (row) =>
				encodeQueueCursor([row.riskScore ?? -1, row.cursorTime, row.id]),
			);
			return {
				...result,
				items: result.items.map(({ cursorTime: _cursorTime, ...row }) => row),
			};
		},
		async detail(org: string, id: string) {
			const base = requireValue(
				(
					await db.query<CaseRow>(
						`SELECT ${caseReadFields} FROM soc_incidents WHERE organization_id=$1 AND id=$2`,
						[org, id],
					)
				).rows[0],
			);
			const [evidence, suggestions] = await Promise.all([
				db.query<Evidence>(
					`SELECT ${evidenceFields} FROM soc_evidence WHERE organization_id=$1 AND incident_id=$2 ORDER BY created_at,id`,
					[org, id],
				),
				listSuggestions(db, org, { caseId: id }),
			]);
			return {
				...base,
				evidence: evidence.rows,
				suggestions,
			};
		},
		async history(org: string, id: string, kind: "operations" | "risk", before?: string) {
			await incident(db, org, id);
			if (kind === "risk") return readRiskHistory(db, org, id, before);
			const { rows } = await db.query<{
				id: string;
				action: string;
				actorId: string;
				reason: string | null;
				detail: unknown;
				createdAt: Date;
			}>(
				`SELECT id::text,action,actor_id AS "actorId",reason,detail,created_at AS "createdAt"
				 FROM soc_case_history WHERE organization_id=$1 AND incident_id=$2 AND ($3::bigint IS NULL OR id<$3)
				 ORDER BY soc_case_history.id DESC LIMIT $4`,
				[org, id, before ?? null, historyPageSize + 1],
			);
			return page(rows, historyPageSize, (row) => row.id);
		},
		async reports(org: string, query: string) {
			return (
				await db.query<Report>(
					`SELECT ${reportFields} FROM incidents WHERE "organizationId"=$1
				 AND (strpos(lower("userDescription"),lower($2))>0 OR id::text=$2 OR $2='')
				 ORDER BY "createdAt" DESC,id LIMIT 50`,
					[org, query],
				)
			).rows;
		},
		async report(org: string, id: string) {
			await report(db, org, id);
			const [assigned, suggestions, asset] = await Promise.all([
				reportEvidence(db, org, id),
				listSuggestions(db, org, { reportId: id }),
				db.query<{ sourceId: string; agentId: string }>(
					`SELECT source_id AS "sourceId",agent_id AS "agentId" FROM soc_report_assets WHERE organization_id=$1 AND report_id=$2`,
					[org, id],
				),
			]);
			return { caseId: assigned?.caseId ?? null, suggestions, asset: asset.rows[0] ?? null };
		},
		async alertCase(
			org: string,
			key: Pick<CorrelationAlert, "sourceId" | "indexName" | "documentId">,
		) {
			return { caseId: (await alertEvidence(db, org, key))?.caseId ?? null };
		},
		create(
			actor: LiveIdentity,
			input: { title: string; note?: string; reportId?: string; alert?: CorrelationAlert },
		) {
			const org = actor.organizationId;
			return mutate(org, async (client) => {
				const { title, note, reportId, alert } = input;
				if (reportId && alert) return matchReportAlert(client, actor, reportId, alert);
				const existing = alert
					? await alertEvidence(client, org, alert)
					: reportId
						? await reportEvidence(client, org, reportId)
						: undefined;
				if (existing) return { id: existing.caseId };
				const item = reportId ? await writableReport(client, actor, reportId) : undefined;
				const id = await create(client, actor, title, note);
				if (item) await attachReport(client, actor, id, item);
				if (alert) await attachAlert(client, actor, id, alert);
				await recomputeRisk(client, org, id, "created");
				if (alert) await enqueueCorrelation(client, org, { caseId: id });
				return { id };
			});
		},
		link(actor: LiveIdentity, reportId: string, alert: CorrelationAlert) {
			return mutate(actor.organizationId, (client) =>
				matchReportAlert(client, actor, reportId, alert),
			);
		},
		setAsset(
			actor: LiveIdentity,
			reportId: string,
			asset: { sourceId: string; agentId: string },
		) {
			const org = actor.organizationId;
			return mutate(org, async (client) => {
				await writableReport(client, actor, reportId);
				const evidence = await reportEvidence(client, org, reportId);
				if (evidence) {
					const current = await incident(client, org, evidence.caseId, true);
					allowWrite(actor, current.analystId);
					allowOpen(current);
				}
				await client.query(
					`INSERT INTO soc_report_assets (organization_id,report_id,source_id,agent_id,actor_id)
					 VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id,report_id) DO UPDATE
					 SET source_id=EXCLUDED.source_id,agent_id=EXCLUDED.agent_id,actor_id=EXCLUDED.actor_id,confirmed_at=clock_timestamp()`,
					[org, reportId, asset.sourceId, asset.agentId, actor.subject],
				);
				await enqueueCorrelation(client, org, { reportId }, true);
				await client.query(
					`UPDATE soc_suggestions SET status='expired'
					 WHERE organization_id=$1 AND report_id=$2 AND status='pending'
					   AND (source_id<>$3 OR alert->>'agentId'<>$4)
					   AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(signals) AS signal WHERE signal LIKE 'asset:%')`,
					[org, reportId, asset.sourceId, asset.agentId],
				);
				if (evidence)
					await history(client, actor, evidence.caseId, "assetConfirmed", null, {
						reportId,
						...asset,
					});
				return asset;
			});
		},
		refresh(actor: LiveIdentity, target: { reportId: string } | { caseId: string }) {
			const org = actor.organizationId;
			return mutate(org, async (client) => {
				if ("reportId" in target) {
					const item = await report(client, org, target.reportId);
					const evidence = await reportEvidence(client, org, target.reportId);
					if (evidence) {
						const current = await incident(client, org, evidence.caseId, true);
						allowWrite(actor, current.analystId);
					} else allowWrite(actor, item.analystId, true);
				} else {
					const current = await incident(client, org, target.caseId, true);
					allowWrite(actor, current.analystId);
				}
				await enqueueCorrelation(client, org, target, true);
				return { queued: true };
			});
		},
		decide(actor: LiveIdentity, id: string, decision: "accepted" | "rejected") {
			const org = actor.organizationId;
			return mutate(org, async (client) => {
				const row = requireValue(await getSuggestion(client, org, id));
				await writableReport(client, actor, row.reportId);
				const caseIds = new Set([
					(await reportEvidence(client, org, row.reportId))?.caseId,
					(await alertEvidence(client, org, row.alert))?.caseId,
				]);
				for (const caseId of caseIds) {
					if (caseId)
						allowWrite(actor, (await incident(client, org, caseId, true)).analystId);
				}
				if (row.status === decision) return { caseId: row.caseId };
				if (
					row.status === "expired" ||
					(row.status === "accepted" && decision === "rejected")
				)
					throw new CorrelationConflict(
						"SUGGESTION_INACTIVE",
						"Sugestia nie oczekuje już na tę decyzję.",
					);
				if (decision === "accepted") {
					const existingAlert = await alertEvidence(client, org, row.alert);
					const validSource =
						existingAlert ||
						(
							await client.query(
								"SELECT 1 FROM wazuh_sources WHERE organization_id=$1 AND source_id::text=$2 AND enabled FOR SHARE",
								[org, row.alert.sourceId],
							)
						).rowCount;
					const match = validSource && (await currentSuggestionMatch(client, org, row));
					if (!match)
						throw new CorrelationConflict(
							"SUGGESTION_EXPIRED",
							"Podstawa dopasowania się zmieniła. Ponów analizę.",
						);
					const matched = await matchReportAlert(
						client,
						actor,
						row.reportId,
						row.alert,
						row.caseId,
					);
					await decideSuggestion(client, org, id, decision);
					await client.query(
						"UPDATE soc_suggestions SET decided_by=$3,decided_at=clock_timestamp(),confidence=$4,signals=$5,version=$6 WHERE organization_id=$1 AND id=$2",
						[
							org,
							id,
							actor.subject,
							match.confidence,
							JSON.stringify(match.signals),
							match.version,
						],
					);
					await history(client, actor, matched.id, "suggestionAccepted", null, {
						suggestionId: id,
						reportId: row.reportId,
						alert: row.alert,
						signals: match.signals,
						confidence: match.confidence,
						ruleVersion: match.version,
					});
					return { caseId: matched.id };
				}
				await decideSuggestion(client, org, id, decision);
				await client.query(
					"UPDATE soc_suggestions SET decided_by=$3,decided_at=clock_timestamp() WHERE organization_id=$1 AND id=$2",
					[org, id, actor.subject],
				);
				const caseId = row.caseId;
				if (caseId) {
					await history(client, actor, caseId, "suggestionRejected", null, {
						suggestionId: id,
					});
				}
				return { caseId: caseId ?? null };
			});
		},
		change(actor: LiveIdentity, id: string, change: Change) {
			const org = actor.organizationId;
			return mutate(org, async (client) => {
				const current = await incident(client, org, id, true);
				allowWrite(actor, current.analystId, change.action === "take");
				if (change.action === "reopen") {
					if (current.status === "open") return { id };
					await client.query(
						"UPDATE soc_incidents SET status='open' WHERE organization_id=$1 AND id=$2",
						[org, id],
					);
					await history(client, actor, id, "reopened", change.reason);
					await recomputeRisk(client, org, id, "reopened");
					return { id };
				}
				if (change.action === "close" && current.status === "closed") return { id };
				allowOpen(current);
				switch (change.action) {
					case "take":
						if (current.analystId !== actor.subject) {
							await client.query(
								"UPDATE soc_incidents SET analyst_id=$3 WHERE organization_id=$1 AND id=$2",
								[org, id, actor.subject],
							);
							await history(client, actor, id, "assigned");
						}
						break;
					case "close":
						await recomputeRisk(client, org, id, "closed");
						await client.query(
							"UPDATE soc_incidents SET status='closed' WHERE organization_id=$1 AND id=$2",
							[org, id],
						);
						await history(client, actor, id, "closed");
						break;
					case "attachReport": {
						const item = await writableReport(client, actor, change.reportId);
						const known = await reportEvidence(client, org, change.reportId);
						if (known?.caseId === id) return { id };
						if (known) evidenceConflict(known.caseId);
						await attachReport(client, actor, id, item);
						await recomputeRisk(client, org, id, "report-attached");
						break;
					}
					case "attachAlert": {
						const known = await alertEvidence(client, org, change.alert);
						if (known?.caseId === id) return { id };
						if (known) evidenceConflict(known.caseId);
						await attachAlert(client, actor, id, change.alert);
						await recomputeRisk(client, org, id, "alert-attached");
						break;
					}
					case "unlink":
					case "move": {
						const target = change.action === "move" ? change.targetCaseId : null;
						if (target === id) throw new DomainError("VALIDATION_ERROR");
						if (target) {
							const other = await incident(client, org, target, true);
							allowWrite(actor, other.analystId);
							allowOpen(other);
						}
						const changed = await client.query<Evidence>(
							`UPDATE soc_evidence SET incident_id=$4 WHERE organization_id=$1
							 AND incident_id=$2 AND id=$3 RETURNING ${evidenceFields}`,
							[org, id, change.evidenceId, target],
						);
						const evidence = requireValue(changed.rows[0]);
						if (evidence.reportId)
							await writableReport(client, actor, evidence.reportId);
						const detail = {
							evidenceId: evidence.id,
							reportId: evidence.reportId,
							fromCaseId: id,
							targetCaseId: target,
						};
						await history(
							client,
							actor,
							id,
							change.action === "move" ? "movedOut" : "unlinked",
							change.reason,
							detail,
						);
						await recomputeRisk(client, org, id, "evidence-removed");
						if (target) {
							await history(client, actor, target, "movedIn", change.reason, detail);
							await recomputeRisk(client, org, target, "evidence-received");
						}
						break;
					}
				}
				return { id };
			});
		},
	};
}
