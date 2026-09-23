import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { incidentFile, storageLayer } from "./service";
import { readsLayer } from "../incidents/reads";
import { runCore } from "../runtime";
import type { LiveIdentity } from "../../identity/contract";
import type { Incident } from "../../types";
const identity: LiveIdentity = {
	subject: "u",
	organizationId: "org",
	role: "pracownik",
	sessionId: "s",
	sessionExpiresAt: 9999999999,
};
test("file storage is accessed only after tenant, owner and metadata checks", async () => {
	let reads = 0;
	let row = {
		organizationId: "foreign",
		userId: "u",
		userAttachmentPath: "server-key",
		userAttachmentMetadata: { filename: "proof.txt" },
	} as unknown as Incident;
	const storage = storageLayer({
		read: async (key) => {
			reads++;
			expect(key).toBe("server-key");
			return Buffer.from("proof");
		},
		presign: async () => "signed",
	});
	const repo = readsLayer({
		get: async () => row,
		list: async () => ({ incidents: [], total: 0 }),
	});
	const download = (filename: string) =>
		runCore(
			incidentFile(identity, "id", "attachments", filename).pipe(
				Effect.provide(repo),
				Effect.provide(storage),
			),
		);
	await assert.rejects(download("proof.txt"), { code: "NOT_FOUND" });
	row = { ...row, organizationId: "org", userId: "other" };
	await assert.rejects(download("proof.txt"), { code: "NOT_FOUND" });
	row = { ...row, userId: "u" };
	await assert.rejects(download("forged.txt"), { code: "FILE_NOT_FOUND" });
	expect(reads).toBe(0);
	expect((await download("proof.txt")).content).toEqual(Buffer.from("proof"));
	expect(reads).toBe(1);
});
