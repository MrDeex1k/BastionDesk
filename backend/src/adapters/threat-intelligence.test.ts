import { expect, test } from "bun:test";
import { providerLookups } from "../core/ioc/provider-lookups";
import { threatIntelligenceAdapters } from "./threat-intelligence";

const sha256 = "a".repeat(64);
const hash = { kind: "sha256", value: sha256 } as const;
const key = "fixture-key-not-a-secret";

test("adapters send only a chosen indicator or SHA-256 and summarize existing data", async () => {
	const providers = threatIntelligenceAdapters(async (url, request) => {
		const headers = new Headers(request.headers);
		expect(request.redirect).toBe("error");
		switch (url.hostname) {
			case "otx.alienvault.com":
				expect(headers.get("x-otx-api-key")).toBe(key);
				expect(url.pathname).toBe("/api/v1/indicators/IPv4/1.1.1.1/general");
				expect(request.body).toBeUndefined();
				return Response.json({ pulse_info: { count: 3 } });
			case "hybrid-analysis.com":
				expect(headers.get("api-key")).toBe(key);
				expect(request.method).toBe("GET");
				expect(url.pathname).toBe("/api/v2/search/hash");
				expect([...url.searchParams]).toEqual([["hash", sha256]]);
				expect(request.body).toBeUndefined();
				return Response.json({
					sha256s: [sha256],
					reports: [
						{ state: "ERROR", verdict: null },
						{
							state: "SUCCESS",
							verdict: "benign",
							analysis_start_time: "2025-01-01 01:00:00",
						},
						{
							state: "SUCCESS",
							verdict: "malicious",
							threat_score: 90,
							analysis_start_time: "2026-01-01 01:00:00",
						},
					],
				});
			case "www.virustotal.com":
				expect(headers.get("x-apikey")).toBe(key);
				expect(url.pathname).toBe(`/api/v3/files/${sha256}`);
				expect(request.body).toBeUndefined();
				return Response.json({
					data: {
						id: sha256,
						type: "file",
						attributes: {
							last_analysis_stats: {
								malicious: 2,
								suspicious: 1,
								harmless: 2,
								undetected: 10,
							},
						},
					},
				});
			default:
				throw new Error("Unexpected network destination");
		}
	});
	expect(await providers.otx({ kind: "ipv4", value: "1.1.1.1" }, key)).toEqual({
		status: "ready",
		summary: { kind: "pulses", count: 3 },
	});
	expect(await providers.hybrid_analysis(hash, key)).toEqual({
		status: "ready",
		summary: {
			kind: "sandbox",
			verdict: "malicious",
			score: 90,
			analysisAt: "2026-01-01T01:00:00.000Z",
		},
	});
	expect(await providers.virustotal(hash, key)).toMatchObject({
		status: "ready",
		summary: { kind: "engines", malicious: 2, suspicious: 1, evaluated: 15 },
	});
});

test("Hybrid Analysis reads verdicts without timestamps and rejects mismatched hashes", async () => {
	const report = { state: "SUCCESS", verdict: "suspicious" };
	const lookup = (sha256s: string[], reports: (typeof report)[]) =>
		threatIntelligenceAdapters(async () => Response.json({ sha256s, reports })).hybrid_analysis(
			hash,
			key,
		);
	expect(await lookup([sha256], [report])).toMatchObject({
		status: "ready",
		summary: { kind: "sandbox", verdict: "suspicious" },
	});
	expect(await lookup(["b".repeat(64)], [report])).toEqual({
		status: "unavailable",
	});
	expect(await lookup([], [])).toEqual({ status: "not_found" });
});

test("lookups partition results by organization, share the same-key quota and recheck access", async () => {
	let clock = 0;
	let attempts = 0;
	let enabled = true;
	const send = threatIntelligenceAdapters(async () => {
		attempts++;
		return new Response(null, { status: 404 });
	});
	const lookups = providerLookups(
		{
			virustotal: {
				keyFor: async (org) => (enabled && org !== "disabled" ? key : undefined),
				lookup: send.virustotal,
			},
		},
		() => clock,
	);
	expect(await lookups.enabled("disabled")).toEqual([]);
	const [first, parallel] = await Promise.all([
		lookups.check("a", "virustotal", hash),
		lookups.check("a", "virustotal", hash),
	]);
	expect(first.status).toBe("not_found");
	expect(parallel).toEqual(first);
	expect((await lookups.check("b", "virustotal", hash)).status).toBe("rate_limited");
	expect(attempts).toBe(1);
	clock += 15_000;
	expect((await lookups.check("b", "virustotal", hash)).status).toBe("not_found");
	expect(attempts).toBe(2);
	enabled = false;
	expect((await lookups.check("a", "virustotal", hash)).status).toBe("not_configured");
});

test("lookups block private indicators and honor upstream Retry-After without another request", async () => {
	let attempts = 0;
	let clock = 0;
	const send = threatIntelligenceAdapters(async () => {
		attempts++;
		return new Response(null, {
			status: 429,
			headers: { "Retry-After": "180" },
		});
	});
	const lookups = providerLookups(
		{ otx: { keyFor: async () => key, lookup: send.otx } },
		() => clock,
	);
	expect((await lookups.check("a", "otx", { kind: "ipv4", value: "10.1.1.1" })).status).toBe(
		"not_public",
	);
	expect(
		(
			await lookups.check("a", "otx", {
				kind: "domain",
				value: "server.internal",
			})
		).status,
	).toBe("not_public");
	expect(
		(
			await lookups.check("a", "otx", {
				kind: "url",
				value: "https://site.example/?token=x",
			})
		).status,
	).toBe("unsupported");
	expect(attempts).toBe(0);
	expect((await lookups.check("a", "otx", hash)).status).toBe("rate_limited");
	clock = 179_999;
	expect((await lookups.check("a", "otx", hash)).status).toBe("rate_limited");
	expect(attempts).toBe(1);
	clock++;
	await lookups.check("a", "otx", hash);
	expect(attempts).toBe(2);
});
