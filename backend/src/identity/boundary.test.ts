import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

test("Core runtime dependency graph cannot import Better Auth or auth-owned secrets", () => {
	const scanned = new Set<string>();
	const transpiler = new Bun.Transpiler({ loader: "ts" });
	function scan(file: string) {
		if (scanned.has(file)) return;
		scanned.add(file);
		for (const dependency of transpiler.scanImports(readFileSync(file, "utf8"))) {
			expect(dependency.path.startsWith("better-auth")).toBe(false);
			expect(dependency.path.startsWith("@better-auth/")).toBe(false);
			if (!dependency.path.startsWith(".")) continue;
			const path = resolve(dirname(file), dependency.path.replace(/\.js$/, ""));
			const target = [path + ".ts", resolve(path, "index.ts")].find(existsSync);
			if (!target) throw new Error(`Unresolved runtime module: ${path}`);
			expect(target.includes("/src/auth/")).toBe(false);
			scan(target);
		}
	}
	scan(resolve(import.meta.dir, "../index.ts"));
	expect(scanned.size).toBeGreaterThan(20);
});
