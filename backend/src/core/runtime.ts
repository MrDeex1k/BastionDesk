import { Effect, Result } from "effect";

/** Preserve typed domain failures at the HTTP edge, never leak FiberFailure. */
export async function runCore<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
	const result = await Effect.runPromise(Effect.result(effect));
	if (Result.isFailure(result)) throw result.failure;
	return result.success;
}
