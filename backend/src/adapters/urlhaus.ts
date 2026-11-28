import { readFile } from "node:fs/promises";
import type { FeedLookup } from "../core/ioc/enrichment";
import { canonicalUrl } from "../core/ioc/observations";

export type UrlhausLookup = FeedLookup<"urlhaus">;
export type Urlhaus = ReturnType<typeof urlhaus>;

const refreshMs = 10 * 60_000;
const maxFeedBytes = 64 * 1024 * 1024;
const maxRowLength = 16_384;
const csvRow = /^(?:"\d+"|\d+),(?:"[^"\r\n]*"|[^,"\r\n]*),(?:"((?:[^"\r\n]|"")*)"|([^,"\r\n]+)),/;

class InvalidExport extends Error {}

async function readFeed(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const urls = new Set<string>();
	let bytes = 0;
	let remainder = "";

	function addRow(row: string) {
		if (row.length > maxRowLength) throw new InvalidExport("Export row exceeds size limit");
		if (!row.trim() || row.startsWith("#")) return;
		const columns = csvRow.exec(row);
		const url = columns?.[1] ?? columns?.[2];
		if (!url) throw new InvalidExport("Invalid export row");
		const value = canonicalUrl(url.replaceAll('""', '"'));
		if (value) urls.add(value);
	}

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxFeedBytes) throw new InvalidExport("Export exceeds size limit");
			const rows = (remainder + decoder.decode(value, { stream: true })).split("\n");
			remainder = rows.pop() ?? "";
			if (remainder.length > maxRowLength)
				throw new InvalidExport("Export row exceeds size limit");
			for (const row of rows) addRow(row);
		}
		addRow(remainder + decoder.decode());
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	if (urls.size === 0) throw new InvalidExport("Empty export");
	return urls;
}

function retryTime(header: string | null, now: number) {
	if (!header) return now;
	const time = /^\d+$/.test(header) ? now + Number(header) * 1000 : Date.parse(header);
	return Number.isFinite(time) ? time : now;
}

export function urlhaus(
	readKey: () => Promise<string>,
	fetcher: (url: URL, init: RequestInit) => Promise<Response> = fetch,
	now = Date.now,
) {
	type Feed = { urls: Set<string>; fetchedAt: number; expiresAt: number };
	type Refresh = Feed | { status: "not_configured" | "unavailable" | "rate_limited" };
	let feed: Feed | undefined;
	let pending: Promise<Refresh> | undefined;
	let nextRefreshAt = 0;
	let failure: Exclude<Refresh, Feed> = { status: "unavailable" };

	async function refresh(): Promise<Refresh> {
		const authKey = await readKey()
			.then((key) => key.trim())
			.catch(() => "");
		if (!/^[a-zA-Z0-9_-]{20,200}$/.test(authKey)) return { status: "not_configured" };
		const endpoint = new URL(
			`https://urlhaus-api.abuse.ch/v2/files/exports/${authKey}/recent.csv`,
		);
		nextRefreshAt = now() + refreshMs;
		const response = await fetcher(endpoint, {
			headers: { Accept: "text/csv" },
			redirect: "error",
			signal: AbortSignal.timeout(25_000),
		});
		if (response.status !== 200 || !response.body) {
			await response.body?.cancel().catch(() => {});
			if (response.status === 429) {
				nextRefreshAt = Math.max(
					nextRefreshAt,
					retryTime(response.headers.get("retry-after"), now()),
				);
				return { status: "rate_limited" };
			}
			throw new InvalidExport(`Export unavailable (HTTP ${response.status})`);
		}
		const urls = await readFeed(response.body);
		const fetchedAt = now();
		return { urls, fetchedAt, expiresAt: fetchedAt + refreshMs };
	}

	function currentFeed(): Promise<Refresh> | Refresh {
		if (feed && feed.expiresAt > now()) return feed;
		if (pending) return pending;
		if (now() < nextRefreshAt) return failure;
		nextRefreshAt = now() + refreshMs;
		pending = refresh()
			.catch((error: unknown): Refresh => {
				// Fetch errors can embed the URL and its Auth-Key.
				console.warn(
					"[URLhaus]",
					error instanceof InvalidExport ? error.message : "Export read failed",
				);
				return { status: "unavailable" };
			})
			.then((result) => {
				if ("urls" in result) feed = result;
				else {
					feed = undefined;
					failure = result;
				}
				return result;
			})
			.finally(() => {
				pending = undefined;
			});
		return pending;
	}

	return {
		async check(value: string): Promise<UrlhausLookup> {
			const result = await currentFeed();
			if ("status" in result) return { provider: "urlhaus", status: result.status };
			return {
				provider: "urlhaus",
				status: result.urls.has(value) ? "matched" : "not_found",
				fetchedAt: new Date(result.fetchedAt).toISOString(),
				expiresAt: new Date(result.expiresAt).toISOString(),
			};
		},
	};
}

export function configuredUrlhaus(keyFile = process.env.URLHAUS_KEY_FILE) {
	if (keyFile) return urlhaus(() => readFile(keyFile, "utf8"));
}
