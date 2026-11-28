import { iocLookupAudit } from "./core-ioc-audit";
import type { EnrichmentStore } from "./ioc-enrichment-store";
import {
	enrichmentTargets,
	type EnrichmentProvider,
	type EnrichmentResult,
	type EnrichmentTarget,
} from "../core/ioc/automatic";
import type { IpReputation } from "../core/ioc/enrichment";
import type { ProviderLookups } from "../core/ioc/provider-lookups";
import type { Urlhaus } from "./urlhaus";

export function enrichmentServices(
	lookups: ProviderLookups,
	reputation?: IpReputation,
	urlhaus?: Urlhaus,
) {
	async function enabled(org: string): Promise<EnrichmentProvider[]> {
		const [remote, ip, feed] = await Promise.all([
			lookups.enabled(org),
			reputation?.enabled(org),
			urlhaus?.enabled(),
		]);
		return [
			...remote,
			...(ip ? ["abuseipdb" as const] : []),
			...(feed ? ["urlhaus" as const] : []),
		];
	}
	return {
		enabled,
		plan: async (org: string, input: Parameters<typeof enrichmentTargets>[0]) =>
			enrichmentTargets(input, await enabled(org)),
		async check(org: string, target: EnrichmentTarget): Promise<EnrichmentResult> {
			switch (target.provider) {
				case "abuseipdb":
					return (
						(await reputation?.check(org, target.value)) ?? { status: "not_configured" }
					);
				case "urlhaus":
					return (
						(await urlhaus?.check(target.value)) ?? {
							provider: "urlhaus",
							status: "not_configured",
						}
					);
				default:
					return lookups.check(org, target.provider, target);
			}
		},
	};
}

export function startEnrichmentWorker(
	store: EnrichmentStore,
	services: ReturnType<typeof enrichmentServices>,
) {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running: Promise<void> | undefined;

	async function batch() {
		const jobs = await store.claim();
		const results = await Promise.allSettled(
			jobs.map(async (job) => {
				const result = await services.check(job.organizationId, job);
				if (
					"deferredMs" in result &&
					result.deferredMs &&
					Date.now() - job.queuedAt.getTime() < 48 * 60 * 60_000
				) {
					await store.defer(job, Math.max(1, Math.ceil(result.deferredMs / 1000)));
					return;
				}
				const { status } = result;
				const saved =
					"deferredMs" in result
						? { provider: result.provider, status: "rate_limited" as const }
						: result;
				await store.finish(job, saved, (client, id) =>
					iocLookupAudit(client, job.provider)(
						{
							organizationId: job.organizationId,
							subject: job.requestedBy ?? "ioc-enrichment",
							automatic: !job.requestedBy,
						},
						id,
						status,
					),
				);
			}),
		);
		if (results.some((result) => result.status === "rejected"))
			console.error("[IOC] Could not process one or more enrichment jobs");
	}

	function tick() {
		running = batch()
			.catch(() => console.error("[IOC] Could not claim enrichment jobs"))
			.finally(() => {
				if (!stopped) timer = setTimeout(tick, 2000);
			});
	}
	tick();
	return async () => {
		stopped = true;
		clearTimeout(timer);
		await running;
	};
}
