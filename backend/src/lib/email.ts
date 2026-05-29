/**
 * Email Service - Główny serwis wysyłki emaili
 *
 * Funkcje do wysyłki emaili w ramach Better-Auth:
 * - Weryfikacja adresu email
 * - Reset hasła
 * - Zaproszenia do organizacji
 */

import {
	generateVerificationEmailHtml,
	getVerificationEmailSubject,
	type VerificationEmailData,
} from "../templates/email-verification";
import {
	generatePasswordResetEmailHtml,
	getPasswordResetEmailSubject,
	type PasswordResetEmailData,
} from "../templates/password-reset";
import { sendEmail } from "../utils/email-sender";

// Types

/**
 * User data przekazywane przez Better-Auth
 */
interface BetterAuthUser {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Parametry dla sendVerificationEmail
 */
export interface SendVerificationEmailParams {
	user: BetterAuthUser;
	url: string;
	token: string;
}

/**
 * Parametry dla sendResetPasswordEmail
 */
export interface SendResetPasswordEmailParams {
	user: BetterAuthUser;
	url: string;
	token: string;
}

// Email Functions

/**
 * Wysyła email weryfikacyjny po rejestracji
 *
 * WAŻNE: Funkcja jest wywoływana przez Better-Auth z `void` aby uniknąć timing attacks.
 * Better-Auth nie czeka na zakończenie wysyłki emaila.
 */
export async function sendVerificationEmail(
	params: SendVerificationEmailParams,
): Promise<void> {
	const { user, url, token } = params;

	try {
		const emailData: VerificationEmailData = {
			userName: user.name || "Użytkowniku",
			userEmail: user.email,
			verificationUrl: url,
			token,
		};

		const html = generateVerificationEmailHtml(emailData);
		const subject = getVerificationEmailSubject();

		const result = await sendEmail({
			to: user.email,
			subject,
			html,
		});

		if (!result.success) {
			console.error("Nie udało się wysłać emaila weryfikacyjnego");
		}
	} catch (_error) {
		console.error("Błąd podczas wysyłki emaila weryfikacyjnego");
	}
}

/**
 * Wysyła email z linkiem do resetowania hasła
 *
 * WAŻNE: Funkcja jest wywoływana przez Better-Auth z `void` aby uniknąć timing attacks.
 * Better-Auth nie czeka na zakończenie wysyłki emaila.
 */
export async function sendResetPasswordEmail(
	params: SendResetPasswordEmailParams,
): Promise<void> {
	const { user, url, token } = params;

	try {
		const emailData: PasswordResetEmailData = {
			userName: user.name || "Użytkowniku",
			userEmail: user.email,
			resetUrl: url,
			token,
		};

		const html = generatePasswordResetEmailHtml(emailData);
		const subject = getPasswordResetEmailSubject();

		const result = await sendEmail({
			to: user.email,
			subject,
			html,
		});

		if (!result.success) {
			console.error("Nie udało się wysłać emaila resetującego hasło");
		}
	} catch (_error) {
		console.error("Błąd podczas wysyłki emaila resetującego hasło");
	}
}

// Helper Functions

/**
 * Testuje połączenie email (użyteczne do healthcheck)
 */
export async function testEmailConnection(): Promise<boolean> {
	try {
		const { verifyEmailConnection } = await import("../utils/email-sender");
		return await verifyEmailConnection();
	} catch (error) {
		console.error("Błąd podczas testowania połączenia email:", error);
		return false;
	}
}
