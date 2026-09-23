import { Context, Effect, Layer } from "effect";
import { DomainError } from "../../contracts/errors";
import type { LiveIdentity } from "../../identity/contract";
import type { AdminIncidentsQuery } from "../../contracts/admin-queries";
import type { Incident } from "../../types";

export interface AdminProjection {
	query(
		input: AdminIncidentsQuery,
		organizationId: string,
	): Promise<{
		incidents: Incident[];
		pagination: { page: number; limit: number; total: number; totalPages: number };
	}>;
	filters(organizationId: string): Promise<unknown>;
	summary(organizationId: string): Promise<unknown>;
}
export class AdminReads extends Context.Tag("incidents/AdminReads")<
	AdminReads,
	AdminProjection
>() {}
export const adminReadsLayer = (port: AdminProjection) => Layer.succeed(AdminReads, port);
export function readAdmin(
	identity: LiveIdentity,
	request:
		| { type: "query"; input: AdminIncidentsQuery }
		| { type: "filters" }
		| { type: "summary" },
) {
	return Effect.gen(function* () {
		if (identity.role !== "admin") return yield* Effect.fail(new DomainError("FORBIDDEN"));
		const port = yield* AdminReads;
		return yield* Effect.tryPromise({
			try: async () => {
				if (request.type === "filters")
					return { success: true, data: await port.filters(identity.organizationId) };
				if (request.type === "summary") return await port.summary(identity.organizationId);
				const result = await port.query(request.input, identity.organizationId);
				return { success: true, data: result.incidents, pagination: result.pagination };
			},
			catch: () => new DomainError("INTERNAL_ERROR"),
		});
	});
}
