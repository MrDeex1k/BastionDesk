import type { Pool } from "pg";

export async function assertYaraSchema(pool: Pick<Pool, "query">) {
	const result = await pool.query<{ ready: boolean }>(`SELECT
		to_regclass('public.yara_scan_jobs') IS NOT NULL
		AND to_regclass('public.yara_attachments') IS NOT NULL
    AND to_regclass('public.yara_attachment_history') IS NOT NULL
		AND to_regclass('public.yara_rule_sets') IS NOT NULL
		AND to_regclass('public.yara_active_rule_sets') IS NOT NULL
		AND EXISTS (SELECT 1 FROM bastiondesk_meta.migrations WHERE id='0005_yara_attachments') AS ready`);
	if (!result.rows[0]?.ready)
		throw new Error("YARA_MIGRATIONS_REQUIRED: run bun run db:migrate:apply before startup");
}
