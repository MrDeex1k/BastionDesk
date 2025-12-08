//Environment Variables Configuration

import path from "node:path";
import dotenv from "dotenv";

// Wczytanie .env z głównego folderu projektu (parent directory)
const envPath = path.resolve(import.meta.dir, "../../../.env");
dotenv.config({ path: envPath });

function getEnvVar(key: string, defaultValue?: string): string {
	const value = process.env[key] ?? defaultValue;
	if (value === undefined) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
	const value = process.env[key];
	if (value === undefined) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed)) {
		throw new Error(`Environment variable ${key} must be a number`);
	}
	return parsed;
}

//Konfiguracja zmiennych środowiskowych
export const env = {
	// Server
	PORT: getEnvNumber("PORT", 3333),
	NODE_ENV: getEnvVar("NODE_ENV", "development"),

	// Database
	DATABASE_URL: getEnvVar(
		"DATABASE_URL",
		"postgresql://bastiondesk_superadmin:bastiondesk_securedesk@localhost:54328/bastiondesk_db",
	),

	// Better-Auth
	BETTER_AUTH_SECRET: getEnvVar(
		"BETTER_AUTH_SECRET",
		"dev-secret-key-change-in-production-min-32-chars",
	),
	BETTER_AUTH_URL: getEnvVar("BETTER_AUTH_URL", "http://localhost:3333"),
	BETTER_AUTH_TRUSTED_ORIGINS: getEnvVar(
		"BETTER_AUTH_TRUSTED_ORIGINS",
		"http://localhost:5173,http://localhost:4444",
	),

	// WebAuthn / PassKeys
	WEBAUTHN_RP_ID: getEnvVar("WEBAUTHN_RP_ID", "localhost"),
	WEBAUTHN_RP_NAME: getEnvVar("WEBAUTHN_RP_NAME", "BastionDesk"),
	WEBAUTHN_ORIGIN: getEnvVar("WEBAUTHN_ORIGIN", "http://localhost:3333"),

	// CORS
	CORS_ORIGIN: getEnvVar("CORS_ORIGIN", "http://localhost:5173"),

	// LLM Service
	LLM_SERVICE_URL: getEnvVar("LLM_SERVICE_URL", "http://localhost:8888"),

	// Rate Limiting
	RATE_LIMIT_WINDOW_MS: getEnvNumber("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
	RATE_LIMIT_MAX_REQUESTS: getEnvNumber("RATE_LIMIT_MAX_REQUESTS", 100),

	// Storage (S3 / MinIO)
	S3_ENDPOINT: getEnvVar("S3_ENDPOINT", "http://storage:9000"),
	S3_REGION: getEnvVar("S3_REGION", "us-east-1"),
	S3_ACCESS_KEY: getEnvVar("S3_ACCESS_KEY", "minioadmin"),
	S3_SECRET_KEY: getEnvVar("S3_SECRET_KEY", "minioadmin"),
	S3_BUCKET: getEnvVar("S3_BUCKET", "bastiondesk"),
} as const;

// Tryb produkcyjny
if (env.NODE_ENV === "production") {
	if (env.BETTER_AUTH_SECRET.includes("dev-secret")) {
		throw new Error(
			"BETTER_AUTH_SECRET must be changed in production!",
		);
	}
	if (env.BETTER_AUTH_SECRET.length < 32) {
		throw new Error(
			"BETTER_AUTH_SECRET must be at least 32 characters in production!",
		);
	}
}

export type Env = typeof env;