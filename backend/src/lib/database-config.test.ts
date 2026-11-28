import { expect, test } from "bun:test";
import { databaseEnvironment, parsePostgresUrl, runtimeConnectionString } from "./database-config";

const fixture = {
	DATABASE_URL: "postgresql://fixture:fixture@pool.test:6543/app",
	PGBOUNCER_HOST: "pool.test",
	PGBOUNCER_PORT: "6543",
	POSTGRES_USER: "fixture",
	POSTGRES_PASSWORD: "fixture",
	POSTGRES_DB: "app",
	DB_TLS_CA_PATH: "ca.pem",
	DB_TLS_CERT_PATH: "cert.pem",
	DB_TLS_KEY_PATH: "key.pem",
};

test("reads the PgBouncer port from the environment and rejects missing values", () => {
	expect(databaseEnvironment(fixture).PGBOUNCER_PORT).toBe(6543);
	for (const key of Object.keys(fixture)) {
		expect(() => databaseEnvironment({ ...fixture, [key]: undefined })).toThrow(
			`Missing required environment variable: ${key}`,
		);
	}
	for (const port of ["0", "65536", "6432x", "4e3"]) {
		expect(() => databaseEnvironment({ ...fixture, PGBOUNCER_PORT: port })).toThrow(
			"Environment variable PGBOUNCER_PORT must be an integer from 1 to 65535",
		);
	}
});

test("requires complete PostgreSQL URLs instead of letting the driver fill in coordinates", () => {
	for (const url of [
		"postgresql://pool.test:6543/app",
		"postgresql://fixture@pool.test:6543/app",
		"postgresql://fixture:fixture@pool.test/app",
		"postgresql://fixture:fixture@pool.test:0/app",
		"postgresql://fixture:fixture@pool.test:6543/",
		"postgresql://fixture:fixture@/app",
		"postgresql://fixture:%ZZ@pool.test:6543/app",
		`${fixture.DATABASE_URL}?port=1234`,
	]) {
		expect(() => parsePostgresUrl(url, "DATABASE_URL")).toThrow("INVALID_DATABASE_URL");
	}
});

test("keeps URL connection coordinates and uses explicit TLS configuration for runtime pools", () => {
	const url = new URL(
		runtimeConnectionString(
			"postgresql://fixture:pass%40word@pool.test:6543/app?sslmode=require&application_name=fixture",
		),
	);
	expect(url.password).toBe("pass%40word");
	expect(url.port).toBe("6543");
	expect(url.searchParams.get("application_name")).toBe("fixture");
	expect(url.searchParams.has("sslmode")).toBe(false);
});
