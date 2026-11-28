import { listJobs } from "../messaging/operations";
import { makeCommand, withReceipt } from "../adapters/core-receipts";
import { Effect } from "effect";
import { classificationJob } from "../messaging/worker";
import { jobStore } from "../messaging/store";
import { attachmentScans, scanWorkerStore } from "../yara/store";
import { baseRuleSet, ruleSet } from "../yara/rules";
import { assertYaraSchema } from "../yara/schema";
import { assertCoreSchema, assertIocEnrichmentSchema } from "../adapters/core-schema";
import { enrichmentStore } from "../adapters/ioc-enrichment-store";
import { enrichmentServices, startEnrichmentWorker } from "../adapters/ioc-enrichment-worker";
import { enrichmentTargets } from "./ioc/automatic";
import { providerLookups } from "./ioc/provider-lookups";
import { migrate } from "../migrations/runner";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceConnection, wazuhSourceStore } from "../wazuh/source";
import { Client, Pool, type PoolClient } from "pg";
import { createIncidentWrites } from "../adapters/core-incident-writes";
import { correlationCases } from "../adapters/core-correlation-store";
import { enqueueCorrelation, runCorrelationJob } from "../correlation/service";
import { decodeQueueCursor } from "../correlation/pagination";
import { decideIncidentChange } from "./incidents/commands";
import type { LiveIdentity } from "../identity/contract";

