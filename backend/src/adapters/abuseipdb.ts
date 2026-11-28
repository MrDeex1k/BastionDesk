import { isIP } from "node:net";
import { z } from "zod";
import { ipReputation, type ReputationProvider } from "../core/ioc/enrichment";
import { organizationApiKey } from "./organization-api-key";

export function configuredIpReputation(directory = process.env.ABUSEIPDB_KEYS_DIR) {
	if (!directory) return undefined;
	return ipReputation(organizationApiKey(directory), abuseIpDb());
}

const responseSchema = z.object({
	data: z.object({
		ipAddress: z.string(),
		abuseConfidenceScore: z.number().int().min(0).max(100),
		totalReports: z.number().int().nonnegative(),
	}),
});
type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

export function abuseIpDb(fetcher: Fetch = fetch): ReputationProvider {
	return {
		name: "abuseipdb",
		async lookup(address, token) {
			const url = new URL("https://api.abuseipdb.com/api/v2/check");
			url.searchParams.set("ipAddress", address);
			let response: Response | undefined;
			for (let attempt = 0; attempt < 2; attempt++) {
				response = await fetcher(url, {
					headers: { Key: token, Accept: "application/json" },
					redirect: "error",
					signal: AbortSignal.timeout(2500),
				}).catch(() => undefined);
				if (response && (response.status < 500 || attempt === 1)) break;
				await response?.body?.cancel().catch(() => {});
			}
			if (response?.status === 429) {
				const header = response.headers.get("retry-after");
				const delay = header !== null && /^\d+$/.test(header) ? Number(header) : NaN;
				await response.body?.cancel().catch(() => {});
				return {
					status: "rate_limited",
					retryAfterSeconds: Number.isFinite(delay)
						? Math.min(86_400, Math.max(30, delay))
						: 60,
				};
			}
			if (!response?.ok) {
				await response?.body?.cancel().catch(() => {});
				return { status: "unavailable" };
			}
			const { data } = responseSchema.parse(await response.json());
			const reported =
				isIP(data.ipAddress) === 6
					? new URL(`http://[${data.ipAddress}]`).hostname.slice(1, -1)
					: data.ipAddress;
			if (reported !== address) return { status: "unavailable" };
			return {
				status: "ready",
				confidence: data.abuseConfidenceScore,
				reports: data.totalReports,
			};
		},
	};
}
