import { createRemoteJWKSet, jwtVerify, customFetch, type FetchImplementation } from "jose";
import { DomainError } from "../contracts/errors";
import {
	accessClaimsSchema,
	identityPolicy,
	liveIdentitySchema,
	validateIssuer,
	type ReadCurrentIdentity,
} from "./contract";

/** Core imports no Better Auth instance or private signing material. */
export function createCoreVerifier(options: {
	issuer: string;
	readCurrent: ReadCurrentIdentity;
	transport?: FetchImplementation;
	now?: () => number;
}) {
	const issuer = validateIssuer(options.issuer);
	const keys = createRemoteJWKSet(new URL(`${issuer}/jwks`), {
		cacheMaxAge: identityPolicy.jwksCacheMs,
		cooldownDuration: identityPolicy.jwksCooldownMs,
		timeoutDuration: identityPolicy.dependencyTimeoutMs,
		...(options.transport ? { [customFetch]: options.transport } : {}),
	});
	return {
		// Operator-controlled refresh during planned rotation, never token-controlled.
		refreshKeys: () => keys.reload(),
		async verify(token: string) {
			const now = options.now?.() ?? Math.floor(Date.now() / 1000);
			if (!token || token.length > 8192) throw new DomainError("UNAUTHORIZED");
			let claims;
			try {
				const result = await jwtVerify(
					token,
					async (header, flattened) => {
						if (
							typeof header.kid !== "string" ||
							!header.kid ||
							header.jku ||
							header.jwk ||
							header.x5u
						)
							throw new Error("INVALID_HEADER");
						const key = await keys(header, flattened);
						if (key.algorithm.name !== "Ed25519") throw new Error("INVALID_KEY_CURVE");
						return key;
					},
					{
						issuer,
						audience: identityPolicy.audience,
						algorithms: [identityPolicy.algorithm],
						requiredClaims: ["iss", "aud", "sub", "sid", "org_id", "iat", "exp", "jti"],
						clockTolerance: identityPolicy.clockToleranceSeconds,
						maxTokenAge: identityPolicy.ttlSeconds,
						currentDate: new Date(now * 1000),
					},
				);
				claims = accessClaimsSchema.parse(result.payload);
				if (claims.iat > now + identityPolicy.clockToleranceSeconds)
					throw new Error("FUTURE_TOKEN");
			} catch {
				throw new DomainError("UNAUTHORIZED");
			}
			const controller = new AbortController();
			let timeout: ReturnType<typeof setTimeout> | undefined;
			try {
				const live = await Promise.race([
					options.readCurrent(claims, controller.signal, token),
					new Promise<never>((_, reject) => {
						timeout = setTimeout(() => {
							controller.abort();
							reject(new Error("AUTH_TIMEOUT"));
						}, identityPolicy.dependencyTimeoutMs);
					}),
				]);
				if (!live) throw new DomainError("UNAUTHORIZED");
				const current = liveIdentitySchema.parse(live);
				const checkedAt = options.now?.() ?? Math.floor(Date.now() / 1000);
				if (
					current.subject !== claims.sub ||
					current.sessionId !== claims.sid ||
					current.organizationId !== claims.org_id ||
					current.sessionExpiresAt <= checkedAt ||
					claims.exp <= checkedAt - identityPolicy.clockToleranceSeconds
				)
					throw new DomainError("UNAUTHORIZED");
				return {
					subject: current.subject,
					organizationId: current.organizationId,
					role: current.role,
					sessionId: current.sessionId,
					tokenId: claims.jti,
					sessionExpiresAt: current.sessionExpiresAt,
				};
			} catch (error) {
				if (error instanceof DomainError) throw error;
				throw new DomainError("SERVICE_UNAVAILABLE");
			} finally {
				clearTimeout(timeout);
			}
		},
	};
}
