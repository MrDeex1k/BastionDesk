import { expect, test } from "bun:test";
import { Effect } from "effect";
import assert from "node:assert/strict";
import { DomainError } from "../contracts/errors";
import { currentIdentity, identityLayer } from "./identity";
import { runCore } from "./runtime";

test("Core runtime preserves values and original domain failures with Effect 4", async () => {
	const value = { id: "incident" };
	const error = new DomainError("FORBIDDEN");
	expect(await runCore(Effect.succeed(value))).toBe(value);
	await assert.rejects(runCore(Effect.fail(error)), (failure) => failure === error);
	await assert.rejects(runCore(Effect.die(new Error("defect"))), /defect/);
});

test("Core identity timeout preserves the service unavailable domain error", async () => {
	const layer = identityLayer({ read: () => new Promise(() => {}) });
	await assert.rejects(
		runCore(currentIdentity(new Headers()).pipe(Effect.provide(layer))),
		(failure) => failure instanceof DomainError && failure.code === "SERVICE_UNAVAILABLE",
	);
});
