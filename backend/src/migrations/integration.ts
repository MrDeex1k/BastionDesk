import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { migrate } from "./runner";
import { schemaFingerprint } from "./schema";

const root = new URL("../../../", import.meta.url);
const name = `bastiondesk-migrations-${randomUUID()}`;
const sourceName = `${name}-18`;
const targetName = `${name}-19`;
const password = randomUUID();
const clients: Client[] = [];
const containers = new Set<string>();
const fixtureDirectory = await mkdtemp("/tmp/bastiondesk-migration-manifest-");

async function docker(args: string[], input?: ArrayBuffer): Promise<ArrayBuffer> {
	const process = Bun.spawn(["docker", ...args], {
		env: { ...Bun.env, POSTGRES_PASSWORD: password },
		stdin: input === undefined ? "ignore" : new Blob([input]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(process.stdout).arrayBuffer(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (code) throw new Error(`Docker ${args[0]} failed: ${stderr}`);
	return stdout;
}
async function cleanup() {
	await Promise.allSettled(clients.map((client) => client.end()));
	await rm(fixtureDirectory, { recursive: true, force: true });
	const running = [...containers];
	containers.clear();
	await Promise.all(running.map((container) => docker(["rm", "-f", container])));
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		void cleanup().finally(() => process.exit(1));
	});
}

async function startPostgres(container: string, image: string) {
	await docker([
		"run",
		"-d",
		"--name",
		container,
		"--tmpfs",
		"/var/lib/postgresql:rw",
		"-e",
		"POSTGRES_PASSWORD",
		"-p",
		"127.0.0.1::5432",
		image,
	]);
	containers.add(container);
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			await docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
			const output = await docker(["port", container, "5432/tcp"]);
			return Number(new TextDecoder().decode(output).trim().split(":").at(-1));
		} catch {
			await Bun.sleep(500);
		}
	}
	throw new Error(`${image} did not become ready`);
}

async function connect(port: number, database = "postgres") {
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

async function initializeSchema(db: Client) {
	for (const file of ["01-init.sql", "02-create-auth.sql", "03-create-app.sql"]) {
		await db.query(await readFile(new URL(`database/init-sql/${file}`, root), "utf8"));
	}
	await db.query("SET search_path = public, pg_catalog");
}

async function restore(database: string) {
	const dump = await docker([
		"exec",
		sourceName,
		"pg_dump",
		"-U",
		"postgres",
		"--format=custom",
		"postgres",
	]);
	await docker(
		[
			"exec",
			"-i",
			targetName,
			"pg_restore",
			"--single-transaction",
			"-U",
			"postgres",
			"-d",
			database,
		],
		dump,
	);
}

try {
	const sourcePort = await startPostgres(sourceName, "postgres:18.7");
	const targetPort = await startPostgres(targetName, "postgres:19.0");
	const db = await connect(sourcePort);
	const target = await connect(targetPort);
	await initializeSchema(db);
	await initializeSchema(target);
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
	assert.equal(await schemaFingerprint(target), baseline, "Fresh PostgreSQL 19 schema drift");
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
	await target.query("CREATE DATABASE restored");
	await restore("restored");
	const restored = await connect(targetPort, "restored");
	async function cli(mode: "plan" | "apply") {
		const process = Bun.spawn(
			[Bun.which("bun")!, new URL("cli.ts", import.meta.url).pathname, mode],
			{
				env: {
					...Bun.env,
					MIGRATION_DIRECTORY: fixtureDirectory,
					MIGRATION_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${targetPort}/restored`,
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
	console.log("PASS PostgreSQL 18 → 19 dump/restore preserves fixture before adoption");
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
	const other = await connect(targetPort, "restored");
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
	await db.query("ALTER TABLE account DROP COLUMN issuer");
	const versionedDir = new URL("database/versioned/", root);
	const files = (await readdir(versionedDir)).filter((file) => file.endsWith(".sql")).sort();
	const migrations = await Promise.all(
		files.map(async (file) => ({
			id: file.slice(0, -4),
			sql: await readFile(new URL(file, versionedDir), "utf8"),
		})),
	);
	await migrate(db, baseline, migrations, "apply");
	await target.query("CREATE DATABASE upgraded");
	await restore("upgraded");
	const upgraded = await connect(targetPort, "upgraded");
	assert.deepEqual(await snapshot(upgraded), await snapshot(db));
	const history = "SELECT * FROM bastiondesk_meta.migrations ORDER BY id";
	assert.deepEqual((await upgraded.query(history)).rows, (await db.query(history)).rows);
	assert.deepEqual(await migrate(upgraded, baseline, migrations), {
		adopted: true,
		pending: [],
	});
	console.log("PASS PostgreSQL 18 → 19 dump/restore preserves applied history and fingerprint");
} finally {
	await cleanup();
	console.log("Isolated PostgreSQL containers removed");
}
