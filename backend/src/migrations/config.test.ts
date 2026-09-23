import assert from "node:assert/strict";
import { expect, test } from "bun:test";
import { migrationConfig } from "./config";

test("migration CLI cannot accidentally use runtime database credentials", async () => {
	await assert.rejects(
		migrationConfig({ DATABASE_URL: "postgresql://runtime@localhost/app" }),
		/MIGRATION_DATABASE_URL_REQUIRED/,
	);
});

test("plaintext requires explicit opt-in and a loopback host", async () => {
	const local = { MIGRATION_DATABASE_URL: "postgresql://fixture@127.0.0.1/fixture" };
	await assert.rejects(migrationConfig(local), /MIGRATION_TLS_REQUIRED/);
	expect((await migrationConfig({ ...local, MIGRATION_ALLOW_LOCAL_PLAINTEXT: "true" })).ssl).toBe(
		false,
	);
	await assert.rejects(
		migrationConfig({
			MIGRATION_DATABASE_URL: "postgresql://fixture@db.internal/app",
			MIGRATION_ALLOW_LOCAL_PLAINTEXT: "true",
		}),
		/MIGRATION_TLS_REQUIRED/,
	);
});

test("URL options cannot override verified TLS configuration", async () => {
	await assert.rejects(
		migrationConfig({
			MIGRATION_DATABASE_URL: "postgresql://fixture@localhost/app?sslmode=disable",
		}),
		/INVALID_MIGRATION_DATABASE_URL/,
	);
	await assert.rejects(
		migrationConfig({
			MIGRATION_DATABASE_URL: "postgresql://fixture@localhost/app",
			MIGRATION_TLS_CA: "ca.pem",
		}),
		/INCOMPLETE_MIGRATION_TLS/,
	);
});
