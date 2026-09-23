import { z } from "zod";
import type { Pool } from "pg";

export const listOptions = z.object({
	state: z.enum(["active", "pending", "running", "dead"]).default("active"),
	after: z.uuid().optional(),
});
export async function listJobs(
	pool: Pool,
	organizationId: string,
	options: z.infer<typeof listOptions>,
) {
	const result = await pool.query(
		`SELECT id, state, attempts, last_error, available_at, created_at FROM core_jobs
   WHERE organization_id=$1 AND state <> 'completed' AND ($2='active' OR state=$2)
   AND ($3::uuid IS NULL OR id > $3::uuid) ORDER BY id LIMIT 101`,
		[organizationId, options.state, options.after ?? null],
	);
	const rows = result.rows.slice(0, 100);
	return { jobs: rows, nextCursor: result.rows.length > 100 ? rows.at(-1)?.id : null };
}
