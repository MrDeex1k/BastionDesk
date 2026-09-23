// Bun-only Elysia 2 compatibility probe. See elysia2/package.json and identity-contract.md.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { coreJwtPlugin } from "../../backend/src/identity/auth-bridge.ts";

if (!process.env.ELYSIA_SPIKE_DIR) throw new Error("ELYSIA_SPIKE_DIR_REQUIRED");
const external = createRequire(resolve(process.env.ELYSIA_SPIKE_DIR, "package.json"));
const backend = createRequire(new URL("../../backend/package.json", import.meta.url));
const { version } = external("elysia/package.json");
assert.equal(version, "2.0.0-beta.14", "Probe requires the reviewed Elysia beta");
const { Elysia } = external("elysia");
const { betterAuth } = backend("better-auth");
const { memoryAdapter } = backend("better-auth/adapters/memory");
const origin = "https://elysia.bastiondesk.test";
const issuer = `${origin}/api/auth`;
const auth = betterAuth({
  baseURL: origin, secret: "isolated-elysia-secret-at-least-32-chars",
  database: memoryAdapter({ user: [], session: [], account: [], verification: [], jwks: [] }),
  emailAndPassword: { enabled: true }, advanced: { useSecureCookies: true },
  disabledPaths: ["/token"], plugins: [coreJwtPlugin(issuer)],
});
const app = new Elysia().mount(auth.handler);
const signup = await app.handle(new Request(`${issuer}/sign-up/email`, {
  method: "POST", headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ name: "Fixture", email: "fixture@example.test", password: "Fixture-password-24!" }),
}));
assert.equal(signup.status, 200);
const cookies = signup.headers.getSetCookie();
assert(cookies.some((cookie) => cookie.includes("HttpOnly") && cookie.includes("Secure")));
const headers = { cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; "), origin };
const session = await app.handle(new Request(`${issuer}/get-session`, { headers }));
assert.equal(session.status, 200);
assert((await session.json()).session);
assert.equal(session.headers.has("set-auth-jwt"), false);
assert.equal((await app.handle(new Request(`${issuer}/token`, { headers }))).status, 404);
assert.equal((await app.handle(new Request(`${issuer}/jwks`))).status, 200);
const crossOrigin = await app.handle(new Request(`${issuer}/sign-out`, { method: "POST", headers: { ...headers, origin: "https://attacker.test", "content-type": "application/json" }, body: "{}" }));
assert.equal(crossOrigin.status, 403);
const current = await app.handle(new Request(`${issuer}/get-session`, { headers }));
assert((await current.json()).session);
console.log(`PASS Elysia ${version} mount: real Better Auth signup/session, secure cookies, JWKS, hidden token and foreign-origin rejection`);

// Reuse the full Better Auth security scenario, routing browser requests and JWKS
// through Elysia; server-only signing and current identity reads stay auth-owned.
const suite = Bun.spawn([
  process.execPath, "test", "./backend/src/identity/better-auth.test.ts",
], {
  cwd: resolve(import.meta.dir, "../.."),
  env: { ...process.env, ELYSIA_SPIKE_DIR: resolve(process.env.ELYSIA_SPIKE_DIR) },
  stdout: "inherit", stderr: "inherit",
});
assert.equal(await suite.exited, 0, "Elysia JWT/session integration failed");
