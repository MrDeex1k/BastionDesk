import { expect, test } from "bun:test";
import { abuseIpDb } from "../../adapters/abuseipdb";
import { ipReputation, isPublicIp } from "./enrichment";

test("AbuseIPDB sends only a public IP and partitions and expires results by organization", async () => {
	const sent: Array<{ address: string; key: string | null }> = [];
	let time = 0;
	const provider = abuseIpDb(async (url, init) => {
		expect(url.origin + url.pathname).toBe("https://api.abuseipdb.com/api/v2/check");
		expect(init.redirect).toBe("error");
		const address = url.searchParams.get("ipAddress")!;
		expect([...url.searchParams.keys()]).toEqual(["ipAddress"]);
		sent.push({ address, key: new Headers(init.headers).get("key") });
		return Response.json({
			data: { ipAddress: address, abuseConfidenceScore: 30, totalReports: 2 },
		});
	});
	const service = ipReputation(
		async (org) => (org === "none" ? undefined : "test-" + org),
		provider,
		() => time,
	);
	expect(await service.check("alpha", "100.99.228.91")).toEqual({ status: "not_public" });
	expect(await service.check("none", "1.1.1.1")).toEqual({ status: "not_configured" });
	expect(
		await Promise.all([service.check("alpha", "1.1.1.1"), service.check("alpha", "1.1.1.1")]),
	).toEqual([
		{
			status: "ready",
			result: {
				provider: "abuseipdb",
				address: "1.1.1.1",
				confidence: 30,
				reports: 2,
				fetchedAt: "1970-01-01T00:00:00.000Z",
				expiresAt: "1970-01-01T01:00:00.000Z",
			},
		},
		{
			status: "ready",
			result: {
				provider: "abuseipdb",
				address: "1.1.1.1",
				confidence: 30,
				reports: 2,
				fetchedAt: "1970-01-01T00:00:00.000Z",
				expiresAt: "1970-01-01T01:00:00.000Z",
			},
		},
	]);
	expect(sent.length).toBe(1);
	await service.check("beta", "1.1.1.1");
	time = 3_600_000;
	await service.check("alpha", "1.1.1.1");
	expect(sent.map(({ key }) => key)).toEqual(["test-alpha", "test-beta", "test-alpha"]);
	expect(
		["192.168.0.1", "203.0.113.2", "::ffff:127.0.0.1", "2001:db8::1", "3fff::1"].some(
			isPublicIp,
		),
	).toBe(false);
	expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
});

test("temporary errors retry and a rate limit affects only its organization", async () => {
	let attempts = 0;
	const provider = abuseIpDb(async () => {
		attempts += 1;
		return attempts === 1
			? new Response(null, { status: 503 })
			: new Response(null, { status: 429, headers: { "retry-after": "600" } });
	});
	const service = ipReputation(
		async () => "test",
		provider,
		() => 0,
	);
	expect(await service.check("alpha", "1.1.1.1")).toEqual({
		status: "rate_limited",
		retryAfterMs: 600_000,
	});
	expect(await service.check("alpha", "8.8.8.8")).toEqual({
		status: "rate_limited",
		retryAfterMs: 600_000,
	});
	expect(attempts).toBe(2);
	expect(await service.check("beta", "1.1.1.1")).toEqual({
		status: "rate_limited",
		retryAfterMs: 600_000,
	});
	expect(attempts).toBe(3);
});

test("concurrent replies preserve the longest rate limit and return its remaining duration", async () => {
	const slow = Promise.withResolvers<Response>();
	const started = Promise.withResolvers<void>();
	let time = 0;
	let sent = 0;
	const service = ipReputation(
		async () => "fixture",
		abuseIpDb(async (url) => {
			sent++;
			const address = url.searchParams.get("ipAddress");
			if (address === "1.1.1.1") {
				started.resolve();
				return slow.promise;
			}
			return new Response(null, { status: 429, headers: { "retry-after": "600" } });
		}),
		() => time,
	);
	const pending = service.check("org", "1.1.1.1");
	await started.promise;
	expect(await service.check("org", "8.8.8.8")).toEqual({
		status: "rate_limited",
		retryAfterMs: 600_000,
	});
	slow.resolve(
		Response.json({ data: { ipAddress: "1.1.1.1", abuseConfidenceScore: 0, totalReports: 0 } }),
	);
	expect((await pending).status).toBe("ready");
	time = 61_000;
	expect(await service.check("org", "9.9.9.9")).toEqual({
		status: "rate_limited",
		retryAfterMs: 539_000,
	});
	expect(sent).toBe(2);
});
