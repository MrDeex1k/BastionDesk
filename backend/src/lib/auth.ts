/**
 * Better-Auth Configuration
 *
 * Konfiguracja autoryzacji i autentykacji z pluginami:
 * - Email/Password
 * - PassKeys (WebAuthn/U2F)
 * - HaveIBeenPwned (sprawdzanie kompromitacji haseł)
 * - Organization (multi-tenancy z rolami)
 */

import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { passkey } from "@better-auth/passkey";
import { organization, haveIBeenPwned } from "better-auth/plugins";
import { env } from "./env";
import { ac, admin, analityk, pracownik } from "./permissions";
import { passkeyCheckPlugin } from "./passkey-check-plugin";
import { organizationHelpersPlugin } from "./organization-helpers-plugin";

// =============================================================================
// Database Pool Configuration
// =============================================================================
const pool = new Pool({
	connectionString: env.DATABASE_URL,
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
});

// =============================================================================
// Better-Auth Instance
// =============================================================================
export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) =>
		origin.trim(),
	),
	database: pool,

	// =========================================================================
	// Email and Password Authentication
	// =========================================================================
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 12,
		maxPasswordLength: 128,
		autoSignIn: true,
		requireEmailVerification: false, // TODO: włączyć po konfiguracji email
	},

	// =========================================================================
	// Session Configuration
	// =========================================================================
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 dni
		updateAge: 60 * 60 * 24, // Odświeżaj co 24h
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache na 5 minut
		},
	},

	// =========================================================================
	// Plugins
	// =========================================================================
	plugins: [
		// ---------------------------------------------------------------------
		// PassKey (WebAuthn/U2F) - klucze sprzętowe
		// ---------------------------------------------------------------------
		passkey({
			rpID: env.WEBAUTHN_RP_ID,
			rpName: env.WEBAUTHN_RP_NAME,
			origin: env.WEBAUTHN_ORIGIN,
		}),

		// ---------------------------------------------------------------------
		// PassKey Check Plugin - sprawdzanie dostępności kluczy
		// ---------------------------------------------------------------------
		passkeyCheckPlugin(),

		// ---------------------------------------------------------------------
		// HaveIBeenPwned - sprawdzanie kompromitacji haseł
		// Używamy tylko customPasswordCompromisedMessage (zgodnie z API)
		// ---------------------------------------------------------------------
		haveIBeenPwned({
			customPasswordCompromisedMessage:
				"To hasło zostało wykryte w wyciekach danych. Proszę wybrać inne hasło.",
		}),

		// ---------------------------------------------------------------------
		// Organization - multi-tenancy z rolami
		// Role zgodne ze schematem bazy danych:
		//   - admin: pełne uprawnienia (właściciel)
		//   - analityk: dostęp do raportów i analityk
		//   - pracownik: podstawowy dostęp
		// ---------------------------------------------------------------------
		organization({
			ac,
			roles: {
				admin,
				analityk,
				pracownik,
			},
			allowUserToCreateOrganization: true,
			organizationLimit: 5, // Max 5 organizacji na użytkownika

			// Email zaproszenia (TODO: skonfigurować po dodaniu serwisu email)
			// sendInvitationEmail: async ({ email, organization, inviter, url }) => {
			//   // Implementacja wysyłania emaila
			// },
		}),

		// ---------------------------------------------------------------------
		// Organization Helpers Plugin - rozszerzenia funkcjonalności organizacji
		// ---------------------------------------------------------------------
		organizationHelpersPlugin(),
	],
});

// Eksport typu dla użycia w innych plikach
export type Auth = typeof auth;