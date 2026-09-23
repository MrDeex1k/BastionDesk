import { auth } from "../lib/auth";
import { queryOne } from "../lib/database";
import { liveIdentitySchema } from "../identity/contract";
import { createAuthIdentityAdapter } from "../identity/auth-state";

export const authIdentity = createAuthIdentityAdapter({
	resolveSessionId: async (headers) =>
		(await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.session.id ??
		null,
	findIdentity: async (sessionId, signal) => {
		signal.throwIfAborted();
		const row = await queryOne(
			`
			SELECT s."userId" AS subject, s.id AS "sessionId",
			       s."activeOrganizationId" AS "organizationId", m.role,
			       floor(extract(epoch FROM s."expiresAt"))::integer AS "sessionExpiresAt"
			FROM session s JOIN "user" u ON u.id = s."userId"
			JOIN member m ON m."userId" = s."userId" AND m."organizationId" = s."activeOrganizationId"
			WHERE s.id = $1 AND s."expiresAt" > now() AND u."isActive" = true AND u."emailVerified" = true
		`,
			[sessionId],
		);
		signal.throwIfAborted();
		return row ? liveIdentitySchema.parse(row) : null;
	},
});
