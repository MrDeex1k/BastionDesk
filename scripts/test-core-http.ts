import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createCoreApplication } from "../backend/src/core/application";
import type { LiveIdentity } from "../backend/src/identity/contract";
import type { Incident } from "../backend/src/types";
import { ipReputation } from "../backend/src/core/ioc/enrichment";
import { coreReadHandler, coreReadPaths, coreReputationHandler, coreReputationPaths } from "../backend/src/adapters/core-http";
import { coreAdminHandler, coreAdminRoutes } from "../backend/src/adapters/core-admin-http";

const express = createRequire(new URL("../backend/package.json", import.meta.url))("express");
let authenticated = false;
let role: LiveIdentity["role"] = "pracownik";
let organizationId = "org";
let scopeSeen: unknown;
let projectionCalls = 0;
let listCalls = 0;
let statusSeen: string | undefined;
const identity = { read: async (): Promise<LiveIdentity | null> => authenticated ? {
  subject: "u", organizationId, role, sessionId: "s",
  sessionExpiresAt: Math.floor(Date.now() / 1000) + 60,
} : null };
const admin = coreAdminHandler(identity, {
  query: async (input, organizationId) => {
    assert.equal(organizationId, "org");
    projectionCalls++;
    return { incidents: [], pagination: { ...input.pagination, total: 0, totalPages: 0 } };
  },
  filters: async (organizationId) => { assert.equal(organizationId, "org"); return { analysts: [] }; },
  summary: async () => ({ success: true, data: { total: 0 } }),
});
const date = new Date();
const incident: Incident = {
  id: crypto.randomUUID(), dataZgloszenia: date, userId: "u", organizationId: "org",
  status: "Zgłoszony", userDescription: "Adres źródłowy 1.1.1.1 oraz prywatny 10.0.0.7.",
  userScreenshotPath: null, userScreenshotMetadata: {}, userAttachmentPath: null, userAttachmentMetadata: {},
  analystId: null, analystNote: null, czyRozwiazany: false, dataRozwiazania: null,
  analystReportPath: null, analystReportMetadata: {}, analystReportData: null,
  analystStatementPath: null, analystStatementMetadata: {}, analystStatementData: null,
  llmCategory: null, createdAt: date, updatedAt: date,
};
const reads = {
  list: async (scope: unknown, input: { status?: string }) => { listCalls++; statusSeen = input.status; scopeSeen = scope; return { incidents: [], total: 0 }; },
  get: async (_scope: unknown, id: string) => id === incident.id ? incident : null,
};
const audited: Array<{ actor: string; status: string }> = [];
let externalLookups = 0;
const reputation = ipReputation(async (org) => org === "org" ? "test-key" : undefined, {
  name: "abuseipdb",
  lookup: async () => { externalLookups++; return { status: "ready", confidence: 15, reports: 2 }; },
});
const core = await createCoreApplication([
  ...coreAdminRoutes.map((route) => ({ ...route, handle: admin })),
  { paths: coreReadPaths, handle: coreReadHandler(identity, reads, reputation) },
  { method: "post", paths: coreReputationPaths, handle: coreReputationHandler(identity, reads, async (actor, _id, status) => {
    audited.push({ actor: actor.subject, status });
  }, reputation) },
]);
const outer = express();
outer.use(express.json(), core.http);
const server = outer.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
try {
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/api/core/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { service: "core", status: "ready" } });
  assert.equal((await fetch(`${base}/api/incidents/my`, { headers: { "x-user-id": "attacker" } })).status, 401);
  authenticated = true;
  const own = await fetch(`${base}/api/incidents/my/`);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(scopeSeen, { organizationId: "org", userId: "u" });
  assert.equal((await fetch(`${base}/api/analyst/incidents/assigned`)).status, 403);
  assert.equal((await fetch(`${base}/api/incidents/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await fetch(`${base}/api/admin/incidents/filters`)).status, 403);
  assert.equal(projectionCalls, 0);
  for (const readerRole of ["analityk", "admin"] as const) {
    role = readerRole;
    const before = listCalls;
    const invalid = await fetch(`${base}/api/analyst/incidents/assigned?status=foo`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");
    assert.equal(listCalls, before, "invalid enum must not reach repository");
    for (const status of ["Zgłoszony", "Raport w trakcie"]) {
      assert.equal((await fetch(`${base}/api/analyst/incidents/assigned?status=${encodeURIComponent(status)}`)).status, 200);
      assert.equal(statusSeen, status);
    }
    assert.equal((await fetch(`${base}/api/analyst/incidents/assigned`)).status, 200);
    assert.equal(statusSeen, undefined);
    assert.equal((await fetch(`${base}/api/analyst/incidents/assigned?status=foo&status=bar`)).status, 200);
    assert.equal(statusSeen, undefined);
  }
  role = "admin";
  const legacy = await fetch(`${base}/api/admin/incidents`);
  assert.equal(legacy.status, 200);
  assert(legacy.headers.has("deprecation"));
  const query = await fetch(`${base}/api/admin/incidents`, { method: "QUERY", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(query.status, 200);
  assert.equal(query.headers.get("accept-query"), "application/json");
  assert.deepEqual(await query.json(), await legacy.json());
  const filters = await fetch(`${base}/api/admin/incidents/filters/`);
  assert.equal(filters.status, 200);
  assert.deepEqual(await filters.json(), { success: true, data: { analysts: [] } });
  assert.equal((await fetch(`${base}/api/incidents/admin/stats`)).status, 200);
  assert.equal((await fetch(`${base}/api/admin/incidents`, { method: "QUERY", body: "{}" })).status, 415);
  const bad = await fetch(`${base}/api/admin/incidents`, { method: "QUERY", headers: { "content-type": "application/json" }, body: JSON.stringify({ filters: { organizationId: "foreign" } }) });
  assert.equal(bad.status, 400);
  assert.equal(projectionCalls, 2);
  const lookup = (address: string) => fetch(`${base}/api/analyst/incidents/${incident.id}/ip-reputation`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }),
  });
  role = "pracownik";
  const employeeDetail = await fetch(`${base}/api/incidents/${incident.id}`);
  assert.equal((await employeeDetail.json()).data.indicators, undefined);
  assert.equal((await lookup("1.1.1.1")).status, 403);
  role = "analityk";
  const analystDetail = await fetch(`${base}/api/analyst/incidents/${incident.id}`);
  assert.equal((await analystDetail.json()).data.ipReputation, true);
  organizationId = "foreign";
  assert.equal((await lookup("1.1.1.1")).status, 404);
  organizationId = "org";
  assert.equal((await lookup("8.8.8.8")).status, 404);
  assert.deepEqual((await (await lookup("10.0.0.7")).json()).data, { status: "not_public" });
  const allowed = await lookup("1.1.1.1");
  assert.equal(allowed.headers.get("cache-control"), "private, no-store");
  assert.equal((await allowed.json()).data.result.confidence, 15);
  assert.equal(externalLookups, 1);
  assert.deepEqual(audited, [{ actor: "u", status: "not_public" }, { actor: "u", status: "ready" }]);
  authenticated = false;
  assert.equal((await fetch(`${base}/api/incidents/my`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/incidents`)).status, 401);
  console.log("PASS NestJS HTTP lifecycle, fresh identity, tenant scope, RBAC, revocation, admin GET/QUERY parity and route precedence");
} finally {
  await new Promise<void>((resolve, reject) => server.close((e: Error | undefined) => e ? reject(e) : resolve()));
  await core.close();
}
