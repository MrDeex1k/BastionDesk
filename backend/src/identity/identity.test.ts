import { expect, test, setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createCoreVerifier } from "./verifier";
import { issueCoreToken, coreRequestHeaders } from "./auth-bridge";
import { identityPolicy, type LiveIdentity } from "./contract";

const issuer = "https://bastiondesk.test/api/auth";
const now = 1_790_000_000;
const identity: LiveIdentity = {
	subject: "user-a",
	sessionId: "session-a",
	organizationId: "org-a",
	role: "admin",
	sessionExpiresAt: now + 3600,
};

test("Core rejects invalid JWT profiles and never trusts role claims", async () => {
	const pair = await generateKeyPair("EdDSA");
	const publicKey = { ...(await exportJWK(pair.publicKey)), kid: "key-a", alg: "EdDSA" };
	let reads = 0;
	const verifier = createCoreVerifier({
		issuer,
		now: () => now,
		transport: async () => Response.json({ keys: [publicKey] }),
		readCurrent: async () => {
			reads++;
			return identity;
		},
	});
	const claims = {
		iss: issuer,
		aud: identityPolicy.audience,
		sub: identity.subject,
		sid: identity.sessionId,
		org_id: identity.organizationId,
		iat: now,
		exp: now + 60,
		jti: crypto.randomUUID(),
	};
	const sign = (payload: Record<string, unknown>, kid = "key-a") =>
		new SignJWT(payload).setProtectedHeader({ alg: "EdDSA", kid }).sign(pair.privateKey);
	expect((await verifier.verify(await sign(claims))).role).toBe("admin");
	for (const override of [
		{ iss: "https://attacker.test/api/auth" },
		{ aud: "another-service" },
		{ exp: now - 10 },
		{ exp: now + 3600 },
		{ iat: now + 30, exp: now + 60 },
		{ jti: undefined },
		{ sid: undefined },
		{ role: "admin" },
		{ email: "secret@example.test" },
	])
		await assert.rejects(verifier.verify(await sign({ ...claims, ...override })));
	await assert.rejects(verifier.verify(await sign(claims, "unknown-key")));
	for (const header of [
		{ alg: "EdDSA" },
		{ alg: "EdDSA", kid: "key-a", jku: "https://attacker.test/keys" },
	]) {
		await assert.rejects(
			verifier.verify(
				await new SignJWT(claims).setProtectedHeader(header).sign(pair.privateKey),
			),
		);
	}
	const hmac = await new SignJWT(claims)
		.setProtectedHeader({ alg: "HS256", kid: "key-a" })
		.sign(new TextEncoder().encode("a".repeat(32)));
	await assert.rejects(verifier.verify(hmac));
	expect(reads).toBe(1);
});

test("authoritative state controls logout, tenant switch, role and auth outages", async () => {
	const pair = await generateKeyPair("EdDSA");
	const key = { ...(await exportJWK(pair.publicKey)), kid: "key-a", alg: "EdDSA" };
	let current: LiveIdentity | null = identity;
	let unavailable = false;
	const verifier = createCoreVerifier({
		issuer,
		now: () => now,
		transport: async () => Response.json({ keys: [key] }),
		readCurrent: async () => {
			if (unavailable) throw new Error("database unavailable");
			return current;
		},
	});
	const token = await issueCoreToken(
		issuer,
		identity,
		(payload) =>
			new SignJWT(payload)
				.setProtectedHeader({ alg: "EdDSA", kid: "key-a" })
				.sign(pair.privateKey),
		now,
	);
	expect(coreRequestHeaders(token).has("cookie")).toBe(false);
	current = { ...identity, role: "pracownik" };
	expect((await verifier.verify(token)).role).toBe("pracownik");
	for (const change of [
		{ organizationId: "org-b" },
		{ subject: "user-b" },
		{ sessionId: "other-session" },
		{ sessionExpiresAt: now },
	]) {
		current = { ...identity, ...change };
		await assert.rejects(verifier.verify(token));
	}
	current = null;
	await assert.rejects(verifier.verify(token));
	unavailable = true;
	await assert.rejects(verifier.verify(token), /Usługa jest chwilowo niedostępna/);
	await assert.rejects(
		issueCoreToken(issuer, { ...identity, sessionExpiresAt: now }, async () => "unused", now),
	);
});

test("JWKS overlap, cache, removal and outage fail closed", async () => {
	const oldPair = await generateKeyPair("EdDSA");
	const newPair = await generateKeyPair("EdDSA");
	const oldKey = { ...(await exportJWK(oldPair.publicKey)), kid: "old", alg: "EdDSA" };
	const newKey = { ...(await exportJWK(newPair.publicKey)), kid: "new", alg: "EdDSA" };
	let keys = [oldKey];
	let fetches = 0;
	let unavailable = false;
	const verifier = createCoreVerifier({
		issuer,
		now: () => now,
		readCurrent: async () => identity,
		transport: async () => {
			fetches++;
			if (unavailable) return new Response(null, { status: 503 });
			return Response.json({ keys });
		},
	});
	const oldToken = await issueCoreToken(
		issuer,
		identity,
		(payload) =>
			new SignJWT(payload)
				.setProtectedHeader({ alg: "EdDSA", kid: "old" })
				.sign(oldPair.privateKey),
		now,
	);
	const newToken = await issueCoreToken(
		issuer,
		identity,
		(payload) =>
			new SignJWT(payload)
				.setProtectedHeader({ alg: "EdDSA", kid: "new" })
				.sign(newPair.privateKey),
		now,
	);
	await verifier.verify(oldToken);
	await verifier.verify(oldToken);
	expect(fetches).toBe(1);
	keys = [oldKey, newKey];
	await verifier.refreshKeys();
	await verifier.verify(newToken);
	await verifier.verify(oldToken);
	keys = [newKey];
	await verifier.refreshKeys();
	await assert.rejects(verifier.verify(oldToken));
	await verifier.verify(newToken);
	unavailable = true;
	await assert.rejects(verifier.refreshKeys());
	const cold = createCoreVerifier({
		issuer,
		now: () => now,
		readCurrent: async () => identity,
		transport: async () => new Response(null, { status: 503 }),
	});
	await assert.rejects(cold.verify(newToken));
	try {
		setSystemTime(new Date(Date.now() + identityPolicy.jwksCacheMs + 1000));
		await assert.rejects(verifier.verify(newToken));
	} finally {
		setSystemTime();
	}
});

test("an unresponsive authoritative lookup is cancelled instead of trusting stale identity", async () => {
	const pair = await generateKeyPair("EdDSA");
	const key = { ...(await exportJWK(pair.publicKey)), kid: "key", alg: "EdDSA" };
	let signal: AbortSignal | undefined;
	const verifier = createCoreVerifier({
		issuer,
		now: () => now,
		transport: async () => Response.json({ keys: [key] }),
		readCurrent: (_claims, currentSignal) => {
			signal = currentSignal;
			return new Promise(() => {});
		},
	});
	const token = await issueCoreToken(
		issuer,
		identity,
		(payload) =>
			new SignJWT(payload)
				.setProtectedHeader({ alg: "EdDSA", kid: "key" })
				.sign(pair.privateKey),
		now,
	);
	await assert.rejects(verifier.verify(token), /Usługa jest chwilowo niedostępna/);
	expect(signal?.aborted).toBe(true);
});
