import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { getIncident, listIncidents, readsLayer, type IncidentScope } from "./reads";
import { runCore } from "../runtime";
import type { Incident } from "../../types";
import type { LiveIdentity } from "../../identity/contract";
const user: LiveIdentity = {
	subject: "user-a",
	organizationId: "org-a",
	role: "pracownik",
	sessionId: "session",
	sessionExpiresAt: 9999999999,
};
test("read scopes bind tenant, reporter and analyst independently", async () => {
	const scopes: IncidentScope[] = [];
	const layer = readsLayer({
		list: async (scope) => {
			scopes.push(scope);
			return { incidents: [], total: 0 };
		},
		get: async () => null,
	});
	await runCore(listIncidents(user, "mine", { page: 1, limit: 20 }).pipe(Effect.provide(layer)));
	await runCore(
		listIncidents({ ...user, role: "analityk" }, "assigned", { page: 1, limit: 20 }).pipe(
			Effect.provide(layer),
		),
	);
	expect(scopes).toEqual([
		{ organizationId: "org-a", userId: "user-a" },
		{ organizationId: "org-a", analystId: "user-a" },
	]);
	await assert.rejects(
		runCore(listIncidents(user, "all", { page: 1, limit: 20 }).pipe(Effect.provide(layer))),
		{ code: "FORBIDDEN" },
	);
	expect(scopes.length).toBe(2);
});
test("detail conceals missing, foreign tenant and foreign reporter even on faulty adapter", async () => {
	for (const incident of [
		null,
		{ organizationId: "org-b", userId: "user-a" },
		{ organizationId: "org-a", userId: "user-b" },
	]) {
		const layer = readsLayer({
			list: async () => ({ incidents: [], total: 0 }),
			get: async () => incident as Incident | null,
		});
		await assert.rejects(
			runCore(getIncident(user, crypto.randomUUID()).pipe(Effect.provide(layer))),
			{ code: "NOT_FOUND" },
		);
	}
});
