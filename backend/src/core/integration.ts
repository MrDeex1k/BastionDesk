import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
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
	console.log(
		"PASS Core PostgreSQL creation, concurrent assignment, tenant scope and transaction rollback",
	);
} finally {
	await cleanup();
}
