/**
 * NodeMailer Email Sender
 *
 * Singleton wrapper dla NodeMailer z obsługą Gmail SMTP.
 * Zapewnia lazy initialization, weryfikację połączenia i error handling.
 */

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "../lib/env";

// Types
export interface EmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	replyTo?: string;
}

export interface EmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

// Email Sender Class
class EmailSender {
	private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
		null;
	private isVerified = false;
	private connectionAttempts = 0;
	private readonly MAX_CONNECTION_ATTEMPTS = 3;
	private readonly CONNECTION_TIMEOUT = 10000; // 10 sekund

	/**
	 * Tworzy transporter NodeMailer (lazy initialization)
	 */
	private createTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
		if (this.transporter) {
			return this.transporter;
		}

		console.log("Inicjalizacja NodeMailer transporter...");

		this.transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			secure: env.SMTP_SECURE, // false dla STARTTLS (port 587)
			auth: {
				user: env.SMTP_USER,
				pass: env.SMTP_APP_PASSWORD,
			},
			connectionTimeout: this.CONNECTION_TIMEOUT,
			greetingTimeout: this.CONNECTION_TIMEOUT,
		} as SMTPTransport.Options);

		return this.transporter;
	}

	/**
	 * Weryfikuje połączenie SMTP
	 */
	async verifyConnection(): Promise<boolean> {
		// Jeśli już zweryfikowano, zwróć true
		if (this.isVerified) {
			return true;
		}

		const transporter = this.createTransporter();
		this.connectionAttempts++;

		try {
			console.log(
				`Weryfikacja połączenia SMTP (próba ${this.connectionAttempts}/${this.MAX_CONNECTION_ATTEMPTS})...`,
			);
			await transporter.verify();
			this.isVerified = true;
			console.log("Połączenie SMTP zweryfikowane pomyślnie");
			return true;
		} catch (error) {
			console.error("Błąd weryfikacji połączenia SMTP:", error);

			if (this.connectionAttempts >= this.MAX_CONNECTION_ATTEMPTS) {
				console.error(
					`Przekroczono limit prób połączenia (${this.MAX_CONNECTION_ATTEMPTS})`,
				);
			}

			return false;
		}
	}

	/**
	 * Wysyła email
	 */
	async sendEmail(options: EmailOptions): Promise<EmailResult> {
		try {
			// Weryfikuj połączenie przed wysyłką (tylko raz lub po błędzie)
			if (!this.isVerified) {
				const isConnected = await this.verifyConnection();
				if (!isConnected) {
					return {
						success: false,
						error: "Nie można nawiązać połączenia z serwerem SMTP",
					};
				}
			}

			const transporter = this.createTransporter();

			// Przygotuj opcje emaila
			const mailOptions = {
				from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
				to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
				subject: options.subject,
				html: options.html,
				text: options.text || this.stripHtml(options.html),
				replyTo: options.replyTo,
			};

			// Wysyłka
			const info = await transporter.sendMail(mailOptions);

			// Logowanie (bez wrażliwych danych)
			console.log(
				`Email wysłany: ${options.subject} → ${this.maskEmail(mailOptions.to)} [${info.messageId}]`,
			);

			return {
				success: true,
				messageId: info.messageId,
			};
		} catch (error) {
			// Reset weryfikacji przy błędzie - następna wysyłka spróbuje ponownie
			this.isVerified = false;

			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error(
				`Błąd wysyłki emaila: ${options.subject} → ${this.maskEmail(options.to)}`,
				errorMessage,
			);

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Usuwa tagi HTML z tekstu (fallback dla plain text)
	 */
	private stripHtml(html: string): string {
		return html
			.replace(/<[^>]*>/g, "") // Usuń tagi HTML
			.replace(/&nbsp;/g, " ") // Zamień &nbsp; na spację
			.replace(/&amp;/g, "&") // Zamień &amp; na &
			.replace(/&lt;/g, "<") // Zamień &lt; na <
			.replace(/&gt;/g, ">") // Zamień &gt; na >
			.replace(/&quot;/g, '"') // Zamień &quot; na "
			.replace(/&#39;/g, "'") // Zamień &#39; na '
			.replace(/\s+/g, " ") // Normalizuj whitespace
			.trim();
	}

	/**
	 * Maskuje email dla logowania (bezpieczeństwo)
	 * test@example.com → t***@example.com
	 */
	private maskEmail(email: string | string[]): string {
		if (!email) return "unknown";

		const emailStr = Array.isArray(email) ? email.join(", ") : email;
		const emails = emailStr.split(",").map((e) => e.trim());
		return emails
			.map((e) => {
				const [local, domain] = e.split("@");
				if (!local || !domain) return e;
				const masked = `${local.charAt(0)}***`;
				return `${masked}@${domain}`;
			})
			.join(", ");
	}

	/**
	 * Zamyka połączenie (cleanup)
	 */
	async close(): Promise<void> {
		if (this.transporter) {
			console.log("Zamykanie połączenia SMTP...");
			this.transporter.close();
			this.transporter = null;
			this.isVerified = false;
		}
	}
}

// Singleton Instance
const emailSender = new EmailSender();

// Exported Functions

/**
 * Wysyła email (główna funkcja eksportowana)
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
	return emailSender.sendEmail(options);
}

/**
 * Weryfikuje połączenie SMTP
 */
export async function verifyEmailConnection(): Promise<boolean> {
	return emailSender.verifyConnection();
}

/**
 * Zamyka połączenie SMTP
 */
export async function closeEmailConnection(): Promise<void> {
	return emailSender.close();
}

// Default Export
export default emailSender;
