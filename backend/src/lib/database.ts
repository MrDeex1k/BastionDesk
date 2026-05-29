/**
 * Database Connector - Bun Native SQL Driver
 *
 * Wykorzystuje natywny sterownik Bun SQL dla PostgreSQL
 * Better-Auth używa osobnego połączenia przez pg Pool
 */

import fs from "node:fs";
import { SQL } from "bun";
import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";

// Bun SQL Instance (lazy singleton)
let _sql: SQL | null = null;
let _pool: Pool | null = null;

/**
 * Pobierz instancję Bun SQL (lazy singleton)
 * Automatycznie tworzy połączenie przy pierwszym wywołaniu
 */
export function getDb(): SQL {
	if (!_sql) {
		_sql = new SQL({
			hostname: env.PGBOUNCER_HOST,
			port: env.PGBOUNCER_PORT,
			database: env.POSTGRES_DB,
			username: env.POSTGRES_USER,
			password: env.POSTGRES_PASSWORD,
			prepare: true,
			max: 20,
			idleTimeout: 30,
			connectionTimeout: 10,
			tls: {
				rejectUnauthorized: true,
				serverName: env.PGBOUNCER_HOST,
				ca: Bun.file(env.DB_TLS_CA_PATH),
				cert: Bun.file(env.DB_TLS_CERT_PATH),
				key: Bun.file(env.DB_TLS_KEY_PATH),
			},
		});
		console.log("[DATABASE] Bun SQL connection initialized");
	}
	return _sql;
}

/**
 * Pobierz bezpieczny pool pg dla zapytań tekstowych z parametrami.
 * Używany tam, gdzie kod nadal operuje na klasycznym SQL z placeholderami $1, $2...
 */
function getPgPool(): Pool {
	if (!_pool) {
		_pool = new Pool({
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
		});
	}

	return _pool;
}

/**
 * Tagged template literal dla zapytań SQL
 * Użycie: await sql`SELECT * FROM users WHERE id = ${userId}`
 *
 * @example
 * const users = await sql`SELECT * FROM users WHERE active = ${true}`;
 */
export function sql(
	strings: TemplateStringsArray,
	...values: unknown[]
): Promise<unknown[]> {
	return getDb()(strings, ...values);
}

// Sprawdzenie połączenia z bazą danych
export async function checkDatabaseConnection(): Promise<boolean> {
	try {
		const db = getDb();
		const result = await db`SELECT 1 as check`;
		return result.length > 0;
	} catch (error) {
		console.error("[DATABASE] Connection check failed:", error);
		return false;
	}
}

// Zamkniecie połączenia z bazą danych
export async function closeDatabase(): Promise<void> {
	if (_sql) {
		await _sql.close();
		_sql = null;
		console.log("[DATABASE] Bun SQL connection closed");
	}

	if (_pool) {
		await _pool.end();
		_pool = null;
		console.log("[DATABASE] pg Pool connection closed");
	}
}

// Helper Functions - dla kompatybilności z istniejącym kodem

/**
 * Wykonaj zapytanie SQL i zwróć wyniki
 * @param queryText - tekst zapytania SQL
 * @param params - parametry zapytania (opcjonalne)
 */
export async function query<T extends QueryResultRow>(
	queryText: string,
	params?: unknown[],
): Promise<T[]> {
	const pool = getPgPool();
	const result = await pool.query<T>(queryText, params ?? []);
	return result.rows;
}

/**
 * Wykonaj zapytanie SQL i zwróć pierwszy wynik
 */
export async function queryOne<T extends QueryResultRow>(
	queryText: string,
	params?: unknown[],
): Promise<T | null> {
	const rows = await query<T>(queryText, params);
	return rows[0] ?? null;
}

// Transaction Support

/**
 * Wykonaj operacje w transakcji
 * @param callback - funkcja z operacjami do wykonania w transakcji
 *
 * @example
 * await transaction(async (tx) => {
 *   await tx`INSERT INTO users (name) VALUES (${'John'})`;
 *   await tx`INSERT INTO logs (action) VALUES (${'user_created'})`;
 * });
 */
export async function transaction<T>(
	callback: (tx: SQL) => Promise<T>,
): Promise<T> {
	const database = getDb();
	return await database.begin(callback);
}

export type { SQL };
