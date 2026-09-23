import assert from "node:assert/strict";
import { expect, test } from "bun:test";
import { currentIdentity, identityLayer } from "./identity";
import { runCore } from "./runtime";
import { Effect } from "effect";

test("Core uses fresh auth state, ignores browser identity claims and fails closed", async () => {
	let live = true;
	let calls = 0;
	const layer = identityLayer({
		read: async () => {
			calls++;
			return live
				? {
						subject: "real-user",
						sessionId: "session",
						organizationId: "org",
						role: "pracownik",
						sessionExpiresAt: Math.floor(Date.now() / 1000) + 60,
					}
				: null;
		},
	});
	const read = () =>
		runCore(
			currentIdentity(
				new Headers({ "x-user-id": "attacker", authorization: "Bearer fake" }),
			).pipe(Effect.provide(layer)),
		);
	expect((await read()).subject).toBe("real-user");
	live = false;
	await assert.rejects(read(), { code: "UNAUTHORIZED" });
	expect(calls).toBe(2);
	await assert.rejects(
		runCore(
			currentIdentity(new Headers()).pipe(
				Effect.provide(
					identityLayer({
						read: async () => {
							throw new Error("private database error");
						},
					}),
				),
			),
		),
		{ code: "SERVICE_UNAVAILABLE" },
	);
});
