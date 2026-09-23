import { Context, Effect, Layer } from "effect";
import { DomainError } from "../../contracts/errors";
import type { IncidentStatus } from "../../contracts";
import type { LiveIdentity } from "../../identity/contract";
import type { Incident } from "../../types";

export class IncidentRuleError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly kind: "missing" | "denied" | "conflict" | "invalid",
	) {
		super(message);
	}
}
export type CommandMode = "simple" | "workflow" | "admin";
export type IncidentChange =
	| { type: "assign" }
	| { type: "unassign" }
	| { type: "status"; status: IncidentStatus }
	| { type: "note"; note: string | null }
	| { type: "resolve"; resolved: boolean };
export type IncidentPatch = Partial<
	Pick<Incident, "analystId" | "status" | "analystNote" | "czyRozwiazany" | "dataRozwiazania">
>;
export type NewIncident = Pick<
	Incident,
	| "id"
	| "userDescription"
	| "userScreenshotPath"
	| "userScreenshotMetadata"
	| "userAttachmentPath"
	| "userAttachmentMetadata"
>;
export interface CommandResult {
	before: Incident;
	incident: Incident;
}
export interface IncidentWrites {
	mutate(
		identity: LiveIdentity,
		id: string,
		change: IncidentChange,
		mode: CommandMode,
		decide: (row: Incident) => IncidentPatch,
	): Promise<CommandResult>;
	create(identity: LiveIdentity, input: NewIncident): Promise<Incident>;
}
export class Writes extends Context.Tag("incidents/Writes")<Writes, IncidentWrites>() {}
export const writesLayer = (port: IncidentWrites) => Layer.succeed(Writes, port);
const transitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
	Zgłoszony: ["Raport w trakcie", "Odrzucone"],
	"Raport w trakcie": ["Raport złożony"],
	"Raport złożony": ["Sprawozdanie w trakcie"],
	"Sprawozdanie w trakcie": ["Sprawozdanie złożone"],
	"Sprawozdanie złożone": [],
	Odrzucone: [],
};
const missing = () =>
	new IncidentRuleError("INCIDENT_NOT_FOUND", "Zgłoszenie nie zostało znalezione", "missing");
/** Policy is evaluated on a row locked by the repository in the write transaction. */
export function decideIncidentChange(
	identity: LiveIdentity,
	row: Incident,
	change: IncidentChange,
	mode: CommandMode,
): IncidentPatch {
	if (row.organizationId !== identity.organizationId) throw missing();
	if (identity.role === "pracownik" || (mode === "admin" && identity.role !== "admin"))
		throw new DomainError("FORBIDDEN");
	const owns = row.analystId === identity.subject;
	const admin = identity.role === "admin";
	if (change.type === "assign") {
		if (row.analystId)
			throw new IncidentRuleError(
				"INCIDENT_ALREADY_ASSIGNED",
				"Zgłoszenie jest już przypisane do innego analityka",
				"conflict",
			);
		if (mode === "workflow" && !["Zgłoszony", "Raport w trakcie"].includes(row.status))
			throw new IncidentRuleError(
				"INVALID_INCIDENT_STATUS",
				"Zgłoszenie ma nieodpowiedni status do przypisania",
				"invalid",
			);
		return {
			analystId: identity.subject,
			...(mode === "workflow" ? { status: "Raport w trakcie" as const } : {}),
		};
	}
	if (change.type === "unassign") {
		if (mode === "admin") {
			if (!row.analystId) throw missing();
			return { analystId: null };
		}
		if ((!owns && !admin) || (mode === "simple" && !owns))
			throw new IncidentRuleError(
				"CANNOT_UNASSIGN_INCIDENT",
				"Brak uprawnień do oddania tego zgłoszenia do puli",
				"denied",
			);
		if (mode === "workflow" && ["Odrzucone", "Sprawozdanie złożone"].includes(row.status))
			throw new IncidentRuleError(
				"CANNOT_UNASSIGN_FINAL_STATUS",
				"Nie można oddać zgłoszenia w końcowym statusie",
				"invalid",
			);
		return {
			analystId: null,
			...(mode === "workflow" ? { status: "Zgłoszony" as const } : {}),
		};
	}
	if (!owns && !admin) {
		const details = {
			status: ["CANNOT_MODIFY_STATUS", "Brak uprawnień do zmiany statusu tego zgłoszenia"],
			note: ["CANNOT_MODIFY_NOTES", "Brak uprawnień do edycji notatek tego zgłoszenia"],
			resolve: [
				"CANNOT_RESOLVE_INCIDENT",
				"Brak uprawnień do oznaczenia zgłoszenia jako rozwiązanego",
			],
		} as const;
		const [code, message] = details[change.type];
		throw new IncidentRuleError(code, message, "denied");
	}
	if (change.type === "status") {
		if (mode === "workflow" && !transitions[row.status].includes(change.status))
			throw new IncidentRuleError(
				"INVALID_STATUS_TRANSITION",
				`Nieprawidłowe przejście statusu z '${row.status}' na '${change.status}'`,
				"invalid",
			);
		return {
			status: change.status,
			...(mode === "workflow" && ["Odrzucone", "Sprawozdanie złożone"].includes(change.status)
				? { czyRozwiazany: true, dataRozwiazania: new Date() }
				: {}),
		};
	}
	if (change.type === "note") return { analystNote: change.note };
	if (mode === "workflow" && row.czyRozwiazany)
		throw new IncidentRuleError(
			"ALREADY_RESOLVED",
			"Zgłoszenie jest już oznaczone jako rozwiązane",
			"invalid",
		);
	return {
		czyRozwiazany: change.resolved,
		...(change.resolved ? { dataRozwiazania: new Date() } : {}),
	};
}
function writeError(error: unknown) {
	return error instanceof DomainError || error instanceof IncidentRuleError
		? error
		: new DomainError("INTERNAL_ERROR");
}
export function changeIncident(
	identity: LiveIdentity,
	id: string,
	change: IncidentChange,
	mode: CommandMode,
) {
	return Effect.gen(function* () {
		if (identity.role === "pracownik" || (mode === "admin" && identity.role !== "admin"))
			return yield* Effect.fail(new DomainError("FORBIDDEN"));
		const port = yield* Writes;
		return yield* Effect.tryPromise({
			try: () =>
				port.mutate(identity, id, change, mode, (row) =>
					decideIncidentChange(identity, row, change, mode),
				),
			catch: writeError,
		});
	});
}
export function createIncident(identity: LiveIdentity, input: NewIncident) {
	return Effect.gen(function* () {
		const port = yield* Writes;
		return yield* Effect.tryPromise({
			try: () => port.create(identity, input),
			catch: writeError,
		});
	});
}
