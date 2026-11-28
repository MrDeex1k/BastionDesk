import assert from "node:assert/strict";
import { z } from "zod";
import { closeDatabase, getPgPool } from "./src/lib/database";
import { presignObject } from "./src/lib/storage";
import { withIncidentTransaction } from "./src/adapters/core-incident-writes";

const id = z.uuid().parse(process.argv[2]);
try {
  const storageKey = await withIncidentTransaction(async (client) => {
    const { rows } = await client.query<{ userAttachmentPath: string }>(
      `UPDATE incidents SET "userAttachmentMetadata"="userAttachmentMetadata" - 'contentHash'
       WHERE id=$1 AND "userDescription" LIKE 'Faza 7 test starszego załącznika %'
       RETURNING "userAttachmentPath"`, [id],
    );
    assert.ok(rows[0]?.userAttachmentPath);
    const detached = await client.query<{ job_id: string }>(
      "DELETE FROM yara_attachments WHERE incident_id=$1 RETURNING job_id", [id],
    );
    await client.query(
      "DELETE FROM yara_scan_jobs WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM yara_attachment_history WHERE job_id=$1)",
      [detached.rows[0]?.job_id],
    );
    return rows[0].userAttachmentPath;
  });
  const oldLink = await presignObject(storageKey, { expiresIn: 3 });
  const previous = await fetch(oldLink);
  assert.equal(previous.status, 200);
  await previous.body?.cancel();
  await Bun.sleep(3200);
  const expired = await fetch(oldLink);
  assert.equal(expired.status, 403);
  await expired.body?.cancel();
  assert.equal((await getPgPool().query("SELECT 1 FROM yara_attachments WHERE incident_id=$1", [id])).rowCount, 0);
} finally {
  await closeDatabase();
}
