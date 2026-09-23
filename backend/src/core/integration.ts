import { listJobs } from "../messaging/operations";
import { makeCommand, withReceipt } from "../adapters/core-receipts";
import { Effect } from "effect";
import { classificationJob } from "../messaging/worker";
import { jobStore } from "../messaging/store";
import { assertCoreSchema } from "../adapters/core-schema";
import { migrate } from "../migrations/runner";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client, Pool, type PoolClient } from "pg";
import { createIncidentWrites } from "../adapters/core-incident-writes";
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
		"postgres:18.6",
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
	const migrations = [
		{
			id: "0002_durable_jobs",
			sql: await readFile(
				new URL("../../../database/versioned/0002_durable_jobs.sql", import.meta.url),
				"utf8",
			),
		},
		{
			id: "0001_core_operations",
			sql: await readFile(
				new URL("../../../database/versioned/0001_core_operations.sql", import.meta.url),
				"utf8",
			),
		},
	];
	migrations.sort((a, b) => a.id.localeCompare(b.id));
	await migrate(migrator, baseline.fingerprint, migrations, "apply");
	assert.deepEqual(
		(await migrate(migrator, baseline.fingerprint, migrations, "apply")).pending,
		[],
	);
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

	const workerIncident = await writes.create(a, { ...createInput, id: crypto.randomUUID() });
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
		const incident = await writes.create(a, { ...createInput, id: crypto.randomUUID() });
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
	const secondPage = await listJobs(pool, "org", { state: "dead", after: firstPage.nextCursor });
	assert.equal(secondPage.nextCursor, null);
	const found = [...firstPage.jobs, ...secondPage.jobs].map((row) => row.id);
	assert.equal(new Set(found).size, found.length);
	for (const id of pagedIds) assert(found.includes(id));
	const foreignPage = await listJobs(pool, "foreign", { state: "dead" });
	assert(!foreignPage.jobs.some((row) => pagedIds.includes(row.id)));
	console.log("PASS paginated dead jobs, tenant isolation and fixed replay service identity");
	console.log(
		"PASS migration repeat, concurrent receipt replay, conflict, restart and minimal audit",
	);
	console.log(
		"PASS Core PostgreSQL creation, concurrent assignment, tenant scope and transaction rollback",
	);
} finally {
	await cleanup();
}
