const connectionKeys = ["host", "port", "user", "password", "database"];

export function parsePostgresUrl(
	value: string,
	key: "DATABASE_URL" | "MIGRATION_DATABASE_URL",
): URL {
	const error = () => new Error(`INVALID_${key}`);
	let url: URL;
	try {
		url = new URL(value);
		// Reject malformed escapes before the driver parses the URL.
		decodeURIComponent(url.username);
		decodeURIComponent(url.password);
		decodeURI(url.pathname);
		decodeURIComponent(url.hostname);
	} catch {
		throw error();
	}

	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!url.hostname ||
		Number(url.port) < 1 ||
		!url.username ||
		!url.password ||
		url.pathname.length < 2 ||
		connectionKeys.some((name) => url.searchParams.has(name))
	) {
		throw error();
	}
	return url;
}

export function runtimeConnectionString(value: string): string {
	const url = parsePostgresUrl(value, "DATABASE_URL");
	// All runtime pools use the explicit CA and client certificates from the environment.
	for (const name of [
		"ssl",
		"sslmode",
		"sslcert",
		"sslkey",
		"sslrootcert",
		"sslnegotiation",
		"uselibpqcompat",
	])
		url.searchParams.delete(name);
	return url.toString();
}

function requireValue(environment: Record<string, string | undefined>, key: string): string {
	const value = environment[key];
	if (!value) throw new Error(`Missing required environment variable: ${key}`);
	return value;
}

export function databaseEnvironment(environment: Record<string, string | undefined>) {
	const port = requireValue(environment, "PGBOUNCER_PORT");
	const parsedPort = Number(port);
	if (!/^\d+$/.test(port) || parsedPort < 1 || parsedPort > 65535) {
		throw new Error("Environment variable PGBOUNCER_PORT must be an integer from 1 to 65535");
	}

	return {
		DATABASE_URL: runtimeConnectionString(requireValue(environment, "DATABASE_URL")),
		PGBOUNCER_HOST: requireValue(environment, "PGBOUNCER_HOST"),
		PGBOUNCER_PORT: parsedPort,
		POSTGRES_USER: requireValue(environment, "POSTGRES_USER"),
		POSTGRES_PASSWORD: requireValue(environment, "POSTGRES_PASSWORD"),
		POSTGRES_DB: requireValue(environment, "POSTGRES_DB"),
		DB_TLS_CA_PATH: requireValue(environment, "DB_TLS_CA_PATH"),
		DB_TLS_CERT_PATH: requireValue(environment, "DB_TLS_CERT_PATH"),
		DB_TLS_KEY_PATH: requireValue(environment, "DB_TLS_KEY_PATH"),
	};
}
