import { z } from "zod";
import { identityIdSchema } from "../contracts";
import { getPgPool, closeDatabase } from "../lib/database";
import { jobStore } from "./store";

// Trusted operator CLI, never exposed as a public API or role bypass for users.
try {
	const [mode, organization, jobId, operator] = process.argv.slice(2);
	const organizationId = identityIdSchema.parse(organization);
	if (mode === "list" && process.argv.length === 4) {
		const result = await getPgPool().query(
			`SELECT id, state, attempts, last_error, available_at,
   created_at FROM core_jobs WHERE organization_id=$1 AND state <> 'completed'
   ORDER BY created_at LIMIT 100`,
			[organizationId],
		);
		console.log(JSON.stringify(result.rows));
	} else if (mode === "replay" && process.argv.length === 6) {
		const replayed = await jobStore(getPgPool()).replay(
			z.uuid().parse(jobId),
			organizationId,
			identityIdSchema.parse(operator),
		);
		console.log(JSON.stringify({ replayed }));
		if (!replayed) process.exitCode = 1;
	} else throw new Error("USAGE");
} catch {
	console.error(
		"JOB_OPERATION_FAILED: use list <organization> or replay <organization> <job UUID> <operator ID>",
	);
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
