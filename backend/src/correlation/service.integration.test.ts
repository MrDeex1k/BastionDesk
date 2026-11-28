import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { Pool } from "pg";
import {
	decideSuggestion,
	enqueueCorrelation,
	listSuggestions,
	runCorrelationJob,
} from "./service";

const connectionString = process.env.CORRELATION_TEST_DATABASE_URL;

test.skipIf(!connectionString)(
	"transactional enqueue, tenant isolation, lease fencing, retries and reverse correlation",
	async () => {
		const schema = "correlation_test_" + crypto.randomUUID().replaceAll("-", "");
		const admin = new Pool({ connectionString });
		const pool = new Pool({ connectionString, options: "-c search_path=" + schema });
		const reportId = crypto.randomUUID();
		const caseId = crypto.randomUUID();
		const anchor = new Date("2025-01-15T11:10:00Z");
		const sha = "a".repeat(64);
		const alert = {
			sourceId: crypto.randomUUID(),
			indexName: "wazuh-alerts-fixture",
			documentId: "late",
			timestamp: anchor.toISOString(),
			agentId: "001",
			agentName: "synthetic-host",
			ruleId: "1",
			ruleLevel: 6,
			description: "synthetic event",
			sha256s: [sha],
			ips: [],
			users: [],
		};
		const remote = { correlationCandidates: async () => [alert] };
		try {
			await admin.query("CREATE SCHEMA " + schema);
			await pool.query(`CREATE TABLE organization (id text PRIMARY KEY);
			CREATE TABLE incidents (id uuid PRIMARY KEY, "organizationId" text, "createdAt" timestamp, "userDescription" text, "userAttachmentMetadata" jsonb);
			CREATE TABLE wazuh_sources (organization_id text, enabled boolean DEFAULT true);`);
			for (const file of ["0007_correlation_cases.sql", "0008_correlation_jobs.sql"])
				await pool.query(
					await Bun.file(
						new URL("../../../database/versioned/" + file, import.meta.url),
					).text(),
				);
			await pool.query("INSERT INTO organization VALUES ('a'),('b')");
			await pool.query(
				"INSERT INTO wazuh_sources (organization_id,source_id) VALUES ('a',$1)",
				[alert.sourceId],
			);
			await pool.query(`INSERT INTO incidents VALUES ($1,'a',$2,'Fixture report',$3)`, [
				reportId,
				anchor,
				JSON.stringify({ contentHash: sha }),
			]);
			const tx = await pool.connect();
			try {
				await tx.query("BEGIN");
				await enqueueCorrelation(tx, "a", { reportId });
				await tx.query("ROLLBACK");
			} finally {
				tx.release();
			}
			await enqueueCorrelation(pool, "b", { reportId });
			expect(await runCorrelationJob(pool, remote)).toBe(false);
			await Promise.all([
				enqueueCorrelation(pool, "a", { reportId }),
				enqueueCorrelation(pool, "a", { reportId }),
			]);
			await rejects(
				runCorrelationJob(pool, {
					correlationCandidates: async () => {
						throw Error("Indexer offline");
					},
				}),
				/Indexer offline/,
			);
			expect(
				(await pool.query("SELECT attempts,failed FROM soc_correlation_jobs")).rows,
			).toEqual([{ attempts: 1, failed: false }]);
			await enqueueCorrelation(pool, "a", { reportId }, true);
			const started = Promise.withResolvers<void>();
			const resume = Promise.withResolvers<void>();
			const old = runCorrelationJob(pool, {
				correlationCandidates: async () => {
					started.resolve();
					await resume.promise;
					return [{ ...alert, documentId: "superseded" }];
				},
			});
			await started.promise;
			try {
				await enqueueCorrelation(pool, "a", { reportId }, true);
				await runCorrelationJob(pool, remote);
			} finally {
				resume.resolve();
				await old;
			}
			const first = await listSuggestions(pool, "a", { reportId });
			expect(first).toHaveLength(1);
			expect(first[0]?.alert.documentId).toBe("late");
			expect(await decideSuggestion(pool, "b", first[0]!.id, "rejected")).toBeNull();
			await decideSuggestion(pool, "a", first[0]!.id, "rejected");
			await enqueueCorrelation(pool, "a", { reportId }, true);
			await runCorrelationJob(pool, remote);
			expect((await listSuggestions(pool, "a", { reportId }))[0]?.status).toBe("rejected");
			await pool.query(
				"INSERT INTO soc_incidents (id,organization_id,title) VALUES ($1,'a','fixture')",
				[caseId],
			);
			await pool.query(
				`INSERT INTO soc_evidence (organization_id,incident_id,source_id,index_name,document_id,snapshot)
		 VALUES ('a',$1,$2,$3,'local',$4)`,
				[
					caseId,
					alert.sourceId,
					alert.indexName,
					JSON.stringify({ ...alert, documentId: "local" }),
				],
			);
			await enqueueCorrelation(pool, "a", { caseId });
			await runCorrelationJob(pool, remote);
			const local = await listSuggestions(pool, "a", { caseId });
			expect(local).toHaveLength(1);
			expect(local[0]?.caseId).toBe(caseId);
			expect(local[0]?.signals).toEqual(["sha256:" + sha]);
			expect(await listSuggestions(pool, "b", { caseId })).toEqual([]);
			const txDecision = await pool.connect();
			try {
				await txDecision.query("BEGIN");
				expect(
					(await decideSuggestion(txDecision, "a", local[0]!.id, "accepted"))?.status,
				).toBe("accepted");
				await txDecision.query("ROLLBACK");
			} finally {
				txDecision.release();
			}
			expect((await listSuggestions(pool, "a", { caseId }))[0]?.status).toBe("pending");
			await enqueueCorrelation(pool, "a", { reportId }, true);
			for (let attempt = 1; attempt <= 4; attempt++) {
				await rejects(
					runCorrelationJob(pool, {
						correlationCandidates: async () => {
							throw Error("fixture offline");
						},
					}),
					/fixture offline/,
				);
				const retry = (
					await pool.query(
						"SELECT attempts,failed,available_at FROM soc_correlation_jobs WHERE target_kind='report'",
					)
				).rows[0];
				expect(retry.attempts).toBe(attempt);
				expect(retry.failed).toBe(attempt === 4);
				if (attempt < 4) {
					expect(retry.available_at.getTime()).toBeGreaterThan(Date.now());
					await pool.query(
						"UPDATE soc_correlation_jobs SET available_at=now() WHERE target_kind='report'",
					);
				}
			}
			expect(await runCorrelationJob(pool, remote)).toBe(false);
			await enqueueCorrelation(pool, "a", { reportId }, true);
			await runCorrelationJob(pool, {
				correlationCandidates: async () => [
					{ ...alert, documentId: "arrived-later" },
					alert,
				],
			});
			expect(
				(await listSuggestions(pool, "a", { reportId })).map((s) => [
					s.alert.documentId,
					s.status,
				]),
			).toContainEqual(["arrived-later", "pending"]);
			expect(
				(await listSuggestions(pool, "a", { reportId })).map((s) => [
					s.alert.documentId,
					s.status,
				]),
			).toContainEqual(["late", "rejected"]);
		} finally {
			await pool.end();
			try {
				await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
			} finally {
				await admin.end();
			}
		}
	},
);
