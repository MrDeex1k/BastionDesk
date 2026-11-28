import { isPublicIp, type FeedLookup, type ReputationResult } from "./enrichment";
import { incidentIndicators } from "./evidence";
import {
	lookupEligibility,
	type LookupIndicator,
	type LookupProvider,
	type LookupResult,
} from "./provider-lookups";

export type EnrichmentProvider = "abuseipdb" | "urlhaus" | LookupProvider;
export type EnrichmentTarget = LookupIndicator & { provider: EnrichmentProvider };
export type EnrichmentResult = ReputationResult | FeedLookup<"urlhaus"> | LookupResult;
export type EnrichmentCheck = EnrichmentTarget & {
	result: EnrichmentResult | null;
	retryAt: string | null;
};
export type EnrichmentInput = Parameters<typeof incidentIndicators>[0];
export type EnrichmentPlanner = (
	organizationId: string,
	input: EnrichmentInput,
) => Promise<EnrichmentTarget[]>;

export function enrichmentEligibility({ provider, kind, value }: EnrichmentTarget) {
	if (provider === "urlhaus") return kind === "url" ? "allowed" : "unsupported";
	if (provider === "abuseipdb") {
		if (kind !== "ipv4" && kind !== "ipv6") return "unsupported";
		return isPublicIp(value) ? "allowed" : "not_public";
	}
	return lookupEligibility(provider, { kind, value });
}

export function enrichmentTargets(
	input: EnrichmentInput,
	providers: readonly EnrichmentProvider[],
) {
	return incidentIndicators(input).flatMap(({ kind, value }) =>
		providers
			.map((provider) => ({ provider, kind, value }))
			.filter((target) => enrichmentEligibility(target) === "allowed"),
	);
}

export function enrichmentSucceeded(result: EnrichmentResult) {
	return (
		result.status === "ready" || result.status === "matched" || result.status === "not_found"
	);
}

export function enrichmentCooldown(target: EnrichmentTarget, result: EnrichmentResult) {
	if (!enrichmentSucceeded(result)) {
		const seconds = "retryAfterMs" in result ? Math.ceil((result.retryAfterMs ?? 0) / 1000) : 0;
		return Math.max(60, seconds);
	}
	if (target.kind === "md5" || target.kind === "sha1" || target.kind === "sha256") return 86_400;
	if ("expiresAt" in result)
		return Math.max(0, Math.ceil((Date.parse(result.expiresAt) - Date.now()) / 1000));
	if ("result" in result)
		return Math.max(0, Math.ceil((Date.parse(result.result.expiresAt) - Date.now()) / 1000));
	return 0;
}
