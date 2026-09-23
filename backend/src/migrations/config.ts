import { readFile } from "node:fs/promises";
import type { ClientConfig } from "pg";

/** Deliberately never falls back to the application's DATABASE_URL. */
export async function migrationConfig(
	env: Record<string, string | undefined>,
): Promise<ClientConfig> {
	const connectionString = env.MIGRATION_DATABASE_URL;
	if (!connectionString) throw new Error("MIGRATION_DATABASE_URL_REQUIRED");
	const url = new URL(connectionString);
	if (!["postgres:", "postgresql:"].includes(url.protocol) || url.search || url.hash) {
		throw new Error("INVALID_MIGRATION_DATABASE_URL");
	}
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	const ca = env.MIGRATION_TLS_CA;
	const cert = env.MIGRATION_TLS_CERT;
	const key = env.MIGRATION_TLS_KEY;
	if ((ca || cert || key) && !(ca && cert && key)) throw new Error("INCOMPLETE_MIGRATION_TLS");
	if (!ca && !(local && env.MIGRATION_ALLOW_LOCAL_PLAINTEXT === "true")) {
		throw new Error("MIGRATION_TLS_REQUIRED");
	}
	return {
		connectionString,
		connectionTimeoutMillis: 5000,
		application_name: "bastiondesk-migrator",
		ssl:
			ca && cert && key
				? {
						rejectUnauthorized: true,
						ca: await readFile(ca, "utf8"),
						cert: await readFile(cert, "utf8"),
						key: await readFile(key, "utf8"),
					}
				: false,
	};
}
