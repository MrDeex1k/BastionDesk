import { randomUUID } from "node:crypto";
import { jwt } from "better-auth/plugins";
import { DomainError } from "../contracts/errors";
import {
	accessClaimsSchema,
	liveIdentitySchema,
	identityPolicy,
	validateIssuer,
	type LiveIdentity,
} from "./contract";

/** Auth-side only. Do not import this plugin in Core. */
export function coreJwtPlugin(issuer: string) {
	return jwt({
		disableSettingJwtHeader: true,
		jwks: {
			keyPairConfig: { alg: identityPolicy.algorithm, crv: "Ed25519" },
			rotationInterval: identityPolicy.rotationSeconds,
			gracePeriod: identityPolicy.keyGraceSeconds,
		},
		jwt: {
			issuer: validateIssuer(issuer),
			audience: identityPolicy.audience,
			expirationTime: "60s",
			definePayload: () => ({}),
		},
	});
}

/** Call only after fresh session, user and membership checks, never from request body. */
export async function issueCoreToken(
	issuer: string,
	identity: LiveIdentity,
	sign: (payload: Record<string, unknown>) => Promise<string>,
	now = Math.floor(Date.now() / 1000),
): Promise<string> {
	const live = liveIdentitySchema.parse(identity);
	if (live.sessionExpiresAt <= now) throw new DomainError("UNAUTHORIZED");
	const claims = accessClaimsSchema.parse({
		iss: validateIssuer(issuer),
		aud: identityPolicy.audience,
		sub: live.subject,
		sid: live.sessionId,
		org_id: live.organizationId,
		iat: now,
		exp: Math.min(now + identityPolicy.ttlSeconds, live.sessionExpiresAt),
		jti: randomUUID(),
	});
	return sign(claims);
}

/** Rebuild headers instead of forwarding browser Authorization or identity headers. */
export function coreRequestHeaders(token: string): Headers {
	return new Headers({ authorization: `Bearer ${token}` });
}

/** Returns internal hop headers, never a public browser response. */
export function createBrowserIdentityBridge(options: {
	issuer: string;
	readBrowserIdentity(headers: Headers, signal: AbortSignal): Promise<LiveIdentity | null>;
	validateCsrf(request: Request): Promise<boolean>;
	sign(payload: Record<string, unknown>): Promise<string>;
}) {
	const issuer = validateIssuer(options.issuer);
	const origin = new URL(issuer).origin;
	return async (request: Request): Promise<Headers> => {
		if (request.headers.get("sec-fetch-site") === "cross-site")
			throw new DomainError("FORBIDDEN");
		if (!["GET", "HEAD", "OPTIONS", "QUERY"].includes(request.method)) {
			if (request.headers.get("origin") !== origin || !(await options.validateCsrf(request)))
				throw new DomainError("FORBIDDEN");
		}
		const identity = await options.readBrowserIdentity(request.headers, request.signal);
		if (!identity) throw new DomainError("UNAUTHORIZED");
		return coreRequestHeaders(
			await issueCoreToken(issuer, identity, (payload) => options.sign(payload)),
		);
	};
}
