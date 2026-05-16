/**
 * Database Connector - Bun Native SQL Driver
 *
 * Wykorzystuje natywny sterownik Bun SQL dla PostgreSQL
 * Better-Auth używa osobnego połączenia przez pg Pool
 */

import { SQL } from "bun";
import { env } from "./env";

// Bun SQL Instance (lazy singleton)
let _sql: SQL | null = null;

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
}

// Helper Functions - dla kompatybilności z istniejącym kodem

/**
 * Wykonaj zapytanie SQL i zwróć wyniki
 * @param queryText - tekst zapytania SQL
 * @param params - parametry zapytania (opcjonalne)
 */
export async function query<T>(
	queryText: string,
	params?: unknown[],
): Promise<T[]> {
	const database = getDb();

	if (params && params.length > 0) {
		const result = await database.unsafe(queryText, params as never[]);
		return result as T[];
	}

	const result = await database.unsafe(queryText);
	return result as T[];
}

/**
 * Wykonaj zapytanie SQL i zwróć pierwszy wynik
 */
export async function queryOne<T>(
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
