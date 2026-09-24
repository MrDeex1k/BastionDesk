import type { IdentityReader } from "../core/identity";
import { DomainError } from "../contracts/errors";
import { liveIdentitySchema } from "../identity/contract";
import { authIssuer } from "../identity/network-config";
import { internalFetch } from "../identity/transport";
import { createCoreVerifier } from "../identity/verifier";

let reader: IdentityReader | undefined;
function createReader(): IdentityReader {
	const origin = new URL(authIssuer).origin;
	const transport = internalFetch("backend", origin);
	const verifier = createCoreVerifier({
		issuer: authIssuer,
		transport,
		readCurrent: async (_claims, signal, token) => {
			const response = await transport(`${origin}/internal/identity/resolve`, {
				signal,
				headers: { authorization: `Bearer ${token}` },
			});
			if (response.status === 401) return null;
			if (!response.ok) throw new DomainError("SERVICE_UNAVAILABLE");
			return liveIdentitySchema.parse(await response.json());
		},
	});
	return {
		async read(headers) {
			const authorization = headers.get("authorization");
			if (!authorization?.startsWith("Bearer ")) return null;
			try {
				const { tokenId: _, ...identity } = await verifier.verify(authorization.slice(7));
				return liveIdentitySchema.parse(identity);
			} catch (error) {
				if (error instanceof DomainError && error.code === "UNAUTHORIZED") return null;
				throw error;
			}
		},
	};
}
export const coreIdentity: IdentityReader = {
	read: (headers) => (reader ??= createReader()).read(headers),
};
