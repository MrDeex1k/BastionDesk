import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { Elysia } from "elysia";
import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { ac, admin, analityk, pracownik } from "../lib/permissions";
import { coreJwtPlugin, issueCoreToken, createBrowserIdentityBridge } from "./auth-bridge";
import { createAuthIdentityAdapter } from "./auth-state";
import { createCoreVerifier } from "./verifier";
import { liveIdentitySchema } from "./contract";

test("Better Auth sessions exchange server-side JWTs without browser token exposure", async () => {
	const baseURL = "https://identity.bastiondesk.test";
	const issuer = `${baseURL}/api/auth`;
	const db: MemoryDB = {
		user: [],
		session: [],
		account: [],
		verification: [],
		organization: [],
		member: [],
		invitation: [],
		jwks: [],
	};
	const auth = betterAuth({
		baseURL,
		secret: "test-only-secret-with-at-least-32-characters",
		database: memoryAdapter(db),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: { isActive: { type: "boolean", defaultValue: true, input: false } },
		},
		advanced: { useSecureCookies: true },
		session: { cookieCache: { enabled: true, maxAge: 300 } },
		disabledPaths: ["/token"],
		plugins: [
			organization({ ac, creatorRole: "admin", roles: { admin, analityk, pracownik } }),
			coreJwtPlugin(issuer),
		],
	});
	const app = new Elysia().mount(auth.handler);
	const handle = (request: Request) => app.handle(request);
	const signup = await handle(
		new Request(`${issuer}/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseURL },
			body: JSON.stringify({
				name: "Fixture",
				email: "fixture@example.test",
				password: "Fixture-password-24!",
			}),
		}),
	);
	expect(signup.status).toBe(200);
	const cookies = signup.headers.getSetCookie();
	expect(cookies.some((cookie) => cookie.includes("HttpOnly") && cookie.includes("Secure"))).toBe(
		true,
	);
	const headers = new Headers({
		cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; "),
		origin: baseURL,
	});
	const context = await auth.$context;
	const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
	assert(session);
	await context.adapter.update({
		model: "user",
		where: [{ field: "id", value: session.user.id }],
		update: { emailVerified: true },
	});
	const org = await auth.api.createOrganization({
		headers,
		body: { name: "Fixture A", slug: "fixture-a" },
	});
	assert(org);
	await auth.api.setActiveOrganization({ headers, body: { organizationId: org.id } });
	const adapter = createAuthIdentityAdapter({
		resolveSessionId: async (h) =>
			(await auth.api.getSession({ headers: h, query: { disableCookieCache: true } }))
				?.session.id ?? null,
		findIdentity: async (id) => {
			const row = await context.adapter.findOne<{
				id: string;
				userId: string;
				activeOrganizationId?: string;
				expiresAt: Date;
			}>({ model: "session", where: [{ field: "id", value: id }] });
			if (!row || row.expiresAt.getTime() <= Date.now() || !row.activeOrganizationId)
				return null;
			const user = await context.adapter.findOne<{
				emailVerified: boolean;
				isActive: boolean;
			}>({
				model: "user",
				where: [{ field: "id", value: row.userId }],
			});
			const member = await context.adapter.findOne<{ role: string }>({
				model: "member",
				where: [
					{ field: "userId", value: row.userId },
					{ field: "organizationId", value: row.activeOrganizationId },
				],
			});
			if (!user?.emailVerified || !user.isActive || !member) return null;
			return liveIdentitySchema.parse({
				subject: row.userId,
				sessionId: row.id,
				organizationId: row.activeOrganizationId,
				role: member.role,
				sessionExpiresAt: Math.floor(row.expiresAt.getTime() / 1000),
			});
		},
	});
	const live = await adapter.forBrowser(headers, new AbortController().signal);
	assert(live);
	const mint = () =>
		issueCoreToken(
			issuer,
			live,
			async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
		);
	const token = await mint();
	expect(decodeProtectedHeader(token).alg).toBe("EdDSA");
	expect(Object.keys(decodeJwt(token)).sort()).toEqual([
		"aud",
		"exp",
		"iat",
		"iss",
		"jti",
		"org_id",
		"sid",
		"sub",
	]);
	const verifier = createCoreVerifier({
		issuer,
		readCurrent: adapter.readCurrent,
		transport: async (url) => handle(new Request(url)),
	});
	expect((await verifier.verify(token)).organizationId).toBe(org.id);
	const bridge = createBrowserIdentityBridge({
		issuer,
		readBrowserIdentity: (headers, signal) => adapter.forBrowser(headers, signal),
		// Controlled CSRF boundary fixture; production must use the existing validator.
		validateCsrf: async (request) => request.headers.get("x-csrf-token") === "fixture-only",
		sign: async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
	});
	const browserHeaders = new Headers(headers);
	browserHeaders.set("authorization", "Bearer attacker-supplied");
	browserHeaders.set("x-user-id", "attacker");
	browserHeaders.set("x-csrf-token", "fixture-only");
	const forwarded = await bridge(
		new Request(`${baseURL}/api/core-probe`, { method: "POST", headers: browserHeaders }),
	);
	expect(forwarded.has("cookie")).toBe(false);
	expect(forwarded.has("x-user-id")).toBe(false);
	const internalToken = forwarded.get("authorization")!.slice(7);
	expect((await verifier.verify(internalToken)).subject).toBe(live.subject);
	browserHeaders.delete("x-csrf-token");
	await assert.rejects(
		bridge(
			new Request(`${baseURL}/api/core-probe`, { method: "POST", headers: browserHeaders }),
		),
	);
	browserHeaders.set("x-csrf-token", "fixture-only");
	browserHeaders.set("origin", "https://attacker.test");
	await assert.rejects(
		bridge(
			new Request(`${baseURL}/api/core-probe`, { method: "POST", headers: browserHeaders }),
		),
	);
	const sessionResponse = await handle(new Request(`${issuer}/get-session`, { headers }));
	expect(sessionResponse.headers.has("set-auth-jwt")).toBe(false);
	expect((await handle(new Request(`${issuer}/token`, { headers }))).status).toBe(404);
	expect(
		(await handle(new Request(`${issuer}/sign-jwt`, { method: "POST", headers }))).status,
	).toBe(404);
	const jwks = (await (await handle(new Request(`${issuer}/jwks`))).json()) as {
		keys: Record<string, unknown>[];
	};
	expect(jwks.keys.length).toBe(1);
	expect(jwks.keys[0]?.d).toBeUndefined();
	const storedKey = await context.adapter.findOne<{ id: string; privateKey: string }>({
		model: "jwks",
		where: [{ field: "id", value: decodeProtectedHeader(token).kid! }],
	});
	assert(storedKey);
	expect(typeof JSON.parse(storedKey.privateKey)).toBe("string");
	await context.adapter.update({
		model: "jwks",
		where: [{ field: "id", value: storedKey.id }],
		update: {
			expiresAt: new Date(Date.now() - 1000),
			createdAt: new Date(Date.now() - 86400000),
		},
	});
	const rotated = await mint();
	expect(decodeProtectedHeader(rotated).kid).not.toBe(storedKey.id);
	await verifier.refreshKeys();
	await verifier.verify(rotated);
	await verifier.verify(token);
	await context.adapter.updateMany({
		model: "member",
		where: [{ field: "userId", value: live.subject }],
		update: { role: "pracownik" },
	});
	expect((await verifier.verify(token)).role).toBe("pracownik");
	await context.adapter.update({
		model: "user",
		where: [{ field: "id", value: live.subject }],
		update: { isActive: false },
	});
	await assert.rejects(verifier.verify(token));
	await context.adapter.update({
		model: "user",
		where: [{ field: "id", value: live.subject }],
		update: { isActive: true },
	});
	await context.adapter.deleteMany({
		model: "member",
		where: [{ field: "userId", value: live.subject }],
	});
	await assert.rejects(verifier.verify(token));
	await context.adapter.create({
		model: "member",
		data: {
			organizationId: org.id,
			userId: live.subject,
			role: "pracownik",
			createdAt: new Date(),
		},
	});
	await context.adapter.update({
		model: "session",
		where: [{ field: "id", value: live.sessionId }],
		update: { activeOrganizationId: "foreign-org" },
	});
	await assert.rejects(verifier.verify(token));
	await context.adapter.update({
		model: "session",
		where: [{ field: "id", value: live.sessionId }],
		update: { activeOrganizationId: org.id },
	});
	const signout = await handle(
		new Request(`${issuer}/sign-out`, {
			method: "POST",
			headers: new Headers({
				...Object.fromEntries(headers),
				"content-type": "application/json",
			}),
			body: "{}",
		}),
	);
	expect(signout.status).toBe(200);
	expect(signout.headers.getSetCookie().some((cookie) => cookie.includes("Max-Age=0"))).toBe(
		true,
	);
	await assert.rejects(verifier.verify(token));
	expect(await adapter.forBrowser(headers, new AbortController().signal)).toBeNull();
}, 20_000);
