import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { migrate } from "./runner";
import { schemaFingerprint } from "./schema";

const root = new URL("../../../", import.meta.url);
const name = `bastiondesk-migrations-${randomUUID()}`;
const password = randomUUID();
const clients: Client[] = [];
const fixtureDirectory = await mkdtemp("/tmp/bastiondesk-migration-manifest-");

let started = false;
async function docker(args: string[], input?: string): Promise<string> {
	const process = Bun.spawn(["docker", ...args], {
		env: { ...Bun.env, POSTGRES_PASSWORD: password },
		stdin: input === undefined ? "ignore" : new Blob([input]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (code) throw new Error(`Docker ${args[0]} failed: ${stderr}`);
	return stdout;
}
async function cleanup() {
	await Promise.allSettled(clients.map((client) => client.end()));
	await rm(fixtureDirectory, { recursive: true, force: true });
	if (started) {
		await docker(["rm", "-f", name]);
		started = false;
	}
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		void cleanup().finally(() => process.exit(1));
	});
}

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
	let ready = false;
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			await docker(["exec", name, "pg_isready", "-U", "postgres"]);
			ready = true;
			break;
		} catch {
			await Bun.sleep(500);
		}
	}
	assert(ready, "PostgreSQL did not become ready");
	const port = Number((await docker(["port", name, "5432/tcp"])).trim().split(":").at(-1));
	async function connect(database = "postgres") {
		const client = new Client({
			host: "127.0.0.1",
			port,
			user: "postgres",
			password,
			database,
		});
		await client.connect();
		clients.push(client);
		return client;
	}
	const db = await connect();
	for (const file of ["01-init.sql", "02-create-auth.sql", "03-create-app.sql"]) {
		await db.query(await readFile(new URL(`database/init-sql/${file}`, root), "utf8"));
	}
	await db.query("SET search_path = public, pg_catalog");
	const actual = await schemaFingerprint(db);
	const baselinePath = new URL("database/versioned/baseline-1.0.3.json", root);
	if (process.argv.includes("--record-baseline")) {
		await writeFile(
			baselinePath,
			JSON.stringify({ version: "1.0.3", fingerprint: actual }, null, 2) + "\n",
			{ flag: "wx" },
		);
	}
	const baseline = JSON.parse(await readFile(baselinePath, "utf8")).fingerprint as string;
	await writeFile(`${fixtureDirectory}/baseline-1.0.3.json`, await readFile(baselinePath));
	assert.equal(actual, baseline, "Fresh install differs from frozen baseline");
	await db.query(`
		INSERT INTO "user" (id,email) VALUES ('user-a','a@example.test'),('user-b','b@example.test');
		INSERT INTO organization (id,name,slug) VALUES ('org-a','A','a'),('org-b','B','b');
		INSERT INTO member (id,"organizationId","userId",role) VALUES
			('member-a','org-a','user-a','admin'),('member-b','org-b','user-b','pracownik');
		INSERT INTO account (id,"userId","accountId","providerId",password) VALUES
			('account-a','user-a','user-a','credential','fixture-hash-a'),
			('account-b','user-b','user-b','credential','fixture-hash-b');
		INSERT INTO incidents ("userId","organizationId","userDescription","userAttachmentPath","userAttachmentMetadata")
		VALUES ('user-a','org-a','Tenant A fixture','org-a/file.pdf','{"size":17}'),
			('user-b','org-b','Tenant B fixture','org-b/file.pdf','{"size":19}');
		UPDATE incidents SET status = 'Raport w trakcie';
	`);
	async function snapshot(client: Client) {
		const tables = (
			await client.query(
				"SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
			)
		).rows;
		const result: Record<string, unknown> = {};
		for (const { tablename } of tables) {
			const quoted = '"' + String(tablename).replaceAll('"', '""') + '"';
			result[tablename] = (
				await client.query(
					`SELECT to_jsonb(t) AS row FROM public.${quoted} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
				)
			).rows;
		}
		return result;
	}
	const before = await snapshot(db);
	const dump = await docker([
		"exec",
		name,
		"pg_dump",
		"-U",
		"postgres",
		"--no-owner",
		"--no-acl",
		"postgres",
	]);
	await db.query("CREATE DATABASE restored");
	await docker(
		[
			"exec",
			"-i",
			name,
			"psql",
			"-X",
			"-v",
			"ON_ERROR_STOP=1",
			"-U",
			"postgres",
			"-d",
			"restored",
		],
		dump,
	);
	const restored = await connect("restored");
	async function cli(mode: "plan" | "apply") {
		const process = Bun.spawn(
			[Bun.which("bun")!, new URL("cli.ts", import.meta.url).pathname, mode],
			{
				env: {
					...Bun.env,
					MIGRATION_DIRECTORY: fixtureDirectory,
					MIGRATION_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/restored`,
					MIGRATION_ALLOW_LOCAL_PLAINTEXT: "true",
					MIGRATION_TLS_CA: "",
					MIGRATION_TLS_CERT: "",
					MIGRATION_TLS_KEY: "",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(process.stdout).text(),
			new Response(process.stderr).text(),
			process.exited,
		]);
		assert.equal(code, 0, stderr);
		return JSON.parse(stdout) as { pending: string[] };
	}
	assert.deepEqual(await snapshot(restored), before);
	console.log("PASS backup/restore preserves fixture before upgrade");
	assert.deepEqual((await cli("plan")).pending, ["0000_baseline_1_0_3"]);
	assert.deepEqual((await migrate(restored, baseline, [])).pending, ["0000_baseline_1_0_3"]);
	assert.equal(
		(await restored.query("SELECT to_regnamespace('bastiondesk_meta') AS value")).rows[0].value,
		null,
	);
	console.log("PASS plan leaves database unchanged");
	await assert.rejects(
		migrate(
			restored,
			baseline,
			[
				{
					id: "0001_failed_adoption",
					sql: "CREATE TABLE adoption_probe (id int); SELECT 1 / 0;",
				},
			],
			"apply",
		),
	);
	assert.equal(
		(await restored.query("SELECT to_regnamespace('bastiondesk_meta') AS value")).rows[0].value,
		null,
	);
	assert.equal(
		(await restored.query("SELECT to_regclass('public.adoption_probe') AS value")).rows[0]
			.value,
		null,
	);
	console.log("PASS failed first migration also rolls back baseline adoption");
	await cli("apply");
	assert.deepEqual(await snapshot(restored), before);
	assert.deepEqual((await migrate(restored, baseline, [], "apply")).pending, []);
	console.log("PASS adoption and repeat preserve all public rows");
	const change = {
		id: "0001_fixture",
		sql: "SELECT pg_sleep(0.2); CREATE TABLE migration_probe (id int PRIMARY KEY); INSERT INTO migration_probe VALUES (1);",
	};
	const other = await connect("restored");
	const concurrent = await Promise.all([
		migrate(restored, baseline, [change], "apply"),
		migrate(other, baseline, [change], "apply"),
	]);
	assert.equal(concurrent.filter((result) => result.pending.length === 1).length, 1);
	assert.equal((await restored.query("SELECT count(*) FROM migration_probe")).rows[0].count, "1");
	console.log("PASS concurrent runners apply migration exactly once");
	await assert.rejects(
		migrate(restored, baseline, [{ ...change, sql: change.sql + " -- edited" }], "apply"),
		/MIGRATION_HISTORY_MISMATCH/,
	);
	await assert.rejects(migrate(restored, baseline, [], "apply"), /MIGRATION_HISTORY_MISMATCH/);
	console.log("PASS edited and missing migration history rejected");
	const failure = {
		id: "0002_failure",
		sql: "CREATE TABLE rollback_probe (id int); INSERT INTO missing_table VALUES (1);",
	};
	await assert.rejects(migrate(restored, baseline, [change, failure], "apply"));
	assert.equal(
		(await restored.query("SELECT to_regclass('public.rollback_probe') AS value")).rows[0]
			.value,
		null,
	);
	assert.equal(
		(await restored.query("SELECT count(*) FROM bastiondesk_meta.migrations")).rows[0].count,
		"2",
	);
	await migrate(restored, baseline, [change], "apply");
	console.log("PASS failed DDL rolls back and retry remains usable");
	await restored.query("ALTER TABLE incidents DISABLE TRIGGER log_status_change");
	await assert.rejects(migrate(restored, baseline, [change], "apply"), /SCHEMA_DRIFT/);
	await restored.query("ALTER TABLE incidents ENABLE TRIGGER log_status_change");
	await migrate(restored, baseline, [change], "apply");
	console.log("PASS disabled audit trigger is schema drift");
	await restored.query("ALTER TABLE incidents ADD COLUMN unexpected text");
	await assert.rejects(migrate(restored, baseline, [change], "apply"), /SCHEMA_DRIFT/);
	await db.query("ALTER TABLE account ADD COLUMN issuer text");
	await assert.rejects(migrate(db, baseline, [], "apply"), /SCHEMA_DRIFT/);
	assert.equal(
		(await db.query("SELECT to_regnamespace('bastiondesk_meta') AS value")).rows[0].value,
		null,
	);
	console.log("PASS drift rejected before adoption and after upgrade");
	const scoped = await restored.query(
		'SELECT "organizationId", "userAttachmentPath" FROM incidents WHERE "organizationId" = $1',
		["org-a"],
	);
	assert.deepEqual(scoped.rows, [
		{ organizationId: "org-a", userAttachmentPath: "org-a/file.pdf" },
	]);
	await restored.query(
		"UPDATE incidents SET status = 'Raport złożony', \"czyRozwiazany\" = true WHERE \"organizationId\" = 'org-a'",
	);
	assert.equal(
		(await restored.query("SELECT count(*) FROM incident_audit_log")).rows[0].count,
		"3",
	);
	assert.equal(
		(await restored.query('SELECT count(*) FROM incidents WHERE "dataRozwiazania" IS NOT NULL'))
			.rows[0].count,
		"1",
	);
	console.log("PASS tenant-scoped reads, storage keys and triggers survive upgrade");
} finally {
	await cleanup();
	console.log("Isolated PostgreSQL removed");
}
