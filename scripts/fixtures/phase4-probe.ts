// Executed only inside the isolated E2E backend container.
import assert from "node:assert/strict";
import { coreIncidentWrites } from "./src/adapters/core-incident-writes";
import { getPgPool, closeDatabase } from "./src/lib/database";
import { openBroker, publishConfirmed } from "./src/messaging/broker";
const pool = getPgPool();
try {
 if (process.argv[2] === "seed") {
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO "user" (id,email) VALUES ($1,$2)', [id, `${id}@probe.invalid`]);
  await pool.query('INSERT INTO organization (id,name,slug) VALUES ($1,$2,$1)', [id, "Phase 4 probe"]);
  const incident = await coreIncidentWrites.create({ subject: id, organizationId: id, role: "pracownik",
   sessionId: "probe", sessionExpiresAt: Math.floor(Date.now()/1000)+60 }, {
   id: crypto.randomUUID(), userDescription: "Isolated durable classification probe",
   userScreenshotPath: null, userScreenshotMetadata: {}, userAttachmentPath: null, userAttachmentMetadata: {},
  });
  const job = (await pool.query("SELECT id,state FROM core_jobs WHERE incident_id=$1", [incident.id])).rows[0];
  assert.equal(job.state, "pending"); assert.equal(incident.llmCategory, null);
  await Bun.write("/tmp/phase4-probe.json", JSON.stringify({ jobId: job.id, incidentId: incident.id }));
  console.log("PASS incident and outbox accepted while broker/worker stopped");
 } else {
  const saved = await Bun.file("/tmp/phase4-probe.json").json();
  let completed = false;
  for (let attempt = 0; attempt < 60; attempt++) {
   const row = (await pool.query("SELECT state FROM core_jobs WHERE id=$1", [saved.jobId])).rows[0];
   if (row.state === "completed") { completed = true; break; }
   await Bun.sleep(1000);
  }
  assert(completed, "worker recovers outstanding outbox after restart");
  const broker = await openBroker({ ...process.env,
   RABBITMQ_URL: `amqps://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@rabbitmq:5671`,
   RABBITMQ_TLS_CA: "/certs/ca/ca.crt",
  });
  try {
   await publishConfirmed(broker.publisher, saved.jobId);
   await publishConfirmed(broker.publisher, saved.jobId);
   await Bun.sleep(2000);
  } finally { await broker.connection.close(); }
  assert.equal((await pool.query('SELECT "llmCategory" FROM incidents WHERE id=$1', [saved.incidentId])).rows[0].llmCategory, "Żółty");
  assert.equal((await pool.query("SELECT * FROM core_audit WHERE command_id=$1", [saved.jobId])).rowCount, 1);
  console.log("PASS stopped-broker recovery and duplicate delivery produce one audited classification");
 }
} finally { await closeDatabase(); }
