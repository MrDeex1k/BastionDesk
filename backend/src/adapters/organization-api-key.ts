import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function organizationApiKey(directory: string) {
	return async (organizationId: string) => {
		const name = createHash("sha256").update(organizationId).digest("hex");
		const key = (await readFile(join(directory, `${name}.key`), "utf8")).trim();
		return /^[a-zA-Z0-9_-]{20,200}$/.test(key) ? key : undefined;
	};
}
