import { z } from "zod";
import { identityIdSchema, userRoleSchema } from "../contracts";

export const identityPolicy = {
	algorithm: "EdDSA",
	audience: "bastiondesk-core",
	ttlSeconds: 60,
	clockToleranceSeconds: 5,
	jwksCacheMs: 30_000,
	jwksCooldownMs: 5_000,
	dependencyTimeoutMs: 2_000,
	rotationSeconds: 86_400,
	keyGraceSeconds: 300,
} as const;

export const accessClaimsSchema = z
	.strictObject({
		iss: z.url(),
		aud: z.literal(identityPolicy.audience),
		sub: identityIdSchema,
		sid: identityIdSchema,
		org_id: identityIdSchema,
		iat: z.number().int().nonnegative(),
		exp: z.number().int().positive(),
		jti: z.uuid(),
	})
	.refine(
		(claims) => claims.exp > claims.iat && claims.exp - claims.iat <= identityPolicy.ttlSeconds,
	);
export type AccessClaims = z.infer<typeof accessClaimsSchema>;

// Produced by the auth owner from authoritative session/user/member records.
export const liveIdentitySchema = z.strictObject({
	subject: identityIdSchema,
	sessionId: identityIdSchema,
	organizationId: identityIdSchema,
	role: userRoleSchema,
	sessionExpiresAt: z.number().int().positive(),
});
export type LiveIdentity = z.infer<typeof liveIdentitySchema>;
export type ReadCurrentIdentity = (
	claims: AccessClaims,
	signal: AbortSignal,
	token?: string,
) => Promise<LiveIdentity | null>;

export function validateIssuer(issuer: string): string {
	const url = new URL(issuer);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== "/api/auth"
	) {
		throw new Error("INVALID_AUTH_ISSUER");
	}
	return url.href;
}
