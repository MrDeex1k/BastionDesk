import { auth } from "../lib/auth";
import { queryOne } from "../lib/database";
import type { IdentityReader } from "../core/identity";
import { liveIdentitySchema } from "../identity/contract";

/** Auth-owned in-process adapter. Replace this port with mTLS in phase 5. */
export const coreIdentity: IdentityReader = {
	async read(headers) {
		const current = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
		if (!current) return null;
		// One fresh snapshot, independent of Better Auth's browser cookie cache.
		const row = await queryOne(
			`
			SELECT s."userId" AS subject, s.id AS "sessionId",
			       s."activeOrganizationId" AS "organizationId", m.role,
			       floor(extract(epoch FROM s."expiresAt"))::integer AS "sessionExpiresAt"
			FROM session s JOIN "user" u ON u.id = s."userId"
			JOIN member m ON m."userId" = s."userId" AND m."organizationId" = s."activeOrganizationId"
			WHERE s.id = $1 AND s."expiresAt" > now() AND u."isActive" = true AND u."emailVerified" = true
		`,
			[current.session.id],
		);
		return row ? liveIdentitySchema.parse(row) : null;
	},
};
