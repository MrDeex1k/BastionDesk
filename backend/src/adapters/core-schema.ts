import { getPgPool } from "../lib/database";
import type { Pool } from "pg";

/** Startup gate only; DDL remains an explicit operator migration. */
export async function assertCoreSchema(pool: Pick<Pool, "query"> = getPgPool()) {
	const tables = await pool.query<{ ready: boolean }>(`SELECT
		to_regclass('bastiondesk_meta.migrations') IS NOT NULL
		AND to_regclass('public.core_command_receipts') IS NOT NULL
		AND to_regclass('public.core_audit') IS NOT NULL AS ready`);
	if (!tables.rows[0]?.ready)
		throw new Error("CORE_MIGRATIONS_REQUIRED: run bun run db:migrate:apply before startup");
	const history = await pool.query("SELECT id FROM bastiondesk_meta.migrations WHERE id = $1", [
		"0001_core_operations",
	]);
	if (!history.rowCount) throw new Error("CORE_MIGRATIONS_REQUIRED: missing migration history");
}
