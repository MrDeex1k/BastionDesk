/**
 * Better-Auth Configuration
 *
 * Konfiguracja autoryzacji i autentykacji z pluginami:
 * - Email/Password
 * - PassKeys (WebAuthn/U2F)
 * - HaveIBeenPwned (sprawdzanie kompromitacji haseł)
 * - Organization (multi-tenancy z rolami)
 */

import { authSecret } from "./secrets";
import fs from "node:fs";
import { coreJwtPlugin } from "../identity/auth-bridge";
import { authIssuer } from "../identity/network-config";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { haveIBeenPwned, organization } from "better-auth/plugins";
import { Pool } from "pg";
import { sendResetPasswordEmail, sendVerificationEmail } from "../lib/email";
import { env } from "../lib/env";
import { organizationHelpersPlugin } from "../lib/organization-helpers-plugin";
import { passkeyCheckPlugin } from "../lib/passkey-check-plugin";
import { ac, admin, analityk, pracownik } from "../lib/permissions";

// Database Pool Configuration
export const authPool = new Pool({
	connectionString: env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: true,
		ca: fs.readFileSync(env.DB_TLS_CA_PATH, "utf8"),
		cert: fs.readFileSync(env.DB_TLS_CERT_PATH, "utf8"),
		key: fs.readFileSync(env.DB_TLS_KEY_PATH, "utf8"),
	},
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
	query_timeout: 2000,
});

// Better-Auth Instance
const passwordBreachPlugins = env.AUTH_PASSWORD_BREACH_CHECK_ENABLED
	? [
			haveIBeenPwned({
				customPasswordCompromisedMessage:
					"To hasło zostało wykryte w wyciekach danych. Proszę wybrać inne hasło.",
			}),
		]
	: [];

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: authSecret,
	trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGIN_LIST,
	database: authPool,
	disabledPaths: ["/token"],

	// Email and Password Authentication
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 10,
		maxPasswordLength: 128,
		autoSignIn: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url, token }, _request) => {
			void sendResetPasswordEmail({ user, url, token });
		},
		resetPasswordCallbackURL: `${env.FRONTEND_URL}/reset-password`, // Przekierowanie po kliknięciu w link
	},

	// Email Verification Configuration
	emailVerification: {
		sendVerificationEmail: async ({ user, url, token }, _request) => {
			void sendVerificationEmail({ user, url, token });
		},
		sendOnSignUp: true,
		autoSignInAfterVerification: true, // Auto-login po weryfikacji
		callbackURL: `${env.FRONTEND_URL}/login`,
	},

	// Session Configuration
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 dni
		updateAge: 60 * 60 * 24, // Odświeżaj co 24h
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache na 5 minut
		},
	},

	// Plugins
	plugins: [
		coreJwtPlugin(authIssuer),
		// PassKey (WebAuthn/U2F) - klucze sprzętowe
		passkey({
			rpID: env.WEBAUTHN_RP_ID,
			rpName: env.WEBAUTHN_RP_NAME,
			origin: env.WEBAUTHN_ORIGIN,
			schema: {
				passkey: {
					fields: {
						credentialID: "credentialId",
					},
				},
			},
		}),

		// PassKey Check Plugin - sprawdzanie dostępności kluczy
		passkeyCheckPlugin(),

		// HaveIBeenPwned jest wyłączany wyłącznie w izolowanym fixture baseline'u,
		// aby test nie zależał od zewnętrznej usługi. Domyślnie pozostaje włączony.
		...passwordBreachPlugins,

		// Organization - multi-tenancy z rolami
		// Role zgodne ze schematem bazy danych:
		//   - admin: pełne uprawnienia (właściciel)
		//   - analityk: dostęp do raportów i analityk
		//   - pracownik: podstawowy dostęp
		organization({
			ac,
			creatorRole: "admin",
			roles: {
				admin,
				analityk,
				pracownik,
			},
			allowUserToCreateOrganization: true,
			organizationLimit: 5, // Max 5 organizacji na użytkownika
			requireEmailVerificationOnInvitation: true, // Wymagaj weryfikacji przed akceptacją
		}),

		// Organization Helpers Plugin - rozszerzenia funkcjonalności organizacji
		organizationHelpersPlugin(),
	],
});

// Eksport typu dla użycia w innych plikach
export type Auth = typeof auth;
