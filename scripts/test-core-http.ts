import assert from "node:assert/strict";
import { createCoreApplication } from "../backend/src/core/application";

const core = await createCoreApplication();
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
  console.log("PASS NestJS Core HTTP startup and response");
} finally {
  await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  await core.close();
}
