import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createCoreApplication } from "../backend/src/core/application";
import type { LiveIdentity } from "../backend/src/identity/contract";
import type { Incident } from "../backend/src/types";
import { ipReputation } from "../backend/src/core/ioc/enrichment";
import { coreLookupHandler, coreLookupPaths, coreReadHandler, coreReadPaths, coreReputationHandler, coreReputationPaths, coreUrlhausHandler, coreUrlhausPaths } from "../backend/src/adapters/core-http";
import { providerLookups } from "../backend/src/core/ioc/provider-lookups";
import { urlhaus } from "../backend/src/adapters/urlhaus";
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
const reportUrl = "https://sample.example/payload";
const absentUrl = "https://sample.example/other";
const incident: Incident = {
  id: crypto.randomUUID(), dataZgloszenia: date, userId: "u", organizationId: "org",
  status: "Zgłoszony", userDescription: `Adres źródłowy 1.1.1.1, prywatny 10.0.0.7 oraz ${reportUrl} i ${absentUrl}.`,
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
let feedRequests = 0;
const urlhausAudits: Array<{ organizationId: string; status: string }> = [];
const urlhausFeed = urlhaus(async () => "test-key-for-urlhaus-fixture", async () => {
  feedRequests++;
  return new Response(`"1","2026-01-01 00:00:00","${reportUrl}","online"\n`);
});
let otxRequests = 0;
const lookups = providerLookups({ otx: {
  keyFor: async (org) => org === "org" ? "fixture-key" : undefined,
  lookup: async () => { otxRequests++; return { status: "ready", summary: { kind: "pulses", count: 2 } }; },
} });
const core = await createCoreApplication([
  ...coreAdminRoutes.map((route) => ({ ...route, handle: admin })),
  { paths: coreReadPaths, handle: coreReadHandler(identity, reads, reputation, urlhausFeed, lookups) },
  { method: "post", paths: coreReputationPaths, handle: coreReputationHandler(identity, reads, async (actor, _id, status) => {
    audited.push({ actor: actor.subject, status });
  }, reputation) },
  { method: "post", paths: coreUrlhausPaths, handle: coreUrlhausHandler(identity, reads, async (actor, _id, status) => {
    urlhausAudits.push({ organizationId: actor.organizationId, status });
  }, urlhausFeed) },
  { method: "post", paths: coreLookupPaths, handle: coreLookupHandler(identity, reads, async () => {}, lookups) },
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
  const checkUrl = (url: string) => fetch(`${base}/api/analyst/incidents/${incident.id}/urlhaus`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
  });
  const checkOtx = (value: string) => fetch(`${base}/api/analyst/incidents/${incident.id}/ioc-enrichment`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "otx", kind: "ipv4", value }),
  });
  role = "pracownik";
  const employeeDetail = await fetch(`${base}/api/incidents/${incident.id}`);
  const employeeData = (await employeeDetail.json()).data;
  assert.equal(employeeData.indicators, undefined);
  assert.equal(employeeData.urlhaus, undefined);
  assert.equal(employeeData.lookupProviders, undefined);
  assert.equal((await lookup("1.1.1.1")).status, 403);
  assert.equal((await checkUrl(reportUrl)).status, 403);
  assert.equal((await checkOtx("1.1.1.1")).status, 403);
  role = "analityk";
  const analystDetail = await fetch(`${base}/api/analyst/incidents/${incident.id}`);
  const analystData = (await analystDetail.json()).data;
  assert.equal(analystData.ipReputation, true);
  assert.equal(analystData.urlhaus, true);
  assert.deepEqual(analystData.lookupProviders, ["otx"]);
  organizationId = "foreign";
  assert.equal((await lookup("1.1.1.1")).status, 404);
  assert.equal((await checkUrl(reportUrl)).status, 404);
  assert.equal((await checkOtx("1.1.1.1")).status, 404);
  organizationId = "org";
  assert.equal((await lookup("8.8.8.8")).status, 404);
  assert.equal((await checkUrl("https://unknown.example/")).status, 404);
  assert.equal((await checkOtx("8.8.8.8")).status, 404);
  assert.equal((await (await checkOtx("10.0.0.7")).json()).data.status, "not_public");
  assert.equal(otxRequests, 0);
  assert.deepEqual((await (await checkOtx("1.1.1.1")).json()).data.summary, { kind: "pulses", count: 2 });
  assert.equal(otxRequests, 1);
  assert.equal(feedRequests, 0);
  assert.deepEqual((await (await lookup("10.0.0.7")).json()).data, { status: "not_public" });
  const allowed = await lookup("1.1.1.1");
  assert.equal(allowed.headers.get("cache-control"), "private, no-store");
  assert.equal((await allowed.json()).data.result.confidence, 15);
  assert.equal(externalLookups, 1);
  assert.deepEqual(audited, [{ actor: "u", status: "not_public" }, { actor: "u", status: "ready" }]);
  const match = await checkUrl(reportUrl);
  assert.equal(match.headers.get("cache-control"), "private, no-store");
  assert.equal((await match.json()).data.status, "matched");
  role = "admin";
  assert.equal((await (await checkUrl(absentUrl)).json()).data.status, "not_found");
  assert.equal(feedRequests, 1);
  assert.deepEqual(urlhausAudits, [{ organizationId: "org", status: "matched" }, { organizationId: "org", status: "not_found" }]);
  authenticated = false;
  assert.equal((await fetch(`${base}/api/incidents/my`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/incidents`)).status, 401);
  console.log("PASS NestJS HTTP lifecycle, fresh identity, tenant scope, RBAC, revocation, admin GET/QUERY parity and route precedence");
} finally {
  await new Promise<void>((resolve, reject) => server.close((e: Error | undefined) => e ? reject(e) : resolve()));
  await core.close();
}
