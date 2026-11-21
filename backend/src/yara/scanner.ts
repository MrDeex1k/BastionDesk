import { z } from "zod";

const result = z.strictObject({
	matches: z
		.array(z.string().regex(/^(?:bastiondesk|organization):[A-Za-z_][A-Za-z0-9_]*$/))
		.max(8192),
});
const timeout = 30_000;

export function yaraScanner(endpoint = process.env.YARA_SCANNER_URL ?? "http://yara-scanner:3342") {
	return {
		async validate(rules: string) {
			const response = await fetch(`${endpoint}/validate`, {
				method: "POST",
				body: rules,
				signal: AbortSignal.timeout(timeout),
				redirect: "error",
			});
			await response.body?.cancel();
			if (response.status === 422) return false;
			if (!response.ok) throw new Error("YARA_SCANNER_UNAVAILABLE");
			return true;
		},
		async scan(rules: string, file: Buffer) {
			const source = new TextEncoder().encode(rules);
			const prefix = new Uint8Array(4);
			new DataView(prefix.buffer).setUint32(0, source.byteLength);
			const response = await fetch(`${endpoint}/scan`, {
				method: "POST",
				body: new Blob([prefix, source, new Uint8Array(file)]),
				signal: AbortSignal.timeout(timeout),
				redirect: "error",
			});
			if (!response.ok) {
				await response.body?.cancel();
				throw new Error("YARA_SCANNER_UNAVAILABLE");
			}
			return result.parse(await response.json()).matches;
		},
	};
}
