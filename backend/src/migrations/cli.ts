import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { migrationConfig } from "./config";
import { migrate } from "./runner";

const directory = process.env.MIGRATION_DIRECTORY
	? pathToFileURL(`${resolve(process.env.MIGRATION_DIRECTORY)}/`)
	: new URL("../../../database/versioned/", import.meta.url);
const mode = process.argv[2];
if (!["plan", "apply"].includes(mode ?? "") || process.argv.length !== 3) {
	console.error("Usage: bun backend/src/migrations/cli.ts plan|apply");
	process.exit(1);
}
let client: Client | undefined;
try {
	const baseline = JSON.parse(await readFile(new URL("baseline-1.0.3.json", directory), "utf8"));
	if (baseline.version !== "1.0.3") throw new Error("INVALID_BASELINE_VERSION");
	const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
	const migrations = await Promise.all(
		files.map(async (file) => ({
			id: file.slice(0, -4),
			sql: await readFile(new URL(file, directory), "utf8"),
		})),
	);
	client = new Client(await migrationConfig(process.env));
	await client.connect();
	console.log(
		JSON.stringify({
			mode,
			...(await migrate(client, baseline.fingerprint, migrations, mode as "plan" | "apply")),
		}),
	);
} catch (error) {
	// Never print connection strings, SQL data, server detail or credentials.
	const message = error instanceof Error ? error.message : "";
	console.error(/^[A-Z_]+$/.test(message) ? message : "MIGRATION_FAILED");
	process.exitCode = 1;
} finally {
	await client?.end();
}
