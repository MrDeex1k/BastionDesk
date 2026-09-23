import { Context, Effect, Layer } from "effect";
import { DomainError } from "../contracts/errors";
import { liveIdentitySchema, type LiveIdentity } from "../identity/contract";

/** Auth owns session and membership storage. Core receives only this port. */
export interface IdentityReader {
	read(headers: Headers): Promise<LiveIdentity | null>;
}
export class Identity extends Context.Tag("core/Identity")<Identity, IdentityReader>() {}
export const identityLayer = (reader: IdentityReader) => Layer.succeed(Identity, reader);
export function currentIdentity(headers: Headers) {
	return Effect.gen(function* () {
		const port = yield* Identity;
		const live = yield* Effect.tryPromise({
			try: () => port.read(headers),
			catch: () => new DomainError("SERVICE_UNAVAILABLE"),
		}).pipe(
			Effect.timeoutFail({
				duration: "2 seconds",
				onTimeout: () => new DomainError("SERVICE_UNAVAILABLE"),
			}),
		);
		if (!live) return yield* Effect.fail(new DomainError("UNAUTHORIZED"));
		const parsed = liveIdentitySchema.safeParse(live);
		if (!parsed.success || parsed.data.sessionExpiresAt <= Math.floor(Date.now() / 1000))
			return yield* Effect.fail(new DomainError("UNAUTHORIZED"));
		return parsed.data;
	});
}
