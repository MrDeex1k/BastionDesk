import assert from "node:assert/strict";
import { createCoreApplication } from "../backend/src/core/application";

const { coreReadHandler, coreReadPaths } = await import("../backend/src/adapters/core-http");
let authenticated = false;
let scopeSeen: unknown;
const core = await createCoreApplication([{ paths: coreReadPaths, handle: coreReadHandler({ read: async () => authenticated ? { subject: "u", organizationId: "org", role: "pracownik", sessionId: "s", sessionExpiresAt: Math.floor(Date.now()/1000)+60 } : null }, { list: async (scope) => { scopeSeen = scope; return { incidents: [], total: 0 }; }, get: async () => null }) }]);
const server = core.http.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
try {
  const address = server.address();
  assert(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/core/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { service: "core", status: "ready" } });
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/incidents/my`, { headers: { "x-user-id": "attacker" } })).status, 401);
  authenticated = true;
  const own = await fetch(`${base}/api/incidents/my`);
  assert.equal(own.status, 200);
  assert.deepEqual(scopeSeen, { organizationId: "org", userId: "u" });
  assert.equal((await fetch(`${base}/api/analyst/incidents/assigned`)).status, 403);
  assert.equal((await fetch(`${base}/api/incidents/${crypto.randomUUID()}`)).status, 404);
  authenticated = false;
  assert.equal((await fetch(`${base}/api/incidents/my`)).status, 401);
  console.log("PASS NestJS HTTP startup, fresh identity, tenant scope, RBAC and revocation");
} finally {
  await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  await core.close();
}
