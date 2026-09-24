import { expect, test } from "bun:test";
import type { Pool, PoolClient } from "pg";
import { findIdentity } from "./state-query";

for (const rollbackFails of [false, true]) {
	test(`identity query preserves original failure when rollback fails=${rollbackFails}`, async () => {
		const original = new Error("query timeout");
		const commands: string[] = [];
		let released: Error | undefined;
		const client = {
			query: async (sql: string) => {
				commands.push(sql);
				if (sql.includes("SELECT")) throw original;
				if (sql === "ROLLBACK" && rollbackFails) throw new Error("connection lost");
				return { rows: [] };
			},
			release: (error?: Error) => {
				released = error;
			},
		} as unknown as PoolClient;
		const pool = { connect: async () => client } as Pick<Pool, "connect">;
		let caught: unknown;
		try {
			await findIdentity(pool, "session", new AbortController().signal);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(original);
		expect(commands.at(-1)).toBe("ROLLBACK");
		expect(released).toBe(original);
	});
}

test("successful identity lookup releases a healthy connection", async () => {
	const commands: string[] = [];
	const released: (Error | undefined)[] = [];
	const client = {
		query: async (sql: string) => {
			commands.push(sql);
			return { rows: [] };
		},
		release: (error?: Error) => {
			released.push(error);
		},
	} as unknown as PoolClient;
	const pool = { connect: async () => client } as Pick<Pool, "connect">;
	expect(await findIdentity(pool, "session", new AbortController().signal)).toBeNull();
	expect(commands.at(-1)).toBe("COMMIT");
	expect(released).toEqual([undefined]);
});
