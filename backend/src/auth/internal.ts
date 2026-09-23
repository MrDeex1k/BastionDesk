import { auth } from "../lib/auth";
import { authIssuer } from "../identity/network-config";
import { createCoreVerifier } from "../identity/verifier";
import { liveIdentitySchema } from "../identity/contract";
import { domainErrorResponse } from "../contracts/errors";
import { failure } from "./application";
import { authIdentity } from "./state";

// Same strict token profile on both ends; local JWKS transport never leaves auth.
const verifier = createCoreVerifier({
	issuer: authIssuer,
	transport: async () => Response.json(await auth.api.getJwks()),
	readCurrent: authIdentity.readCurrent,
});
export async function internalIdentity(request: Request): Promise<Response> {
	const path = new URL(request.url).pathname;
	if (path === "/api/auth/jwks") return Response.json(await auth.api.getJwks());
	if (path !== "/internal/identity/resolve") return failure(404, "NOT_FOUND");
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return failure(401, "UNAUTHORIZED");
	try {
		// Refresh is trusted/server-controlled; rotation must take effect immediately here.
		await verifier.refreshKeys();
		const { tokenId: _, ...identity } = await verifier.verify(authorization.slice(7));
		return Response.json(liveIdentitySchema.parse(identity));
	} catch (error) {
		const mapped = domainErrorResponse(error);
		return Response.json(mapped.body, { status: mapped.status });
	}
}
