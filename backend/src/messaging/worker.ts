import { Effect } from "effect";
import type { JobStore } from "./store";

export interface Classifier {
	classify(id: string, description: string): Promise<string>;
}
/** Claim/finish are durable; external computation may repeat after a crashed lease. */
export function classificationJob(store: JobStore, classifier: Classifier, id: string) {
	return Effect.tryPromise({
		try: async () => {
			const job = await store.claim(id);
			if (!job) return "duplicate" as const;
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
				return "failed" as const;
			}
			return (await store.complete(job, category))
				? ("completed" as const)
				: ("stale" as const);
		},
		catch: () => new Error("JOB_STORAGE_UNAVAILABLE"),
	});
}
