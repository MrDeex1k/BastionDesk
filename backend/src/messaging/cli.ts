import { z } from "zod";
import { listJobs, listOptions } from "./operations";
import { identityIdSchema } from "../contracts";
import { getPgPool, closeDatabase } from "../lib/database";
import { jobStore } from "./store";

// Trusted operator CLI, never exposed as a public API or role bypass for users.
try {
	const [mode, organization, jobId, cursor] = process.argv.slice(2);
	const organizationId = identityIdSchema.parse(organization);
	if (mode === "list" && process.argv.length <= 6) {
		const options = listOptions.parse({ state: jobId, after: cursor });
		console.log(JSON.stringify(await listJobs(getPgPool(), organizationId, options)));
	} else if (mode === "replay" && process.argv.length === 5) {
		const replayed = await jobStore(getPgPool()).replay(z.uuid().parse(jobId), organizationId);
		console.log(JSON.stringify({ replayed }));
		if (!replayed) process.exitCode = 1;
	} else throw new Error("USAGE");
} catch {
	console.error(
		"JOB_OPERATION_FAILED: use list <organization> [active|pending|running|dead] [after UUID] or replay <organization> <job UUID>",
	);
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
