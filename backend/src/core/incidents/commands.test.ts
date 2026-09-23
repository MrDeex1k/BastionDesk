import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { decideIncidentChange } from "./commands";
import type { Incident } from "../../types";
import type { LiveIdentity } from "../../identity/contract";
const identity: LiveIdentity = {
	subject: "analyst",
	role: "analityk",
	organizationId: "org",
	sessionId: "session",
	sessionExpiresAt: 9999999999,
};
const row = {
	id: crypto.randomUUID(),
	organizationId: "org",
	analystId: "analyst",
	status: "Zgłoszony",
	czyRozwiazany: false,
} as Incident;
test("workflow preserves transition rules while simple API allows explicit status", () => {
	assert.throws(
		() =>
			decideIncidentChange(
				identity,
				row,
				{ type: "status", status: "Sprawozdanie złożone" },
				"workflow",
			),
		{ code: "INVALID_STATUS_TRANSITION" },
	);
	expect(
		decideIncidentChange(
			identity,
			row,
			{ type: "status", status: "Sprawozdanie złożone" },
			"simple",
		),
	).toEqual({ status: "Sprawozdanie złożone" });
	const terminal = decideIncidentChange(
		identity,
		row,
		{ type: "status", status: "Odrzucone" },
		"workflow",
	);
	expect(terminal.czyRozwiazany).toBe(true);
	expect(terminal.dataRozwiazania).toBeInstanceOf(Date);
});
test("write policies conceal foreign tenants and reject non-owners", () => {
	assert.throws(
		() =>
			decideIncidentChange(
				identity,
				{ ...row, organizationId: "foreign" },
				{ type: "note", note: "x" },
				"workflow",
			),
		{ code: "INCIDENT_NOT_FOUND" },
	);
	assert.throws(
		() =>
			decideIncidentChange(
				identity,
				{ ...row, analystId: "other" },
				{ type: "note", note: "x" },
				"workflow",
			),
		{ code: "CANNOT_MODIFY_NOTES" },
	);
	assert.throws(
		() =>
			decideIncidentChange(
				{ ...identity, role: "pracownik" },
				row,
				{ type: "resolve", resolved: true },
				"simple",
			),
		{ code: "FORBIDDEN" },
	);
});
test("assignment, release and resolve preserve API-specific rules", () => {
	assert.throws(() => decideIncidentChange(identity, row, { type: "assign" }, "workflow"), {
		code: "INCIDENT_ALREADY_ASSIGNED",
	});
	expect(
		decideIncidentChange(identity, { ...row, analystId: null }, { type: "assign" }, "workflow"),
	).toEqual({ analystId: "analyst", status: "Raport w trakcie" });
	assert.throws(
		() =>
			decideIncidentChange(
				identity,
				{ ...row, status: "Odrzucone" },
				{ type: "unassign" },
				"workflow",
			),
		{ code: "CANNOT_UNASSIGN_FINAL_STATUS" },
	);
	expect(
		decideIncidentChange({ ...identity, role: "admin" }, row, { type: "unassign" }, "admin"),
	).toEqual({ analystId: null });
	assert.throws(
		() =>
			decideIncidentChange(
				identity,
				{ ...row, czyRozwiazany: true },
				{ type: "resolve", resolved: true },
				"workflow",
			),
		{ code: "ALREADY_RESOLVED" },
	);
});
