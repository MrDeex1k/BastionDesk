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

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
	const value = process.env[key];
	if (value === undefined) return defaultValue;
	return value.toLowerCase() === "true" || value === "1";
}

//Konfiguracja zmiennych środowiskowych
export const env = {
	// Server
	PORT: getEnvNumber("PORT", 3333),
	NODE_ENV: getEnvVar("NODE_ENV"),

	// Database
	DATABASE_URL: getEnvVar("DATABASE_URL"),
	POSTGRES_USER: getEnvVar("POSTGRES_USER"),
	POSTGRES_PASSWORD: getEnvVar("POSTGRES_PASSWORD"),
	POSTGRES_DB: getEnvVar("POSTGRES_DB"),
	PGBOUNCER_HOST: getEnvVar("PGBOUNCER_HOST"),
	PGBOUNCER_PORT: getEnvNumber("PGBOUNCER_PORT", 6432),
	DB_TLS_CA_PATH: getEnvVar("DB_TLS_CA_PATH"),
	DB_TLS_CERT_PATH: getEnvVar("DB_TLS_CERT_PATH"),
	DB_TLS_KEY_PATH: getEnvVar("DB_TLS_KEY_PATH"),

	// Better-Auth
	BETTER_AUTH_SECRET: getEnvVar("BETTER_AUTH_SECRET"),
	BETTER_AUTH_URL: getEnvVar("BETTER_AUTH_URL"),
	BETTER_AUTH_TRUSTED_ORIGINS: getEnvVar("BETTER_AUTH_TRUSTED_ORIGINS"),

	// WebAuthn / PassKeys
	WEBAUTHN_RP_ID: getEnvVar("WEBAUTHN_RP_ID"),
	WEBAUTHN_RP_NAME: getEnvVar("WEBAUTHN_RP_NAME"),
	WEBAUTHN_ORIGIN: getEnvVar("WEBAUTHN_ORIGIN"),

	// CORS
	CORS_ORIGIN: getEnvVar("CORS_ORIGIN"),

	// LLM Service
	LLM_GRPC_TARGET: getEnvVar("LLM_GRPC_TARGET"),
	LLM_TLS_CA_PATH: getEnvVar("LLM_TLS_CA_PATH"),
	LLM_TLS_CERT_PATH: getEnvVar("LLM_TLS_CERT_PATH"),
	LLM_TLS_KEY_PATH: getEnvVar("LLM_TLS_KEY_PATH"),
	LLM_RPC_TIMEOUT_MS: getEnvNumber("LLM_RPC_TIMEOUT_MS", 30000),

	// Rate Limiting
	RATE_LIMIT_WINDOW_MS: getEnvNumber("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
	RATE_LIMIT_MAX_REQUESTS: getEnvNumber("RATE_LIMIT_MAX_REQUESTS", 100),

	// Storage (S3 / MinIO)
	S3_ENDPOINT: getEnvVar("S3_ENDPOINT"),
	S3_REGION: getEnvVar("S3_REGION"),
	S3_ACCESS_KEY: getEnvVar("S3_ACCESS_KEY"),
	S3_SECRET_KEY: getEnvVar("S3_SECRET_KEY"),
	S3_BUCKET: getEnvVar("S3_BUCKET"),
	S3_TLS_CA_PATH: getEnvVar("S3_TLS_CA_PATH"),

	// Email / SMTP Configuration
	SMTP_HOST: getEnvVar("SMTP_HOST"),
	SMTP_PORT: getEnvNumber("SMTP_PORT", 587),
	SMTP_SECURE: getEnvBoolean("SMTP_SECURE", false),
	SMTP_USER: getEnvVar("SMTP_USER"),
	SMTP_APP_PASSWORD: getEnvVar("SMTP_APP_PASSWORD"),
	EMAIL_FROM_NAME: getEnvVar("EMAIL_FROM_NAME"),
	EMAIL_FROM_ADDRESS: getEnvVar("EMAIL_FROM_ADDRESS"),
	FRONTEND_URL: getEnvVar("FRONTEND_URL"),
} as const;

// Tryb produkcyjny
if (env.NODE_ENV === "production") {
	if (env.BETTER_AUTH_SECRET.includes("dev-secret")) {
		throw new Error("BETTER_AUTH_SECRET must be changed in production!");
	}
	if (env.BETTER_AUTH_SECRET.length < 32) {
		throw new Error(
			"BETTER_AUTH_SECRET must be at least 32 characters in production!",
		);
	}
}

export type Env = typeof env;
