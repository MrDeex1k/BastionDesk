import { createHash } from "node:crypto";
import { isPublicIp } from "./enrichment";
import type { IndicatorKind } from "./observations";

export const lookupProviders = ["otx", "hybrid_analysis", "virustotal"] as const;
export type LookupProvider = (typeof lookupProviders)[number];
export type LookupIndicator = { kind: IndicatorKind; value: string };

export type ProviderSummary =
	| { kind: "pulses"; count: number }
	| {
			kind: "sandbox";
			verdict: "malicious" | "suspicious" | "benign" | "unknown";
			score?: number;
			analysisAt?: string;
	  }
	| {
			kind: "engines";
			malicious: number;
			suspicious: number;
			evaluated: number;
			analysisAt?: string;
	  };

type Report = { status: "ready"; summary: ProviderSummary } | { status: "not_found" };
export type ProviderReply =
	Report | { status: "rate_limited"; retryAfterMs: number } | { status: "unavailable" };
type TimedReport = Report & { fetchedAt: string; expiresAt: string };
export type LookupResult = { provider: LookupProvider } & (
	| TimedReport
	| { status: "not_configured" | "not_public" | "unsupported" | "unavailable" }
	| { status: "rate_limited"; deferredMs?: number; retryAfterMs?: number }
);
export interface IndicatorLookup {
	keyFor(organizationId: string): Promise<string | undefined>;
	lookup(indicator: LookupIndicator, key: string): Promise<ProviderReply>;
}

const hashLengths = { md5: 32, sha1: 40, sha256: 64 };
const localDomains =
	/(?:^|\.)(?:alt|corp|example|home|internal|invalid|lan|local|localhost|onion|test|home\.arpa|example\.com|example\.net|example\.org)$/i;

export function lookupEligibility(provider: LookupProvider, { kind, value }: LookupIndicator) {
	if (kind in hashLengths) {
		if (provider !== "otx" && kind !== "sha256") return "unsupported";
		const size = hashLengths[kind as keyof typeof hashLengths];
		return value.length === size && /^[a-f0-9]+$/.test(value) ? "allowed" : "unsupported";
	}
	if (provider !== "otx") return "unsupported";
	if (kind === "ipv4" || kind === "ipv6") return isPublicIp(value) ? "allowed" : "not_public";
	if (kind === "domain") return localDomains.test(value) ? "not_public" : "allowed";
	return "unsupported";
}

const reportTtl = 60 * 60_000;
const missingTtl = 15 * 60_000;
const minute = 60_000;
const day = 24 * 60 * minute;
const maxDailyRequests = 50;

export function providerLookups(
	providers: Partial<Record<LookupProvider, IndicatorLookup>>,
	now = Date.now,
) {
	const cache = new Map<string, TimedReport>();
	const pending = new Map<string, Promise<LookupResult>>();
	const budgets = new Map<string, { starts: number[]; next: number }>();

	return {
		async enabled(org: string) {
			const keys = await Promise.all(
				lookupProviders.map(async (name) =>
					providers[name]?.keyFor(org).catch(() => undefined),
				),
			);
			return lookupProviders.filter((_, index) => Boolean(keys[index]));
		},
		async check(
			org: string,
			provider: LookupProvider,
			indicator: LookupIndicator,
		): Promise<LookupResult> {
			const allowed = lookupEligibility(provider, indicator);
			if (allowed !== "allowed") return { provider, status: allowed };
			const adapter = providers[provider];
			const apiKey = await adapter?.keyFor(org).catch(() => undefined);
			if (!adapter || !apiKey) return { provider, status: "not_configured" };

			const budgetKey = `${provider}:${createHash("sha256").update(apiKey).digest("hex")}`;
			const cacheKey = JSON.stringify([org, budgetKey, indicator.kind, indicator.value]);
			const current = now();
			const saved = cache.get(cacheKey);
			if (saved && Date.parse(saved.expiresAt) > current) return { provider, ...saved };
			const active = pending.get(cacheKey);
			if (active) return active;

			const budget = budgets.get(budgetKey) ?? { starts: [], next: 0 };
			budget.starts = budget.starts.filter((start) => start > current - day);
			const dailyReset =
				budget.starts.length >= maxDailyRequests ? budget.starts[0]! + day : 0;
			const allowedAt = Math.max(budget.next, dailyReset);
			if (current < allowedAt)
				return { provider, status: "rate_limited", deferredMs: allowedAt - current };
			if (pending.size >= 24) return { provider, status: "unavailable" };

			budget.next = current + minute / 4;
			budget.starts.push(current);
			budgets.set(budgetKey, budget);
			const request = Promise.resolve()
				.then(() => adapter.lookup(indicator, apiKey))
				.then((reply): LookupResult => {
					if (reply.status === "rate_limited") {
						budget.next = Math.max(budget.next, now() + reply.retryAfterMs);
						return { provider, status: reply.status, retryAfterMs: reply.retryAfterMs };
					}
					if (reply.status === "unavailable") return { provider, status: reply.status };
					const fetched = now();
					const ttl =
						indicator.kind in hashLengths
							? day
							: reply.status === "ready"
								? reportTtl
								: missingTtl;
					const result: TimedReport = {
						...reply,
						fetchedAt: new Date(fetched).toISOString(),
						expiresAt: new Date(fetched + ttl).toISOString(),
					};
					cache.delete(cacheKey);
					if (cache.size >= 512) {
						const oldest = cache.keys().next().value;
						if (oldest !== undefined) cache.delete(oldest);
					}
					cache.set(cacheKey, result);
					return { provider, ...result };
				})
				.catch((): LookupResult => ({ provider, status: "unavailable" }))
				.finally(() => pending.delete(cacheKey));
			pending.set(cacheKey, request);
			return request;
		},
	};
}

export type ProviderLookups = ReturnType<typeof providerLookups>;
