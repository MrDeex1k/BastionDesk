import { expect, test } from "bun:test";
import { urlhaus } from "./urlhaus";

const key = "test-key-for-urlhaus-fixture";
const listed = "https://sample.example/payload?q=a,b";
const similar = "https://sample.example/payload?q=a";
const refreshMs = 10 * 60_000;
const csv = [
	"# id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter",
	'"42","2026-01-01 00:00:00","https://SAMPLE.example:443/payload?q=a,b","offline","","malware_download","test","",""',
	"",
].join("\r\n");

test("URLhaus reads CSV records split across chunks and accepts unquoted columns", async () => {
	const parts = ["9,2026-01-01 00:00:00,https://sample.ex", "ample/other,online"];
	const service = urlhaus(
		async () => key,
		async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						for (const part of parts)
							controller.enqueue(new TextEncoder().encode(part));
						controller.close();
					},
				}),
			),
	);
	expect((await service.check("https://sample.example/other")).status).toBe("matched");
});

test("URLhaus fetches one export for parallel local checks and expires the snapshot", async () => {
	let requests = 0;
	let clock = 0;
	const service = urlhaus(
		async () => key,
		async (endpoint, init) => {
			requests++;
			expect(endpoint.href).toBe(
				`https://urlhaus-api.abuse.ch/v2/files/exports/${key}/recent.csv`,
			);
			expect(init.redirect).toBe("error");
			return new Response(csv);
		},
		() => clock,
	);
	const [match, absent] = await Promise.all([service.check(listed), service.check(similar)]);
	expect(match).toEqual({
		provider: "urlhaus",
		status: "matched",
		fetchedAt: new Date(clock).toISOString(),
		expiresAt: new Date(refreshMs).toISOString(),
	});
	expect(absent.status).toBe("not_found");
	expect(requests).toBe(1);
	clock = refreshMs - 1;
	await service.check(listed);
	expect(requests).toBe(1);
	clock++;
	await service.check(listed);
	expect(requests).toBe(2);
});

test("URLhaus honors Retry-After and reports a broken export as unavailable", async () => {
	let clock = 0;
	let requests = 0;
	const service = urlhaus(
		async () => key,
		async () => {
			requests++;
			return requests === 1
				? new Response(csv)
				: requests === 2
					? new Response(null, {
							status: 429,
							headers: { "Retry-After": "900" },
						})
					: new Response(csv + "broken export\n");
		},
		() => clock,
	);
	expect((await service.check(listed)).status).toBe("matched");
	clock = refreshMs;
	expect((await service.check(listed)).status).toBe("rate_limited");
	clock += 899_999;
	expect((await service.check(listed)).status).toBe("rate_limited");
	expect(requests).toBe(2);
	clock++;
	expect((await service.check(listed)).status).toBe("unavailable");
	expect((await service.check(similar)).status).toBe("unavailable");
	expect(requests).toBe(3);
});

test("URLhaus rejects a missing or invalid key without contacting the provider", async () => {
	const service = urlhaus(
		async () => "",
		async () => {
			throw new Error("unexpected fetch");
		},
	);
	expect((await service.check(listed)).status).toBe("not_configured");
});
