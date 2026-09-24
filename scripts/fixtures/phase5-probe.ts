// Run only in the isolated auth-service container; never against a user's database.
import assert from "node:assert/strict";
import { decodeProtectedHeader } from "jose";
import { auth, authPool } from "./src/auth/instance";
import { authIdentity } from "./src/auth/state";
import { issueCoreToken } from "./src/identity/auth-bridge";
import { authIssuer, identityTls } from "./src/identity/network-config";
import { internalFetch } from "./src/identity/transport";
import { closeDatabase } from "./src/lib/database";

const core = internalFetch("auth-service", "https://backend:3333");
const path = "https://backend:3333/api/admin/incidents";
async function status(token?: string) {
	return (await core(path, { headers: token ? { authorization: `Bearer ${token}` } : {} }))
		.status;
}
const mode = process.argv[2];
try {
	if (mode === "seed") {
		const id = crypto.randomUUID();
		const email = `${id}@phase5.invalid`;
		const password = `Phase5-${crypto.randomUUID()}!`;
		const signup = await auth.api.signUpEmail({
			body: { email, password, name: "Identity probe" },
		});
		await authPool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
			signup.user.id,
		]);
		const org = await auth.api.createOrganization({
			body: { name: "Identity probe", slug: id, userId: signup.user.id },
		});
		assert(org);
		const login = await auth.api.signInEmail({
			returnHeaders: true,
			body: { email, password },
		});
		const cookie = login.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		const headers = new Headers({ cookie });
		await auth.api.setActiveOrganization({ headers, body: { organizationId: org.id } });
		const live = await authIdentity.forBrowser(headers, new AbortController().signal);
		assert(live);
		const mint = () =>
			issueCoreToken(
				authIssuer,
				live,
				async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
			);
		const token = await mint();
		assert.equal(
			await status(token),
			200,
			"real Core accepts JWT after mTLS and live resolution",
		);
		assert.equal(await status(), 401, "mTLS alone is insufficient");
		assert.equal(await status(token.slice(0, -8) + "tampered"), 401);
		const noCert = { ca: identityTls("auth-service").ca, rejectUnauthorized: true };
		await assert.rejects(fetch(path, { tls: noCert }));
		const wrongCert = {
			...noCert,
			cert: await Bun.file("/certs/backend/client.crt").text(),
			key: await Bun.file("/certs/backend/client.key").text(),
		};
		await assert.rejects(fetch(path, { tls: wrongCert }));
		await authPool.query("UPDATE member SET role='pracownik' WHERE \"userId\"=$1", [
			live.subject,
		]);
		assert.equal(await status(token), 403, "role changes apply immediately to existing JWTs");
		await authPool.query("UPDATE member SET role='admin' WHERE \"userId\"=$1", [live.subject]);
		await authPool.query('UPDATE "user" SET "isActive"=false WHERE id=$1', [live.subject]);
		assert.equal(await status(token), 401);
		await authPool.query('UPDATE "user" SET "isActive"=true WHERE id=$1', [live.subject]);
		await authPool.query('UPDATE session SET "activeOrganizationId"=NULL WHERE id=$1', [
			live.sessionId,
		]);
		assert.equal(await status(token), 401);
		await authPool.query('UPDATE session SET "activeOrganizationId"=$1 WHERE id=$2', [
			org.id,
			live.sessionId,
		]);
		const oldKid = decodeProtectedHeader(token).kid;
		await authPool.query(
			"UPDATE jwks SET \"createdAt\"=now()-interval '2 days', \"expiresAt\"=now()-interval '1 second' WHERE id=$1",
			[oldKid],
		);
		const rotated = await mint();
		assert.notEqual(decodeProtectedHeader(rotated).kid, oldKid);
		// JWKS cooldown bounds unknown-kid refresh traffic.
		await Bun.sleep(5500);
		assert.equal(await status(rotated), 200);
		assert.equal(await status(token), 200, "previous key remains valid during overlap");
		const jwks = await auth.api.getJwks();
		assert(jwks.keys.every((key) => !("d" in key)));
		const encrypted = (await authPool.query('SELECT "privateKey" FROM jwks LIMIT 1')).rows[0]
			.privateKey;
		assert.equal(typeof JSON.parse(encrypted), "string");
		await Bun.write(
			"/tmp/phase5-probe.json",
			JSON.stringify({
				token: rotated,
				cookie,
				live,
				kid: decodeProtectedHeader(rotated).kid,
			}),
		);
		console.log(
			"PASS mTLS rejects missing/foreign certificates; JWT tamper, roles, disabled users, tenant switch, rotation",
		);
	} else {
		const saved = await Bun.file("/tmp/phase5-probe.json").json();
		assert.equal(
			await status(saved.token),
			200,
			"token and persisted key survive auth restart",
		);
		const live = await authIdentity.forBrowser(
			new Headers({ cookie: saved.cookie }),
			new AbortController().signal,
		);
		assert.deepEqual(live, saved.live, "existing browser session survives restart");
		const fresh = await issueCoreToken(
			authIssuer,
			saved.live,
			async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
		);
		assert.equal(decodeProtectedHeader(fresh).kid, saved.kid);
		await authPool.query("DELETE FROM session WHERE id=$1", [saved.live.sessionId]);
		assert.equal(await status(fresh), 401, "revocation applies to unexpired JWT");
		console.log("PASS persisted keys/session after restart and immediate session revocation");
	}
} finally {
	await authPool.end();
	await closeDatabase();
}
