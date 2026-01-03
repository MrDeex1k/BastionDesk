/**
 * Custom Better-Auth Plugin: PassKey Check
 *
 * Plugin sprawdzający czy dla danego emaila są zarejestrowane klucze PassKey.
 */

import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";

type UserRow = {
	id: string;
};

export const passkeyCheckPlugin = () => {
	return {
		id: "passkey-check",
		endpoints: {
			/**
			 * POST /api/auth/passkey/check-availability
			 *
			 * Sprawdza czy dla podanego emaila istnieją zarejestrowane klucze PassKey.
			 * Endpoint publiczny (nie wymaga sesji).
			 */
			checkPasskeyAvailability: createAuthEndpoint(
				"/passkey/check-availability",
				{
					method: "POST",
					body: z.object({
						email: z.string().email("Nieprawidłowy format adresu email"),
					}),
				},
				async (ctx) => {
					const { email } = ctx.body;

					// Znajdź użytkownika po emailu
					const user = (await ctx.context.adapter.findOne({
						model: "user",
						where: [{ field: "email", value: email }],
					})) as UserRow | null;

					if (!user) {
						// Dla bezpieczeństwa nie ujawniamy czy użytkownik istnieje
						return ctx.json({
							hasPasskeys: false,
							count: 0,
						});
					}

					// Sprawdź czy użytkownik ma zarejestrowane PassKeys
					const passkeys = (await ctx.context.adapter.findMany({
						model: "passkey",
						where: [{ field: "userId", value: user.id }],
					})) as Array<{ id: string }>;

					return ctx.json({
						hasPasskeys: passkeys.length > 0,
						count: passkeys.length,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
