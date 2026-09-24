import { auth, authPool } from "./instance";
import { findIdentity } from "./state-query";
import { createAuthIdentityAdapter } from "../identity/auth-state";

export const authIdentity = createAuthIdentityAdapter({
	resolveSessionId: async (headers) =>
		(await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.session.id ??
		null,
	findIdentity: (sessionId, signal) => findIdentity(authPool, sessionId, signal),
});
