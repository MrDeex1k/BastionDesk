import { z } from "zod";
import {
	providerLookups,
	type IndicatorLookup,
	type LookupProvider,
	type ProviderReply,
} from "../core/ioc/provider-lookups";
import { organizationApiKey } from "./organization-api-key";

const nonnegative = z.number().int().min(0).max(1_000_000);
const otxReport = z.object({ pulse_info: z.object({ count: nonnegative }) });
const hybridSearch = z.object({
	sha256s: z.array(z.string()),
	reports: z.array(
		z.object({
			state: z.string(),
			verdict: z.string().nullish(),
			threat_level_human: z.string().nullish(),
			threat_score: z.number().nullish(),
			analysis_start_time: z.string().nullish(),
		}),
	),
});
const vtReport = z.object({
	data: z.object({
		id: z.string(),
		type: z.literal("file"),
		attributes: z.object({
			last_analysis_date: z.number().int().min(0).max(253_402_300_799).optional(),
			last_analysis_stats: z
				.object({
					malicious: nonnegative,
					suspicious: nonnegative,
					harmless: nonnegative,
					undetected: nonnegative,
				})
				.optional(),
		}),
	}),
});

async function readReport(response: Response): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Missing report");
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let body = "";
	let size = 0;
	try {
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			size += part.value.byteLength;
			if (size > 4 * 1024 * 1024) throw new Error("Report exceeds size limit");
			body += decoder.decode(part.value, { stream: true });
		}
		return JSON.parse(body + decoder.decode());
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

function retryAfterMs(header: string | null) {
	const wait =
		header && /^\d+$/.test(header)
			? Number(header) * 1000
			: Date.parse(header ?? "") - Date.now();
	return Number.isFinite(wait) ? Math.max(60_000, wait) : 60_000;
}

type Fetch = (input: URL, init: RequestInit) => Promise<Response>;
async function query(
	fetcher: Fetch,
	url: URL,
	request: RequestInit,
	interpret: (body: unknown) => ProviderReply,
): Promise<ProviderReply> {
	const headers = new Headers(request.headers);
	headers.set("Accept", "application/json");
	const response = await fetcher(url, {
		...request,
		headers,
		redirect: "error",
		signal: AbortSignal.timeout(6000),
	});
	if (response.status === 200) return interpret(await readReport(response));
	await response.body?.cancel().catch(() => {});
	if (response.status === 404) return { status: "not_found" };
	if (response.status === 429)
		return {
			status: "rate_limited",
			retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
		};
	return { status: "unavailable" };
}

const otxKinds = {
	ipv4: "IPv4",
	ipv6: "IPv6",
	domain: "domain",
	md5: "file",
	sha1: "file",
	sha256: "file",
} as const;

function toDate(value: string | null | undefined) {
	if (!value) return undefined;
	const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
		? `${value.replace(" ", "T")}Z`
		: value;
	const time = Date.parse(normalized);
	if (!Number.isNaN(time)) return new Date(time).toISOString();
}

export function threatIntelligenceAdapters(
	fetcher: Fetch = fetch,
): Record<LookupProvider, IndicatorLookup["lookup"]> {
	return {
		otx: ({ kind, value }, key) => {
			const type = kind === "url" ? undefined : otxKinds[kind];
			if (!type) return Promise.resolve({ status: "unavailable" });
			const url = new URL(
				`https://otx.alienvault.com/api/v1/indicators/${type}/${encodeURIComponent(value)}/general`,
			);
			return query(fetcher, url, { headers: { "X-OTX-API-KEY": key } }, (body) => {
				const count = otxReport.parse(body).pulse_info.count;
				return count
					? { status: "ready", summary: { kind: "pulses", count } }
					: { status: "not_found" };
			});
		},
		hybrid_analysis: ({ value }, key) => {
			const url = new URL("https://hybrid-analysis.com/api/v2/search/hash");
			url.searchParams.set("hash", value);
			return query(
				fetcher,
				url,
				{
					method: "GET",
					headers: { "api-key": key, "User-Agent": "BastionDesk/1.0" },
				},
				(body) => {
					const { sha256s, reports } = hybridSearch.parse(body);
					if (!reports.length) return { status: "not_found" };
					if (sha256s.length !== 1 || sha256s[0]?.toLowerCase() !== value)
						return { status: "unavailable" };
					const latest = reports
						.filter(({ state }) => state === "SUCCESS")
						.map((report) => ({
							...report,
							analysisAt: toDate(report.analysis_start_time),
						}))
						.sort((a, b) => (b.analysisAt ?? "").localeCompare(a.analysisAt ?? ""))[0];
					if (!latest) return { status: "unavailable" };
					const raw = (latest.verdict ?? latest.threat_level_human)?.toLowerCase();
					const verdict =
						raw === "malicious" || raw === "suspicious" || raw === "benign"
							? raw
							: "unknown";
					const score = latest.threat_score;
					return {
						status: "ready",
						summary: {
							kind: "sandbox",
							verdict,
							score:
								typeof score === "number" && score >= 0 && score <= 100
									? score
									: undefined,
							analysisAt: latest.analysisAt,
						},
					};
				},
			);
		},
		virustotal: ({ value }, key) => {
			const url = new URL(
				`https://www.virustotal.com/api/v3/files/${encodeURIComponent(value)}`,
			);
			return query(fetcher, url, { headers: { "x-apikey": key } }, (body) => {
				const { data } = vtReport.parse(body);
				if (data.id.toLowerCase() !== value) return { status: "unavailable" };
				const { last_analysis_date: date, last_analysis_stats: stats } = data.attributes;
				if (!stats) return { status: "unavailable" };
				return {
					status: "ready",
					summary: {
						kind: "engines",
						malicious: stats.malicious,
						suspicious: stats.suspicious,
						evaluated:
							stats.malicious + stats.suspicious + stats.harmless + stats.undetected,
						analysisAt:
							date === undefined ? undefined : new Date(date * 1000).toISOString(),
					},
				};
			});
		},
	};
}

export function configuredProviderLookups(env = process.env) {
	const adapters = threatIntelligenceAdapters();
	const directories = {
		otx: env.OTX_KEYS_DIR,
		hybrid_analysis: env.HYBRID_ANALYSIS_KEYS_DIR,
		virustotal: env.VIRUSTOTAL_KEYS_DIR,
	};
	const configured: Partial<Record<LookupProvider, IndicatorLookup>> = {};
	for (const provider of ["otx", "hybrid_analysis", "virustotal"] as const) {
		const directory = directories[provider];
		if (directory)
			configured[provider] = {
				keyFor: organizationApiKey(directory),
				lookup: adapters[provider],
			};
	}
	return providerLookups(configured);
}
