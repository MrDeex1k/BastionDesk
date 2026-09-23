import { Effect, Either } from "effect";

/** Preserve typed domain failures at the HTTP edge, never leak FiberFailure. */
export async function runCore<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
	const result = await Effect.runPromise(Effect.either(effect));
	if (Either.isLeft(result)) throw result.left;
	return result.right;
}
