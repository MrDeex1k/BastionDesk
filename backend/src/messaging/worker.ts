import { traced, jobMetric, jobSpanDetails, SpanKind } from "./telemetry";
import { failureDecision } from "./contract";
import { Effect } from "effect";
import type { JobStore } from "./store";

export interface Classifier {
	classify(id: string, description: string): Promise<string>;
}
/** Claim/finish are durable; external computation may repeat after a crashed lease. */
export function classificationJob(
	store: JobStore,
	classifier: Classifier,
	id: string,
	parent?: string,
) {
	return Effect.tryPromise({
		try: async () => {
			const job = await store.claim(id);
			if (!job) {
				jobMetric("duplicate", 0);
				return "duplicate" as const;
			}
			const started = performance.now();
			return traced(
				"incident.classify",
				parent ?? job.traceparent,
				SpanKind.CONSUMER,
				async () => {
					jobSpanDetails(job.id, job.correlation_id, job.attempts);
					const execute = async () => {
						const description = await store.description(job);
						if (description === null) {
							await store.fail(job, "INCIDENT_NOT_FOUND", false);
							return "dead" as const;
						}
						let category: string;
						try {
							category = await classifier.classify(job.incident_id, description);
						} catch (error) {
							const value = error as { retryable?: unknown; code?: unknown } | null;
							const code =
								typeof value?.code === "string" && /^[A-Z_]{1,64}$/.test(value.code)
									? value.code
									: "CLASSIFIER_FAILURE";
							const retryable = value?.retryable !== false;
							await store.fail(job, code, retryable);
							return failureDecision(job.attempts, retryable).state === "dead"
								? ("dead" as const)
								: ("retry" as const);
						}
						return (await store.complete(job, category))
							? ("completed" as const)
							: ("stale" as const);
					};
					try {
						const outcome = await execute();
						jobMetric(outcome, performance.now() - started);
						return outcome;
					} catch (error) {
						jobMetric("storage_error", performance.now() - started);
						throw error;
					}
				},
			);
		},
		catch: () => new Error("JOB_STORAGE_UNAVAILABLE"),
	});
}
