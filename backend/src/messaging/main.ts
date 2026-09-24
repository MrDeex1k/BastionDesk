import { safeWorkerError } from "./diagnostics";
import { startTelemetry, queueMetrics } from "./telemetry";
import { Effect } from "effect";
import { openBroker, publishConfirmed } from "./broker";
import { jobStore } from "./store";
import { classificationJob } from "./worker";
import { getPgPool, closeDatabase } from "../lib/database";
import { classifyIncident } from "../lib/llm-client";
import { assertCoreSchema } from "../adapters/core-schema";
import { env } from "../lib/env";

// Deadline must leave enough time to commit before the lease expires.
if (env.LLM_RPC_TIMEOUT_MS <= 0 || env.LLM_RPC_TIMEOUT_MS > 90000)
	throw new Error("WORKER_LLM_TIMEOUT_MUST_BE_BETWEEN_1_AND_90000");
const telemetry = startTelemetry("bastiondesk-classifier");
await assertCoreSchema();
const store = jobStore(getPgPool());
let stopping = false;
let lastRelay = 0;
let broker: Awaited<ReturnType<typeof openBroker>> | undefined;
const health = Bun.serve({
	port: 3334,
	fetch: () =>
		new Response(
			JSON.stringify({
				status: !stopping && Date.now() - lastRelay < 15000 ? "ready" : "degraded",
			}),
			{
				status: !stopping && Date.now() - lastRelay < 15000 ? 200 : 503,
				headers: { "content-type": "application/json" },
			},
		),
});
const active = new Set<Promise<unknown>>();
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.once(signal, () => {
		stopping = true;
		void broker?.connection.close().catch(() => {});
	});
try {
	while (!stopping) {
		try {
			broker = await openBroker();
			const current = broker;
			let closed = false;
			current.connection.once("close", () => {
				closed = true;
				lastRelay = 0;
			});
			await current.consume(async ({ jobId }, parent) => {
				const task = Effect.runPromise(
					classificationJob(store, { classify: classifyIncident }, jobId, parent),
				);
				active.add(task);
				try {
					const outcome = await task;
					console.info(`[MESSAGING] Delivery handled ${jobId} ${outcome}`);
				} finally {
					active.delete(task);
				}
			});
			while (!stopping && !closed) {
				const jobs = await store.dispatchBatch();
				for (const job of jobs) {
					if (stopping || closed) break;
					await publishConfirmed(
						current.publisher,
						job.id,
						job.state === "dead",
						job.traceparent,
					);
					if (job.state === "dead") await store.publishedDead(job.id);
				}
				queueMetrics(await store.metrics());
				lastRelay = Date.now();
				await Bun.sleep(1000);
			}
		} catch (error) {
			lastRelay = 0;
			console.error(
				"[MESSAGING] Worker reconnecting; jobs remain in PostgreSQL",
				safeWorkerError(error),
			);
		} finally {
			await broker?.connection.close().catch(() => {});
			broker = undefined;
		}
		if (!stopping) await Bun.sleep(2000);
	}
	await Promise.allSettled(active);
} finally {
	await health.stop(true);
	await closeDatabase();
	await telemetry.shutdown();
}
