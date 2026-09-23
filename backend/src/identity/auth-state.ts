import { liveIdentitySchema, type LiveIdentity, type ReadCurrentIdentity } from "./contract";
import { DomainError } from "../contracts/errors";

export interface AuthStatePort {
	// Implement with Better Auth getSession({query:{disableCookieCache:true}}).
	resolveSessionId(headers: Headers): Promise<string | null>;
	// Auth-owned authoritative session + active user + verified email + current member.
	// Null for revoked/expired session, disabled user or removed membership.
	findIdentity(sessionId: string, signal: AbortSignal): Promise<LiveIdentity | null>;
}

export function createAuthIdentityAdapter(port: AuthStatePort) {
	return {
		async forBrowser(headers: Headers, signal: AbortSignal): Promise<LiveIdentity | null> {
			const sessionId = await port.resolveSessionId(headers);
			if (!sessionId) return null;
			const identity = await port.findIdentity(sessionId, signal);
			if (identity && identity.sessionId !== sessionId) throw new DomainError("UNAUTHORIZED");
			return identity ? liveIdentitySchema.parse(identity) : null;
		},
		readCurrent: (async (claims, signal) => {
			const identity = await port.findIdentity(claims.sid, signal);
			return identity ? liveIdentitySchema.parse(identity) : null;
		}) satisfies ReadCurrentIdentity,
	};
}