const name = `bastiondesk-core-${crypto.randomUUID()}`;
const password = crypto.randomUUID();
let pool: Pool | undefined;
let started = false;
async function docker(args: string[]) {
	const child = Bun.spawn(["docker", ...args], {
		env: { ...process.env, POSTGRES_PASSWORD: password },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, error, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code) throw new Error(`Docker ${args[0]} failed: ${error}`);
	return output;
}
async function cleanup() {
	await pool?.end();
	if (started) {
		started = false;
		await docker(["rm", "-f", name]);
	}
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.once(signal, () => {
		void cleanup().finally(() => process.exit(1));
	});
try {
	await docker([
		"run",
		"-d",
		"--name",
		name,
		"--tmpfs",
		"/var/lib/postgresql:rw",
		"-e",
		"POSTGRES_PASSWORD",
		"-p",
		"127.0.0.1::5432",
		"postgres:18.7",
	]);
	started = true;
	for (let i = 0; i < 60; i++) {
		try {
			await docker(["exec", name, "pg_isready", "-U", "postgres"]);
			break;
		} catch {
			await Bun.sleep(500);
		}
	}
	const port = Number((await docker(["port", name, "5432/tcp"])).trim().split(":").at(-1));
	pool = new Pool({
		host: "127.0.0.1",
		port,
		user: "postgres",
		password,
		database: "postgres",
		max: 5,
	});
	for (const file of ["01-init.sql", "02-create-auth.sql", "03-create-app.sql"])
		await pool.query(
			await readFile(new URL(`../../../database/init-sql/${file}`, import.meta.url), "utf8"),
		);
	await assert.rejects(() => assertCoreSchema(pool!), /CORE_MIGRATIONS_REQUIRED/);
	const migrator = new Client({
		host: "127.0.0.1",
		port,
		user: "postgres",
		password,
		database: "postgres",
	});
	await migrator.connect();
	const baseline = JSON.parse(
		await readFile(
			new URL("../../../database/versioned/baseline-1.0.3.json", import.meta.url),
			"utf8",
		),
	);
	await pool.query(`
  INSERT INTO "user" (id,email) VALUES ('auth-upgrade','upgrade@example.test');
  INSERT INTO organization (id,name,slug) VALUES ('auth-upgrade','Upgrade','auth-upgrade');
  INSERT INTO member (id,"userId","organizationId",role) VALUES ('auth-upgrade','auth-upgrade','auth-upgrade','admin');
  INSERT INTO session (id,"userId",token,"expiresAt","activeOrganizationId") VALUES ('auth-upgrade','auth-upgrade','existing-session',now()+interval '1 day','auth-upgrade');
  INSERT INTO account (id,"userId","accountId","providerId",password) VALUES ('auth-upgrade','auth-upgrade','auth-upgrade','credential','existing-password-hash');
  INSERT INTO passkey (id,"userId","publicKey","credentialId",counter,"deviceType") VALUES ('auth-upgrade','auth-upgrade','existing-public-key','existing-credential',7,'singleDevice');
  INSERT INTO incidents ("userId","organizationId",status,"userDescription","userAttachmentPath","analystNote")
    VALUES ('auth-upgrade','auth-upgrade','Raport w trakcie','Existing employee report','fixture/existing.txt','Existing analyst note');
  INSERT INTO incident_audit_log ("incidentId","changedBy","oldStatus","newStatus")
    SELECT id,'auth-upgrade','Zgłoszony','Raport w trakcie' FROM incidents WHERE "organizationId"='auth-upgrade';
 `);
	const upgradeTables = [
		"user",
		"session",
		"account",
		"organization",
		"member",
		"passkey",
		"incidents",
		"incident_audit_log",
	];
	const upgradeSnapshot = async () =>
		Promise.all(
			upgradeTables.map(
				async (table) =>
					(await pool!.query(`SELECT to_jsonb(t) AS data FROM "${table}" t ORDER BY id`))
						.rows,
			),
		);
	const beforeUpgrade = await upgradeSnapshot();
	const migrationDirectory = new URL("../../../database/versioned/", import.meta.url);
	const migrationFiles = (await readdir(migrationDirectory))
		.filter((file) => file.endsWith(".sql"))
		.sort();
	const migrations = await Promise.all(
		migrationFiles.map(async (file) => ({
			id: file.slice(0, -4),
			sql: await readFile(new URL(file, migrationDirectory), "utf8"),
		})),
	);
	await migrate(migrator, baseline.fingerprint, migrations, "apply");
	assert.deepEqual(
		(await migrate(migrator, baseline.fingerprint, migrations, "apply")).pending,
		[],
	);
	assert.deepEqual(
		await upgradeSnapshot(),
		beforeUpgrade,
		"upgrade preserves identity, existing incident records and their audit history byte for byte",
	);
	await pool.query(
		'SELECT "publicKey", "privateKey", "createdAt", "expiresAt", alg, crv FROM jwks',
	);
	const keyDirectory = await mkdtemp(join(tmpdir(), "bastiondesk-core-wazuh-"));
	const previousKey = process.env.WAZUH_SOURCE_KEY_FILE;
	const sources = wazuhSourceStore(pool);
	try {
		const path = join(keyDirectory, "key");
		await writeFile(path, randomBytes(32).toString("base64"), { mode: 0o600 });
		process.env.WAZUH_SOURCE_KEY_FILE = path;
		const draft = {
			origin: "https://indexer.example.test",
			username: "reader",
			password: crypto.randomUUID(),
			ca: undefined,
		};
		const first = await sources.save("auth-upgrade", draft);
		const stored = await sources.get("auth-upgrade");
		assert.ok(stored);
		assert.equal(stored.encrypted_password.includes(draft.password), false);
		assert.deepEqual(Object.keys(stored).sort(), [
			"ca_pem",
			"enabled",
			"encrypted_password",
			"organization_id",
			"origin",
			"revision",
			"source_id",
			"username",
		]);
		assert.deepEqual(await sourceConnection(stored), draft);
		assert.equal(await sources.get("other-organization"), undefined);
		await assert.rejects(() => sources.save("auth-upgrade", draft), /STALE/);
		const expired = AbortSignal.abort();
		await assert.rejects(
			() => sources.save("auth-upgrade", draft, first.revision, expired),
			/TIMEOUT/,
		);
		await assert.rejects(
			() => sources.setEnabled("auth-upgrade", first.revision, false, expired),
			/TIMEOUT/,
		);
		assert.equal((await sources.get("auth-upgrade"))?.revision, first.revision);
		const disabled = await sources.setEnabled("auth-upgrade", first.revision, false);
		assert.equal(disabled.enabled, false);
		await assert.rejects(() => sources.remove("auth-upgrade", first.revision), /STALE/);
		await sources.remove("auth-upgrade", disabled.revision);
		assert.equal(await sources.get("auth-upgrade"), undefined);
		console.log(
			"PASS Wazuh migration stores one encrypted source per organization and removes its credentials",
		);
	} finally {
		if (previousKey === undefined) delete process.env.WAZUH_SOURCE_KEY_FILE;
		else process.env.WAZUH_SOURCE_KEY_FILE = previousKey;
		await rm(keyDirectory, { recursive: true, force: true });
	}

	await pool.query(
		`DELETE FROM organization WHERE id='auth-upgrade'; DELETE FROM "user" WHERE id='auth-upgrade'`,
	);
	console.log("PASS full 1.0.3 upgrade preserves identity records and adds JWKS");
	await migrator.end();
	await assertCoreSchema(pool);
	await pool.query(
		`INSERT INTO "user" (id,email) VALUES ('a','a@example.test'),('b','b@example.test'); INSERT INTO organization (id,name,slug) VALUES ('org','Org','org'),('foreign','Foreign','foreign');`,
	);
	const transaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
		const client = await pool!.connect();
		try {
			await client.query("BEGIN");
			const result = await work(client);
			await client.query("COMMIT");
			return result;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	};
	const writes = createIncidentWrites(transaction);
	const a: LiveIdentity = {
		subject: "a",
		organizationId: "org",
		role: "analityk",
		sessionId: "s-a",
		sessionExpiresAt: 9999999999,
	};
	const b = { ...a, subject: "b" };
	await assertYaraSchema(pool);
	const scans = attachmentScans(pool, transaction);
	const scanWorker = scanWorkerStore(pool);
	const hash = "a".repeat(64);
	const attachment = async (name: string, legacy = false) => {
		const incident = {
			organizationId: a.organizationId,
			incidentId: crypto.randomUUID(),
			storageKey: name,
		};
		if (legacy) {
			await pool!.query(
				`INSERT INTO incidents (id, "userId", "organizationId", "userDescription", "userAttachmentPath", "userAttachmentMetadata")
				VALUES ($1,$2,$3,'legacy scan fixture',$4,'{}')`,
				[incident.incidentId, a.subject, a.organizationId, name],
			);
		} else {
			await writes.create(a, {
				id: incident.incidentId,
				userDescription: `Scan fixture ${name}`,
				userScreenshotPath: null,
				userScreenshotMetadata: {},
				userAttachmentPath: name,
				userAttachmentMetadata: { contentHash: hash },
			});
		}
		return incident;
	};
	const [firstFile, identicalFile, legacyFile] = await Promise.all([
		attachment("first.txt"),
		attachment("identical.txt"),
		attachment("legacy.txt", true),
	]);
	assert.equal(await scans.download(firstFile, true), "pending");
	assert.equal(await scans.download(legacyFile, true), "unscanned");
	const queued = await scanWorker.dispatch();
	assert.equal(queued.length, 1);
	await scanWorker.published(queued[0]!.id, queued[0]!.publication_token);
	assert.equal(
		(
			await pool.query<{ confirmed: boolean }>(
				"SELECT publish_after='infinity' AS confirmed FROM yara_scan_jobs WHERE id=$1",
				[queued[0]!.id],
			)
		).rows[0]?.confirmed,
		true,
	);
	const initialJob = await scanWorker.claim(queued[0]!.id);
	assert.ok(initialJob);
	assert.equal(await scanWorker.claim(initialJob.id), undefined);
	assert.equal(await scans.download(identicalFile, true), "running");
	await scanWorker.complete(initialJob, []);
	assert.equal(await scans.download(firstFile, true), "clean");
	assert.equal(await scans.download(identicalFile, true), "clean");
	assert.equal((await scans.request(legacyFile, hash)).state, "clean");
	const customSet = ruleSet("rule organization_marker { condition: true }");
	await scans.activate("org", customSet);
	assert.equal((await scans.rules("foreign")).version, baseRuleSet.version);
	assert.equal(await scans.download(legacyFile, false), "stale");
	assert.equal(await scans.download(legacyFile, true), "pending");
	assert.equal(
		(await scans.status(legacyFile, true)).history?.[0]?.ruleVersion,
		baseRuleSet.version,
	);
	const changed = await scanWorker.dispatch();
	assert.equal(changed.length, 1);
	const changedJob = await scanWorker.claim(changed[0]!.id);
	assert.ok(changedJob);
	assert.equal((await scanWorker.input(changedJob)).rules, customSet.rules);
	await scanWorker.fail(changedJob, false);
	assert.equal(await scans.download(legacyFile, true), "failed");
	await Promise.all([scans.request(legacyFile, hash), scans.request(firstFile, hash)]);
	const [retry] = await scanWorker.dispatch();
	assert.equal(retry?.id, changedJob.id);
	const retryJob = await scanWorker.claim(changedJob.id);
	assert.ok(retryJob);
	assert.equal(retryJob.attempts, 1);
	await scanWorker.complete(retryJob, ["organization:organization_marker"]);
	assert.equal(await scans.download(firstFile, true), "matched");
	await scans.activate("org", baseRuleSet);
	assert.equal(await scans.download(firstFile, true), "clean");
	assert.equal((await scans.status(firstFile)).latest?.ruleVersion, baseRuleSet.version);
	await pool.query("DELETE FROM incidents WHERE id = ANY($1::uuid[])", [
		[firstFile.incidentId, identicalFile.incidentId, legacyFile.incidentId],
	]);
	await pool.query("DELETE FROM core_jobs WHERE incident_id = ANY($1::uuid[])", [
		[firstFile.incidentId, identicalFile.incidentId],
	]);
	console.log(
		"PASS YARA upload, concurrent deduplication, legacy scan, durable retry, active version and download policy",
	);
	const created = await writes.create(a, {
		id: crypto.randomUUID(),
		userDescription: "Fixture incident for concurrent commands",
		userScreenshotPath: null,
		userScreenshotMetadata: {},
		userAttachmentPath: null,
		userAttachmentMetadata: {},
	});
	const assign = (actor: LiveIdentity) =>
		writes.mutate(actor, created.id, { type: "assign" }, "workflow", (row) =>
			decideIncidentChange(actor, row, { type: "assign" }, "workflow"),
		);
	const race = await Promise.allSettled([assign(a), assign(b)]);
	assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
	assert.equal(race.filter((r) => r.status === "rejected").length, 1);
	const winner = (
		await pool.query('SELECT "analystId", status FROM incidents WHERE id=$1', [created.id])
	).rows[0];
	assert.equal(winner.status, "Raport w trakcie");
	await assert.rejects(assign({ ...a, organizationId: "foreign" }), {
		code: "INCIDENT_NOT_FOUND",
	});
	const actor = winner.analystId === "a" ? a : b;
	const failing = createIncidentWrites((work) =>
		transaction(async (client) => {
			await work(client);
			throw new Error("simulated audit write failure");
		}),
	);
	await assert.rejects(
		failing.mutate(
			actor,
			created.id,
			{ type: "note", note: "must rollback" },
			"workflow",
			(row) =>
				decideIncidentChange(
					actor,
					row,
					{ type: "note", note: "must rollback" },
					"workflow",
				),
		),
	);
	assert.equal(
		(await pool.query('SELECT "analystNote" FROM incidents WHERE id=$1', [created.id])).rows[0]
			.analystNote,
		null,
	);
	const request = {
		idempotencyKey: "persisted-note",
		commandId: crypto.randomUUID(),
		correlationId: crypto.randomUUID(),
	};
	const note = { type: "note" as const, note: "one committed note" };
	const update = () =>
		writes.mutate(
			actor,
			created.id,
			note,
			"workflow",
			(row) => decideIncidentChange(actor, row, note, "workflow"),
			request,
		);
	const attempts = await Promise.all([update(), update()]);
	assert.equal(attempts[0].incident.analystNote, attempts[1].incident.analystNote);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::integer AS n FROM core_command_receipts WHERE idempotency_key='persisted-note'",
			)
		).rows[0].n,
		1,
	);
	assert.equal(
		(
			await pool.query("SELECT count(*)::integer AS n FROM core_audit WHERE command_id=$1", [
				request.commandId,
			])
		).rows[0].n,
		1,
	);
	await assert.rejects(
		writes.mutate(
			actor,
			created.id,
			{ type: "note", note: "conflict" },
			"workflow",
			(row) =>
				decideIncidentChange(actor, row, { type: "note", note: "conflict" }, "workflow"),
			request,
		),
		{ code: "IDEMPOTENCY_CONFLICT" },
	);
	// A new repository instance and new pool survive application restart.
	await pool.end();
	pool = new Pool({
		host: "127.0.0.1",
		port,
		user: "postgres",
		password,
		database: "postgres",
		max: 5,
	});
	const restarted = createIncidentWrites(transaction);
	await restarted.mutate(
		actor,
		created.id,
		note,
		"workflow",
		() => {
			throw new Error("Replay must not execute mutation");
		},
		request,
	);
	const audit = (
		await pool.query(
			"SELECT entry FROM core_audit WHERE command_id=$1 AND entry->>'outcome'='succeeded'",
			[request.commandId],
		)
	).rows[0].entry;
	assert.deepEqual(audit.changedFields, ["analystNote"]);
	assert.equal(audit.actor.id, actor.subject);
	assert.equal(JSON.stringify(audit).includes("one committed note"), false);
	const createRequest = {
		idempotencyKey: "same-create",
		commandId: crypto.randomUUID(),
		correlationId: crypto.randomUUID(),
	};
	const createInput = {
		id: crypto.randomUUID(),
		userDescription: "Repeatable creation",
		userScreenshotPath: null,
		userScreenshotMetadata: {},
		userAttachmentPath: null,
		userAttachmentMetadata: {},
	};
	const firstCreate = await writes.create(a, createInput, createRequest);
	const replayCreate = await writes.create(
		a,
		{ ...createInput, id: crypto.randomUUID() },
		createRequest,
	);
	assert.equal(replayCreate.id, firstCreate.id);
	const otherTenant = await writes.create(
		{ ...a, organizationId: "foreign" },
		{ ...createInput, id: crypto.randomUUID() },
		createRequest,
	);
	assert.notEqual(otherTenant.id, firstCreate.id);
	const userCommand = makeCommand(
		a,
		"note",
		created.id,
		{ note: "actor isolation" },
		{
			idempotencyKey: "same-actor-id",
			commandId: crypto.randomUUID(),
			correlationId: crypto.randomUUID(),
		},
	);
	const serviceCommand = {
		...userCommand,
		id: crypto.randomUUID(),
		context: {
			...userCommand.context,
			actor: { kind: "service" as const, id: a.subject },
		},
	};
	let executions = 0;
	const runActor = (command: typeof userCommand) =>
		transaction((client) =>
			withReceipt(
				client,
				command,
				async () => {
					executions++;
					return {
						value: command.context.actor.kind,
						resourceId: created.id,
						changedFields: [],
					};
				},
				() => {},
			),
		);
	assert.deepEqual(await Promise.all([runActor(userCommand), runActor(serviceCommand)]), [
		"user",
		"service",
	]);
	assert.deepEqual(await Promise.all([runActor(userCommand), runActor(serviceCommand)]), [
		"user",
		"service",
	]);
	assert.equal(executions, 2, "each actor kind executes once and replays its own result");
	assert.equal(
		(
			await pool.query(
				"SELECT * FROM core_command_receipts WHERE idempotency_key='same-actor-id'",
			)
		).rowCount,
		2,
	);
	console.log("PASS user and service with the same ID have isolated receipts and replay results");

	const denied = await pool.query(
		"SELECT entry FROM core_audit WHERE entry->>'outcome'='denied'",
	);
	assert(denied.rows.length > 0);
	assert(denied.rows.every((row) => row.entry.changedFields.length === 0));

	const jobs = jobStore(pool);
	const jobRows = await pool.query<{ id: string }>(
		"SELECT id FROM core_jobs WHERE incident_id=$1",
		[firstCreate.id],
	);
	assert.equal(jobRows.rowCount, 1, "replay does not enqueue twice");
	const jobId = jobRows.rows[0]!.id;
	const [claimA, claimB] = await Promise.all([jobs.claim(jobId), jobs.claim(jobId)]);
	const claim = claimA ?? claimB;
	assert(claim && !(claimA && claimB), "one lease owner");
	assert.equal(await jobs.description(claim), createInput.userDescription);
	assert.equal(await jobs.description({ ...claim, organization_id: "foreign" }), null);
	await pool.query(
		"UPDATE core_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
		[jobId],
	);
	const newer = await jobs.claim(jobId);
	assert(newer);
	assert.equal(await jobs.complete(claim, "Czerwony"), false, "stale lease fenced out");
	assert.equal(await jobs.complete(newer, "Zielony"), true);
	assert.equal(await jobs.complete(newer, "Czerwony"), false, "duplicate outcome ignored");
	assert.equal(await jobs.claim(jobId), null);
	assert.equal(
		(await pool.query("SELECT * FROM core_audit WHERE command_id=$1", [jobId])).rowCount,
		1,
	);
	const failedId = (
		await pool.query<{ id: string }>("SELECT id FROM core_jobs WHERE incident_id=$1", [
			otherTenant.id,
		])
	).rows[0]!.id;
	for (let attempt = 1; attempt <= 4; attempt++) {
		const failed = await jobs.claim(failedId);
		assert(failed);
		assert.equal(failed.attempts, attempt);
		await jobs.fail(failed, "LLM_UNAVAILABLE", true);
		if (attempt < 4) {
			assert.equal(await jobs.claim(failedId), null, "retry waits until due");
			await pool.query("UPDATE core_jobs SET available_at=clock_timestamp() WHERE id=$1", [
				failedId,
			]);
		}
	}
	assert.equal(
		(await pool.query("SELECT state FROM core_jobs WHERE id=$1", [failedId])).rows[0].state,
		"dead",
	);
	assert.equal(await jobs.replay(failedId, "org"), false);
	assert.equal(await jobs.replay(failedId, "foreign"), true);
	const replayAudit = (
		await pool.query(
			"SELECT entry FROM core_audit WHERE entry->>'action'='job.replay.v1' AND entry->'resource'->>'id'=$1",
			[failedId],
		)
	).rows[0].entry;
	assert.deepEqual(replayAudit.actor, { kind: "service", id: "job-operator" });
	const restartedJobs = jobStore(pool);
	assert(await restartedJobs.claim(failedId), "replay survives store recreation");

	const workerIncident = await writes.create(a, {
		...createInput,
		id: crypto.randomUUID(),
	});
	const workerId = (
		await pool.query<{ id: string }>("SELECT id FROM core_jobs WHERE incident_id=$1", [
			workerIncident.id,
		])
	).rows[0]!.id;
	let calls = 0;
	const classifier = {
		classify: async () => {
			calls++;
			return "Żółty";
		},
	};
	assert.equal(
		await Effect.runPromise(classificationJob(jobs, classifier, workerId)),
		"completed",
	);
	assert.equal(
		await Effect.runPromise(classificationJob(jobs, classifier, workerId)),
		"duplicate",
	);
	assert.equal(calls, 1);
	const beforeRollback = (await pool.query("SELECT count(*) FROM core_jobs")).rows[0].count;
	const broken = createIncidentWrites(async (work) =>
		transaction(async (client) => {
			await work(client);
			throw new Error("AFTER_OUTBOX_INSERT");
		}),
	);
	await assert.rejects(
		() => broken.create(a, { ...createInput, id: crypto.randomUUID() }),
		/AFTER_OUTBOX_INSERT/,
	);
	assert.equal(
		(await pool.query("SELECT count(*) FROM core_jobs")).rows[0].count,
		beforeRollback,
	);
	console.log(
		"PASS atomic outbox, replay deduplication, leases, tenant scope, stale result fencing, retries and DLQ replay",
	);
	const pagedIds: string[] = [];
	for (let i = 0; i < 102; i++) {
		const incident = await writes.create(a, {
			...createInput,
			id: crypto.randomUUID(),
		});
		const row = (
			await pool.query(
				"UPDATE core_jobs SET state='dead', created_at='2026-01-01' WHERE incident_id=$1 RETURNING id",
				[incident.id],
			)
		).rows[0];
		pagedIds.push(row.id);
	}
	const firstPage = await listJobs(pool, "org", { state: "dead" });
	assert.equal(firstPage.jobs.length, 100);
	assert(firstPage.nextCursor);
	const secondPage = await listJobs(pool, "org", {
		state: "dead",
		after: firstPage.nextCursor,
	});
	assert.equal(secondPage.nextCursor, null);
	const found = [...firstPage.jobs, ...secondPage.jobs].map((row) => row.id);
	assert.equal(new Set(found).size, found.length);
	for (const id of pagedIds) assert(found.includes(id));
	const foreignPage = await listJobs(pool, "foreign", { state: "dead" });
	assert(!foreignPage.jobs.some((row) => pagedIds.includes(row.id)));
	console.log("PASS paginated dead jobs, tenant isolation and fixed replay service identity");
	await assertIocEnrichmentSchema(pool);
	const enrichment = enrichmentStore(pool, transaction);
	const autoWrites = createIncidentWrites(transaction, async (_org, input) =>
		enrichmentTargets(input, ["virustotal"]),
	);
	const document = {
		...createInput,
		userDescription: "IOC enrichment fixture",
		userScreenshotMetadata: { contentHash: "b".repeat(64) },
		userAttachmentMetadata: { contentHash: hash },
	};
	const [first, second] = await Promise.all([
		autoWrites.create(a, { ...document, id: crypto.randomUUID() }),
		autoWrites.create(a, { ...document, id: crypto.randomUUID() }),
	]);
	assert.equal((await enrichment.forIncident("foreign", first.id)).length, 0);
	assert.deepEqual(
		(await enrichment.forIncident("org", first.id)).map(({ value }) => value),
		[hash],
	);
	assert.equal((await enrichment.forIncident("org", second.id))[0]?.result, null);
	const firstBatch = await enrichment.claim();
	assert.equal(firstBatch.length, 1);
	const iocJob = firstBatch[0]!;
	assert.equal((await enrichment.claim()).length, 0);
	await enrichment.finish(
		iocJob,
		{ provider: "virustotal", status: "unavailable" },
		async () => {},
	);
	const failedCheck = (await enrichment.forIncident("org", second.id))[0]!;
	assert.equal(failedCheck.result?.status, "unavailable");
	assert.ok(new Date(failedCheck.retryAt!).getTime() - Date.now() > 59_000);
	await enrichment.enqueue("org", first.id, iocJob, a.subject);
	assert.equal((await enrichment.claim()).length, 0, "API errors must wait 60 seconds");
	await pool.query(
		"UPDATE ioc_enrichment_jobs SET retry_at=clock_timestamp()-interval '1 second' WHERE id=$1",
		[iocJob.id],
	);
	await enrichment.enqueue("org", first.id, iocJob, a.subject);
	const renewed = (await enrichment.claim())[0]!;
	assert.equal(renewed.id, iocJob.id);
	assert.equal(renewed.requestedBy, a.subject);
	const time = new Date().toISOString();
	await enrichment.finish(
		renewed,
		{ provider: "virustotal", status: "not_found", fetchedAt: time, expiresAt: time },
		async () => {},
	);
	const completedCheck = (await enrichment.forIncident("org", second.id))[0]!;
	assert.equal(completedCheck.result?.status, "not_found");
	assert.ok(new Date(completedCheck.retryAt!).getTime() - Date.now() > 86_399_000);
	await enrichment.enqueue("org", second.id, renewed, a.subject);
	assert.equal((await enrichment.claim()).length, 0, "successful file checks must wait 24h");
	await pool.query(
		"UPDATE ioc_enrichment_jobs SET retry_at=clock_timestamp()-interval '1 second' WHERE id=$1",
		[iocJob.id],
	);
	await enrichment.enqueue("org", second.id, renewed, a.subject);
	let outbound = 0;
	const stopWorker = startEnrichmentWorker(
		enrichment,
		enrichmentServices(
			providerLookups({
				virustotal: {
					keyFor: async () => "fixture-key-not-a-secret",
					lookup: async () => {
						outbound++;
						return { status: "not_found" };
					},
				},
			}),
		),
	);
	try {
		const deadline = Date.now() + 5_000;
		while (
			!(await enrichment.forIncident("org", second.id))[0]?.result &&
			Date.now() < deadline
		)
			await Bun.sleep(25);
		assert.equal(
			(await enrichment.forIncident("org", first.id))[0]?.result?.status,
			"not_found",
		);
		assert.equal(outbound, 1);
		const audit = (
			await pool.query<{ entry: { actor: { kind: string; id: string } } }>(
				"SELECT entry FROM core_audit WHERE entry->>'action'='incidents.virustotal.v1' AND entry->'resource'->>'id'=$1",
				[second.id],
			)
		).rows[0]?.entry;
		assert.deepEqual(audit?.actor, { kind: "user", id: a.subject });
	} finally {
		await stopWorker();
	}
	console.log(
		"PASS IOC auto enqueue ignores screenshots, shares checks within a tenant and enforces both cooldowns",
	);
	console.log(
		"PASS migration repeat, concurrent receipt replay, conflict, restart and minimal audit",
	);
	console.log(
		"PASS Core PostgreSQL creation, concurrent assignment, tenant scope and transaction rollback",
	);
	const cases = correlationCases(pool, transaction);
	const caseWrites = createIncidentWrites(transaction, undefined, true);
	const reportId = crypto.randomUUID();
	const fileHash = "ca".repeat(32);
	await caseWrites.create(a, {
		id: reportId,
		userDescription: "Stage 8 fixture",
		userScreenshotPath: null,
		userScreenshotMetadata: {},
		userAttachmentPath: null,
		userAttachmentMetadata: { contentHash: fileHash },
	});
	const alert = {
		sourceId: crypto.randomUUID(),
		agentId: "001",
		agentName: "fixture",
		indexName: "wazuh-alerts-fixture",
		documentId: "fixture-1",
		timestamp: new Date().toISOString(),
		ruleId: "1001",
		ruleLevel: 12,
		description: "Stage 8 fixture alert",
		sha256s: [fileHash],
		ips: [],
		users: [],
	};
	const duplicate = await Promise.all([
		cases.create(a, { title: "Fixture", alert }),
		cases.create(a, { title: "Fixture", alert }),
	]);
	const id = duplicate[0]!.id;
	assert.equal(duplicate[1]?.id, id);
	assert.equal((await cases.detail("org", id)).evidence.length, 1);
	assert.equal((await cases.detail("org", id)).riskScore, 36);
	assert.equal(
		await runCorrelationJob(pool, { correlationCandidates: async () => [alert] }),
		true,
	);
	const pending = (await cases.report("org", reportId)).suggestions[0];
	assert.equal(pending?.status, "pending");
	await assert.rejects(() => cases.decide(b, pending!.id, "accepted"), /Brak uprawnień/);
	await cases.decide(a, pending!.id, "rejected");
	assert.equal((await cases.report("org", reportId)).suggestions[0]?.status, "rejected");
	await cases.decide(a, pending!.id, "accepted");
	assert.deepEqual(await cases.link(a, reportId, alert), { id });
	assert.equal((await cases.detail("org", id)).evidence.length, 2);
	await assert.rejects(() => cases.detail("foreign", id), /Zasób nie został znaleziony/);
	const other = await cases.create(a, {
		title: "Other",
		alert: { ...alert, documentId: "fixture-2" },
	});
	const linked = (await cases.detail("org", id)).evidence.find(
		(item) => item.reportId === reportId,
	);
	assert.ok(linked);
	await cases.change(a, id, { action: "close" });
	await assert.rejects(
		() => cases.change(a, id, { action: "unlink", evidenceId: linked.id, reason: "Fixture" }),
		/Wznów/,
	);
	assert.equal(
		(await pool.query("SELECT status FROM incidents WHERE id=$1", [reportId])).rows[0]?.status,
		"Zgłoszony",
	);
	await cases.change(a, id, { action: "reopen", reason: "Fixture follow-up" });
	await cases.change(a, id, {
		action: "move",
		evidenceId: linked.id,
		targetCaseId: other.id,
		reason: "Fixture move",
	});
	assert.equal((await cases.report("org", reportId)).caseId, other.id);
	const lastAlert = (await cases.detail("org", id)).evidence[0]!;
	await cases.change(a, id, {
		action: "unlink",
		evidenceId: lastAlert.id,
		reason: "Fixture unlink",
	});
	const cleared = await cases.detail("org", id);
	assert.equal(cleared.evidence.length, 0);
	assert.equal(cleared.riskScore, null);
	assert.ok(
		(await cases.history("org", id, "operations")).items.some(
			(entry) => "action" in entry && entry.action === "movedOut",
		),
	);
	assert.ok(
		(await cases.history("org", id, "risk")).items.some(
			(entry) => "riskScore" in entry && entry.riskScore === 36,
		),
	);
	assert.equal((await cases.list("org", "risk")).items.at(-1)?.id, id);
	const historical = {
		...alert,
		documentId: "historical",
		timestamp: "2000-01-01T00:00:00.000Z",
	};
	const anotherReport = await caseWrites.create(a, {
		id: crypto.randomUUID(),
		userDescription: "A second report for the same case",
		userScreenshotPath: null,
		userScreenshotMetadata: {},
		userAttachmentPath: null,
		userAttachmentMetadata: {},
	});
	await cases.change(a, other.id, { action: "attachAlert", alert: historical });
	assert.deepEqual(await cases.link(a, anotherReport.id, historical), { id: other.id });
	const combined = await cases.detail("org", other.id);
	assert.equal(combined.evidence.filter((item) => item.reportId).length, 2);
	assert.equal(combined.evidence.filter((item) => item.alert).length, 2);
	assert.equal(combined.riskScore, 36, "repeated evidence must not inflate risk");
	await pool.query('UPDATE incidents SET "analystId"=$2 WHERE id=$1', [
		anotherReport.id,
		b.subject,
	]);
	await assert.rejects(() => cases.link(a, anotherReport.id, historical), /Brak uprawnień/);
	await pool.query('UPDATE incidents SET "analystId"=$2 WHERE id=$1', [reportId, b.subject]);
	await assert.rejects(
		() => cases.change(a, id, { action: "attachReport", reportId: anotherReport.id }),
		/Brak uprawnień/,
	);

	const fresh = await caseWrites.create(a, {
		id: crypto.randomUUID(),
		userDescription: "Stage 8 asset expiry fixture",
		userScreenshotPath: null,
		userScreenshotMetadata: {},
		userAttachmentPath: null,
		userAttachmentMetadata: {},
	});
	await pool.query('UPDATE incidents SET "analystId"=$2 WHERE id=$1', [fresh.id, b.subject]);
	await assert.rejects(
		() => cases.change(a, id, { action: "attachReport", reportId: fresh.id }),
		/Brak uprawnień/,
	);
	await assert.rejects(() => cases.link(a, fresh.id, historical), /Brak uprawnień/);
	await cases.setAsset(b, fresh.id, { sourceId: alert.sourceId, agentId: "001" });
	// Run just the controlled case job rather than older background work in this suite.
	await pool.query(
		"UPDATE soc_correlation_jobs SET available_at=NULL WHERE organization_id='org'",
	);
	await enqueueCorrelation(pool, "org", { caseId: other.id }, true);
	await runCorrelationJob(pool, { correlationCandidates: async () => [] });
	const candidate = (await cases.report("org", fresh.id)).suggestions[0];
	assert.equal(candidate?.signals[0], "asset:001");
	await cases.setAsset(b, fresh.id, { sourceId: alert.sourceId, agentId: "002" });
	assert.deepEqual((await cases.report("org", fresh.id)).suggestions, []);
	const admin = { ...a, role: "admin" as const };
	await assert.rejects(() => cases.decide(admin, candidate!.id, "accepted"), /Sugestia/);
	await assert.rejects(() => cases.history("foreign", id, "risk"), /Zasób nie został znaleziony/);

	await pool.query(`INSERT INTO soc_incidents (organization_id,title,status,created_at)
	 SELECT 'org','Pagination fixture','closed','2025-01-01T00:00:00Z' FROM generate_series(1,105)`);
	const paged = new Set<string>();
	let pageCursor: string | null = null;
	do {
		const result = await cases.list(
			"org",
			"risk",
			"closed",
			pageCursor ? decodeQueueCursor(pageCursor) : undefined,
		);
		for (const item of result.items) {
			assert.ok(!paged.has(item.id));
			paged.add(item.id);
		}
		pageCursor = result.nextCursor;
	} while (pageCursor);
	assert.equal(paged.size, 105);

	await pool.query(
		`INSERT INTO soc_case_history (organization_id,incident_id,action,actor_id)
	 SELECT 'org',$1,'history fixture','a' FROM generate_series(1,30)`,
		[id],
	);
	const firstHistory = await cases.history("org", id, "operations");
	assert.equal(firstHistory.items.length, 25);
	assert.ok(firstHistory.nextCursor);
	const olderHistory = await cases.history("org", id, "operations", firstHistory.nextCursor);
	assert.ok(olderHistory.items.length >= 5);
	assert.ok(olderHistory.items.every((row) => BigInt(row.id) < BigInt(firstHistory.nextCursor!)));

	console.log(
		"PASS Stage 8 concurrent create, suggestions, scope, move, close/reopen and risk history",
	);
} finally {
	await cleanup();
}
