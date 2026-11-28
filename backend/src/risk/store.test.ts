import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { Pool } from "pg";
import { processRiskUpdate, readRisk, readRiskHistory, recomputeRisk } from "./store";

const url = process.env.RISK_TEST_DATABASE_URL;
test.skipIf(!url)(
	"stage 7 verdicts update only accepted evidence, freeze at closure and replay after reopening",
	async () => {
		const pool = new Pool({ connectionString: url });
		const db = await pool.connect();
		try {
			await db.query("BEGIN");
			const schema = "risk_fixture_" + crypto.randomUUID().replaceAll("-", "");
			await db.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
			await db.query(
				'CREATE TABLE organization(id text PRIMARY KEY); CREATE TABLE incidents(id uuid PRIMARY KEY,"organizationId" text); CREATE TABLE wazuh_sources(id text)',
			);
			for (const file of [
				"0005_yara_attachments",
				"0006_ioc_enrichment",
				"0007_correlation_cases",
				"0009_correlation_risk",
			]) {
				await db.query(
					await Bun.file(
						new URL("../../../database/versioned/" + file + ".sql", import.meta.url),
					).text(),
				);
			}
			await db.query("INSERT INTO organization VALUES ('org'),('other')");
			const id = crypto.randomUUID(),
				job = crypto.randomUUID(),
				scan = crypto.randomUUID(),
				hash = "b".repeat(64);
			await db.query(
				"INSERT INTO soc_incidents(id,organization_id,title) VALUES ($1,'org','fixture')",
				[id],
			);
			await db.query(
				"INSERT INTO soc_evidence(organization_id,incident_id,source_id,index_name,document_id,snapshot) VALUES ('org',$1,'source','index','doc',$2)",
				[id, JSON.stringify({ alert: { ruleLevel: 0, sha256s: [hash] } })],
			);
			await recomputeRisk(db, "org", id, "accepted");
			expect((await readRisk(db, "org", id))?.riskScore).toBe(0);
			expect(await readRisk(db, "other", id)).toBeNull();
			await db.query("INSERT INTO yara_rule_sets VALUES ('org','fixture','{}')");
			await db.query(
				"INSERT INTO yara_scan_jobs(id,organization_id,content_hash,rule_version) VALUES ($1,'org',$2,'fixture')",
				[scan, hash],
			);
			await db.query(
				"UPDATE yara_scan_jobs SET state='completed',matches=ARRAY['fixture'],completed_at=now() WHERE id=$1",
				[scan],
			);
			const drain = () => processRiskUpdate((work) => work(db));
			expect(await drain()).toBe(true);
			expect((await readRisk(db, "org", id))?.riskScore).toBe(25);
			await db.query("UPDATE soc_incidents SET status='closed' WHERE id=$1", [id]);
			await db.query(
				"INSERT INTO ioc_enrichment_jobs(id,organization_id,provider,indicator_kind,indicator_digest,indicator_value,trigger_incident_id) VALUES ($1,'org','hybrid_analysis','sha256',$2,$2,$3)",
				[job, hash, id],
			);
			await db.query("UPDATE ioc_enrichment_jobs SET result=$1,retry_at=now() WHERE id=$2", [
				JSON.stringify({
					status: "ready",
					provider: "hybrid_analysis",
					summary: { kind: "sandbox", verdict: "malicious" },
				}),
				job,
			]);
			expect(await drain()).toBe(true);
			expect(await drain()).toBe(false);
			const frozen = await readRisk(db, "org", id);
			expect(frozen).toMatchObject({ riskScore: 25, pendingRiskUpdate: true });
			const frozenHistory = await readRiskHistory(db, "org", id);
			expect(frozenHistory.items).toHaveLength(2);
			await db.query("UPDATE soc_incidents SET status='open' WHERE id=$1", [id]);
			await recomputeRisk(db, "org", id, "reopened");
			const reopened = await readRisk(db, "org", id);
			expect(reopened).toMatchObject({ riskScore: 45, pendingRiskUpdate: false });
			expect((await readRiskHistory(db, "org", id)).items.slice(1)).toEqual(
				frozenHistory.items,
			);
			await db.query("UPDATE soc_evidence SET incident_id=NULL WHERE incident_id=$1", [id]);
			await recomputeRisk(db, "org", id, "detached");
			expect((await readRisk(db, "org", id))?.riskScore).toBeNull();
			const report = crypto.randomUUID();
			await db.query("INSERT INTO incidents VALUES ($1,'org')", [report]);
			await db.query(
				"INSERT INTO soc_evidence(organization_id,incident_id,report_id,snapshot) VALUES ('org',$1,$2,'{}')",
				[id, report],
			);
			await recomputeRisk(db, "org", id, "report accepted");
			await db.query("INSERT INTO yara_attachments VALUES ('org',$1,'fixture',$2)", [
				report,
				scan,
			]);
			await db.query("INSERT INTO incident_ioc_enrichment VALUES ('org',$1,$2)", [
				report,
				job,
			]);
			expect(await drain()).toBe(true);
			const cached = await readRisk(db, "org", id);
			expect(cached?.riskScore).toBe(45);
			expect((await readRiskHistory(db, "org", id)).items[0]?.reason).toBe(
				"Threat Intelligence, YARA",
			);
			await db.query("SAVEPOINT immutable");
			await rejects(
				db.query("UPDATE soc_risk_history SET score=99 WHERE incident_id=$1", [id]),
				/immutable/,
			);
			await db.query("ROLLBACK TO immutable");
		} finally {
			await db.query("ROLLBACK");
			db.release();
			await pool.end();
		}
	},
);
