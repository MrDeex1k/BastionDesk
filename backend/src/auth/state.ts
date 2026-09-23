import { auth, authPool } from "./instance";
import { liveIdentitySchema } from "../identity/contract";
import { createAuthIdentityAdapter } from "../identity/auth-state";

export const authIdentity = createAuthIdentityAdapter({
	resolveSessionId: async (headers) =>
		(await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.session.id ??
		null,
	findIdentity: async (sessionId, signal) => {
		signal.throwIfAborted();
		const client = await authPool.connect();
		try {
			await client.query("BEGIN");
			await client.query("SET LOCAL statement_timeout = 1500");
			const result = await client.query(
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
			await client.query("COMMIT");
			signal.throwIfAborted();
			const row = result.rows[0];
			return row ? liveIdentitySchema.parse(row) : null;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	},
});
