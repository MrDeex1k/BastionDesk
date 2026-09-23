import { expect, test } from "bun:test";
import { createAuthApplication } from "./application";

test("Elysia dispatch preserves raw bodies and cookies while isolating internal routes", async () => {
	const calls: string[] = [];
	const app = createAuthApplication({
		origins: ["https://desk.test"],
		health: async () => true,
		csrf: async () => Response.json({ token: "fixture" }),
		signup: async () => Response.json({ created: true }),
		auth: async () => {
			const headers = new Headers();
			headers.append("set-cookie", "session=one; HttpOnly; Secure");
			headers.append("set-cookie", "cache=two; HttpOnly; Secure");
			return new Response(null, { headers });
		},
		proxy: async (request) => {
			calls.push(await request.text());
			return Response.json({ ok: true });
		},
	});
	const send = (path: string, init?: RequestInit) =>
		app.handle(new Request(`https://desk.test${path}`, init));
	expect((await send("/api/auth/get-session")).headers.getSetCookie()).toHaveLength(2);
	expect((await send("/internal/identity/resolve")).status).toBe(404);
	expect(await (await send("/api")).json()).toMatchObject({ version: "1.0.3" });
	const navigation = {
		headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
	};
	expect((await send("/api/auth/verify-email?token=fixture", navigation)).status).toBe(200);
	expect((await send("/api/auth/reset-password/fixture", navigation)).status).toBe(200);
	expect((await send("/api/auth/get-session", navigation)).status).toBe(403);
	expect(
		(
			await send("/api/incidents", {
				method: "POST",
				body: "raw",
				headers: { origin: "https://desk.test" },
			})
		).status,
	).toBe(200);
	expect(calls).toEqual(["raw"]);
	expect(
		(await send("/api/incidents", { headers: { origin: "https://evil.test" } })).status,
	).toBe(403);
});

test("gateway rate limiting rejects bursts before running auth or Core", async () => {
	let calls = 0;
	const handle = async () => {
		calls++;
		return new Response();
	};
	const app = createAuthApplication({
		origins: [],
		limit: 2,
		auth: handle,
		csrf: handle,
		signup: handle,
		proxy: handle,
		health: async () => true,
	});
	for (const expected of [200, 200, 429])
		expect(
			(await app.handle(new Request("https://desk.test/api/auth/get-session"))).status,
		).toBe(expected);
	expect(calls).toBe(2);
});
