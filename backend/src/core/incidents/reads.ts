import { Context, Effect, Layer } from "effect";
import { DomainError } from "../../contracts/errors";
import type { LiveIdentity } from "../../identity/contract";
import type { Incident } from "../../types";

export type ListView = "mine" | "assigned" | "unassigned" | "all";
export interface IncidentScope {
	organizationId: string;
	userId?: string;
	analystId?: string;
	unassigned?: boolean;
}
export interface ListInput {
	page: number;
	limit: number;
	status?: string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}
export interface IncidentReads {
	list(scope: IncidentScope, input: ListInput): Promise<{ incidents: Incident[]; total: number }>;
	get(scope: IncidentScope, id: string, names: boolean): Promise<Incident | null>;
}
export class Reads extends Context.Tag("incidents/Reads")<Reads, IncidentReads>() {}
export const readsLayer = (port: IncidentReads) => Layer.succeed(Reads, port);

export function readScope(identity: LiveIdentity): IncidentScope {
	return {
		organizationId: identity.organizationId,
		...(identity.role === "pracownik" ? { userId: identity.subject } : {}),
	};
}
export function listIncidents(identity: LiveIdentity, view: ListView, input: ListInput) {
	return Effect.gen(function* () {
		if (
			(view !== "mine" && identity.role === "pracownik") ||
			(view === "all" && identity.role !== "admin")
		)
			return yield* Effect.fail(new DomainError("FORBIDDEN"));
		const scope: IncidentScope = { organizationId: identity.organizationId };
		if (view === "mine") scope.userId = identity.subject;
		if (view === "assigned") scope.analystId = identity.subject;
		if (view === "unassigned") scope.unassigned = true;
		const port = yield* Reads;
		return yield* Effect.tryPromise({
			try: () => port.list(scope, input),
			catch: () => new DomainError("INTERNAL_ERROR"),
		});
	});
}
export function getIncident(identity: LiveIdentity, id: string, names = false) {
	return Effect.gen(function* () {
		const port = yield* Reads;
		const incident = yield* Effect.tryPromise({
			try: () => port.get(readScope(identity), id, names),
			catch: () => new DomainError("INTERNAL_ERROR"),
		});
		if (
			!incident ||
			incident.organizationId !== identity.organizationId ||
			(identity.role === "pracownik" && incident.userId !== identity.subject)
		)
			return yield* Effect.fail(new DomainError("NOT_FOUND"));
		return incident;
	});
}
