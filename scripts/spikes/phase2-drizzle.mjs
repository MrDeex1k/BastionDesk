// Run with Bun; install pinned dependencies outside the repository first.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { schemaFingerprint } from "../../backend/src/migrations/schema.ts";

if (!process.env.DRIZZLE_SPIKE_DIR) throw new Error("DRIZZLE_SPIKE_DIR_REQUIRED");
const require = createRequire(resolve(process.env.DRIZZLE_SPIKE_DIR, "package.json"));
const { Client } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { pgTable, pgEnum, uuid, text, boolean } = require("drizzle-orm/pg-core");
const { eq, sql } = require("drizzle-orm");
const name = `bastiondesk-drizzle-${randomUUID()}`;
const password = randomUUID();
let started = false;
let client;
async function docker(args) {
  const child = Bun.spawn(["docker", ...args], {
    env: { ...process.env, POSTGRES_PASSWORD: password }, stdout: "pipe", stderr: "pipe",
  });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  assert.equal(code, 0, error);
  return output;
}
async function cleanup() {
  await client?.end();
  if (started) { await docker(["rm", "-f", name]); started = false; }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
}
try {
  await docker(["run", "-d", "--name", name, "--tmpfs", "/var/lib/postgresql:rw",
    "-e", "POSTGRES_PASSWORD", "-p", "127.0.0.1::5432", "postgres:18.6"]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await docker(["exec", name, "pg_isready", "-U", "postgres"]); ready = true; break; }
    catch { await Bun.sleep(500); }
  }
  assert(ready);
  const port = Number((await docker(["port", name, "5432/tcp"])).trim().split(":").at(-1));
  client = new Client({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
  await client.connect();
  for (const file of ["01-init.sql", "02-create-auth.sql", "03-create-app.sql"]) {
    await client.query(await readFile(new URL(`../../database/init-sql/${file}`, import.meta.url), "utf8"));
  }
  await client.query("SET search_path = public, pg_catalog");
  const before = await schemaFingerprint(client);
  await client.query(`INSERT INTO "user" (id,email) VALUES ('a','a@example.test'),('b','b@example.test');
    INSERT INTO organization (id,name,slug) VALUES ('a','A','a'),('b','B','b');`);
  const status = pgEnum("IncidentStatus", ["Zgłoszony", "Raport w trakcie", "Raport złożony", "Sprawozdanie w trakcie", "Sprawozdanie złożone", "Odrzucone"]);
  const incidents = pgTable("incidents", {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("userId").notNull(), organizationId: text("organizationId").notNull(),
    userDescription: text("userDescription").notNull(),
    status: status("status").default("Zgłoszony"), resolved: boolean("czyRozwiazany").default(false),
  });
  const db = drizzle(client);
  const created = await db.insert(incidents).values([
    { userId: "a", organizationId: "a", userDescription: "A fixture" },
    { userId: "b", organizationId: "b", userDescription: "B fixture" },
  ]).returning();
  assert.equal(created.length, 2);
  assert.equal(created[0].id[14], "7");
  assert.equal((await db.select().from(incidents).where(eq(incidents.organizationId, "a"))).length, 1);
  console.log("PASS Drizzle mapping, uuidv7 and tenant-scoped read");
  await db.update(incidents).set({ status: "Raport w trakcie", resolved: true }).where(eq(incidents.organizationId, "a"));
  assert.equal((await client.query("SELECT count(*) FROM incident_audit_log")).rows[0].count, "1");
  assert.equal((await client.query('SELECT count(*) FROM incidents WHERE "dataRozwiazania" IS NOT NULL')).rows[0].count, "1");
  console.log("PASS existing audit/resolution triggers with Drizzle writes");
  await assert.rejects(db.transaction(async (tx) => {
    await tx.execute(sql`CREATE TABLE drizzle_rollback_probe (id int)`);
    await tx.insert(incidents).values({ userId: "a", organizationId: "a", userDescription: "Rollback fixture" });
    throw new Error("EXPECTED_ROLLBACK");
  }), /EXPECTED_ROLLBACK/);
  assert.equal((await client.query("SELECT to_regclass('drizzle_rollback_probe') AS value")).rows[0].value, null);
  assert.equal((await db.select().from(incidents)).length, 2);
  assert.equal(await schemaFingerprint(client), before);
  console.log("PASS custom SQL transaction rollback and unchanged legacy schema");
} finally {
  await cleanup();
  console.log("Isolated Drizzle PostgreSQL removed");
}
