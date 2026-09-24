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

test("signup preserves Better Auth errors and hides unexpected failures", async () => {
	const { APIError } = await import("better-auth/api");
	for (const [error, status, body] of [
		[
			new APIError("CONFLICT", {
				code: "USER_ALREADY_EXISTS",
				message: "Email already exists",
			}),
			409,
			{ code: "USER_ALREADY_EXISTS", message: "Email already exists" },
		],
		[
			new APIError("BAD_REQUEST", {
				code: "PASSWORD_COMPROMISED",
				message: "Choose another password",
			}),
			400,
			{ code: "PASSWORD_COMPROMISED", message: "Choose another password" },
		],
		[
			new APIError("FORBIDDEN", {
				code: "ORGANIZATION_LIMIT",
				message: "Organization limit reached",
			}),
			403,
			{ code: "ORGANIZATION_LIMIT", message: "Organization limit reached" },
		],
		[
			new Error("database password secret"),
			503,
			{
				success: false,
				error: { code: "SERVICE_UNAVAILABLE", message: "SERVICE_UNAVAILABLE" },
			},
		],
	] as const) {
		const handle = async () => new Response();
		const app = createAuthApplication({
			origins: ["https://desk.test"],
			health: async () => true,
			auth: handle,
			csrf: handle,
			proxy: handle,
			signup: async () => {
				throw error;
			},
		});
		const response = await app.handle(
			new Request("https://desk.test/api/auth/sign-up-with-organization/email", {
				method: "POST",
				headers: { origin: "https://desk.test" },
			}),
		);
		expect(response.status).toBe(status);
		expect(await response.json()).toEqual(body);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("access-control-allow-origin")).toBe("https://desk.test");
	}
});
