import type { Client } from "pg";
import { checksum, schemaFingerprint } from "./schema";

export interface Migration {
	id: string;
	sql: string;
}

interface Applied {
	id: string;
	checksum: string;
	schema_hash: string;
}

/** Owns the transaction. Supply a dedicated, connected Client, never a pool. */
export async function migrate(
	client: Client,
	baseline: string,
	migrations: readonly Migration[],
	mode: "plan" | "apply" = "plan",
): Promise<{ adopted: boolean; pending: string[] }> {
	if (!/^[a-f0-9]{64}$/.test(baseline)) throw new Error("INVALID_BASELINE");
	for (const [i, migration] of migrations.entries()) {
		if (
			!/^\d{4}_[a-z0-9_]+$/.test(migration.id) ||
			!migration.id.startsWith(`${String(i + 1).padStart(4, "0")}_`) ||
			!migration.sql.trim()
		) {
			throw new Error("INVALID_MIGRATION_ORDER");
		}
	}
	await client.query("BEGIN");
	try {
		await client.query("SET LOCAL search_path = public, pg_catalog");
		await client.query("SET LOCAL lock_timeout = '10s'");
		await client.query("SET LOCAL statement_timeout = '60s'");
		await client.query("SELECT pg_advisory_xact_lock(186231, 2)");
		const version = await client.query("SHOW server_version_num");
		if (Math.floor(Number(version.rows[0].server_version_num) / 10000) !== 18) {
			throw new Error("UNSUPPORTED_POSTGRES_VERSION");
		}
		const exists = await client.query(
			"SELECT to_regclass('bastiondesk_meta.migrations') AS registry",
		);
		const applied: Applied[] = exists.rows[0].registry
			? (
					await client.query<Applied>(
						'SELECT id, checksum, schema_hash FROM bastiondesk_meta.migrations ORDER BY id COLLATE "C"',
					)
				).rows
			: [];
		if (exists.rows[0].registry && applied.length === 0)
			throw new Error("EMPTY_MIGRATION_HISTORY");
		const history = [{ id: "0000_baseline_1_0_3", sql: baseline }, ...migrations];
		for (const [i, row] of applied.entries()) {
			const expected = history[i];
			if (!expected || row.id !== expected.id || row.checksum !== checksum(expected.sql)) {
				throw new Error("MIGRATION_HISTORY_MISMATCH");
			}
		}
		const currentHash = await schemaFingerprint(client);
		if (currentHash !== (applied.at(-1)?.schema_hash ?? baseline)) {
			throw new Error("SCHEMA_DRIFT");
		}
		const pending = history.slice(applied.length);
		if (mode === "apply" && pending.length) {
			await client.query(`CREATE SCHEMA IF NOT EXISTS bastiondesk_meta;
				CREATE TABLE IF NOT EXISTS bastiondesk_meta.migrations (
					id text PRIMARY KEY, checksum text NOT NULL, schema_hash text NOT NULL,
					applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
				)`);
			for (const migration of pending) {
				if (migration.id !== "0000_baseline_1_0_3") await client.query(migration.sql);
				await client.query(
					"INSERT INTO bastiondesk_meta.migrations (id, checksum, schema_hash) VALUES ($1,$2,$3)",
					[migration.id, checksum(migration.sql), await schemaFingerprint(client)],
				);
			}
		}
		await client.query(mode === "apply" ? "COMMIT" : "ROLLBACK");
		return { adopted: applied.length > 0, pending: pending.map((entry) => entry.id) };
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
}
