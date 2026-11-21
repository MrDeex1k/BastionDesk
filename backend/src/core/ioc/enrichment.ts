import { BlockList, isIP } from "node:net";

export type Reputation = {
	provider: "abuseipdb";
	address: string;
	confidence: number;
	reports: number;
	fetchedAt: string;
	expiresAt: string;
};

type Failure = "not_configured" | "not_public" | "unavailable" | "rate_limited";
export type ReputationResult = { status: "ready"; result: Reputation } | { status: Failure };
export type ProviderReply =
	| { status: "ready"; confidence: number; reports: number }
	| { status: "rate_limited"; retryAfterSeconds: number }
	| { status: "unavailable" };
export type ReputationProvider = {
	name: Reputation["provider"];
	lookup(address: string, token: string): Promise<ProviderReply>;
};
type KeyFor = (organizationId: string) => Promise<string | undefined>;

const blocked = new BlockList();
for (const [address, bits] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 3],
] as const)
	blocked.addSubnet(address, bits);
for (const [address, bits] of [
	["2001::", 23],
	["2001:db8::", 32],
	["2002::", 16],
	["3fff::", 20],
] as const)
	blocked.addSubnet(address, bits, "ipv6");
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");

export function isPublicIp(value: string) {
	const version = isIP(value);
	if (version === 4) return !blocked.check(value);
	return version === 6 && globalIPv6.check(value, "ipv6") && !blocked.check(value, "ipv6");
}

const cacheMs = 60 * 60 * 1000;
const maxCache = 512;
const maxPending = 24;

export function ipReputation(keyFor: KeyFor, provider: ReputationProvider, now = Date.now) {
	const cache = new Map<string, Reputation>();
	const pending = new Map<string, Promise<ReputationResult>>();
	const paused = new Map<
		string,
		{ until: number; status: "rate_limited" | "unavailable"; failures: number }
	>();

	async function lookup(org: string, address: string, token: string): Promise<ReputationResult> {
		const reply = await provider
			.lookup(address, token)
			.catch((): ProviderReply => ({ status: "unavailable" }));
		switch (reply.status) {
			case "rate_limited":
				paused.set(org, {
					until: now() + reply.retryAfterSeconds * 1000,
					status: "rate_limited",
					failures: 0,
				});
				return { status: "rate_limited" };
			case "unavailable": {
				const failures = (paused.get(org)?.failures ?? 0) + 1;
				paused.set(org, {
					until: failures >= 3 ? now() + 60_000 : 0,
					status: "unavailable",
					failures,
				});
				return { status: "unavailable" };
			}
			case "ready": {
				paused.delete(org);
				const fetched = now();
				return {
					status: "ready",
					result: {
						provider: provider.name,
						address,
						confidence: reply.confidence,
						reports: reply.reports,
						fetchedAt: new Date(fetched).toISOString(),
						expiresAt: new Date(fetched + cacheMs).toISOString(),
					},
				};
			}
		}
	}

	return {
		async enabled(org: string) {
			return Boolean(await keyFor(org).catch(() => undefined));
		},
		async check(org: string, address: string): Promise<ReputationResult> {
			if (!isPublicIp(address)) return { status: "not_public" };
			const token = await keyFor(org).catch(() => undefined);
			if (!token) return { status: "not_configured" };
			const key = JSON.stringify([org, address]);
			const found = cache.get(key);
			if (found && Date.parse(found.expiresAt) > now())
				return { status: "ready", result: found };
			const active = pending.get(key);
			if (active) return active;
			const blocked = paused.get(org);
			if (blocked && blocked.until > now()) return { status: blocked.status };
			if (pending.size >= maxPending) return { status: "unavailable" };
			const request = lookup(org, address, token)
				.then((value) => {
					if (value.status === "ready") {
						cache.delete(key);
						if (cache.size >= maxCache) {
							const oldest = cache.keys().next().value;
							if (oldest !== undefined) cache.delete(oldest);
						}
						cache.set(key, value.result);
					}
					return value;
				})
				.finally(() => pending.delete(key));
			pending.set(key, request);
			return request;
		},
	};
}
export type IpReputation = ReturnType<typeof ipReputation>;
