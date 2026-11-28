import { createHash } from "node:crypto";
import { openBroker, publishConfirmed } from "../messaging/broker";
import { yaraTopology } from "../messaging/contract";
import { assertYaraSchema } from "./schema";
import { scanWorkerStore } from "./store";
import { yaraScanner } from "./scanner";
import { workerDependencies } from "./worker-dependencies";

const { pool, fileStore } = workerDependencies(process.env);
await assertYaraSchema(pool);
const store = scanWorkerStore(pool);
const scanner = yaraScanner();
let broker: Awaited<ReturnType<typeof openBroker>> | undefined;
let active: Promise<void> | undefined;
let stopping = false;
let lastRelay = 0;
const health = Bun.serve({
	hostname: "127.0.0.1",
	port: 3343,
	fetch: () =>
		new Response(null, {
			status: !stopping && Date.now() - lastRelay < 15_000 ? 204 : 503,
		}),
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.once(signal, () => {
		stopping = true;
		void broker?.connection.close().catch(() => {});
	});

try {
	while (!stopping) {
		try {
			broker = await openBroker(process.env, yaraTopology);
			const current = broker;
			let closed = false;
			current.connection.once("close", () => {
				closed = true;
			});
			await current.consume(async ({ jobId }) => {
				active = scan(jobId);
				try {
					await active;
				} finally {
					active = undefined;
				}
			});
			while (!stopping && !closed) {
				for (const job of await store.dispatch()) {
					if (stopping || closed) break;
					await publishConfirmed(
						current.publisher,
						job.id,
						job.state === "dead",
						undefined,
						yaraTopology,
					);
					await store.published(job.id, job.publication_token);
				}
				lastRelay = Date.now();
				await Bun.sleep(1000);
			}
		} catch {
			lastRelay = 0;
			console.error("[YARA] Worker reconnecting; jobs remain in PostgreSQL");
		} finally {
			await broker?.connection.close().catch(() => {});
			await active?.catch(() => {});
			broker = undefined;
		}
		if (!stopping) await Bun.sleep(2000);
	}
} finally {
	await health.stop(true);
	await pool.end();
}

async function scan(id: string) {
	const job = await store.claim(id);
	if (!job) return;
	const { rules, sources } = await store.input(job);
	let matches: string[];
	try {
		let file: Buffer | null = null;
		for (const { storage_key } of sources) {
			const candidate = await fileStore.read(storage_key).catch(() => null);
			if (
				candidate &&
				createHash("sha256").update(candidate).digest("hex") === job.content_hash
			) {
				file = candidate;
				break;
			}
		}
		if (!file) throw new Error("ATTACHMENT_UNAVAILABLE");
		matches = await scanner.scan(rules, file);
	} catch {
		await store.fail(job, true);
		return;
	}
	await store.complete(job, matches);
}
