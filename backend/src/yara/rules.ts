import { createHash } from "node:crypto";

// The starter set uses a standard, harmless antivirus test artifact.
const baseline = await Bun.file(new URL("./baseline.yar", import.meta.url)).text();
export const maxRuleBytes = 64 * 1024;
export function ruleSet(customRules = "") {
	const rules = JSON.stringify({
		bastiondesk: baseline,
		...(customRules ? { organization: customRules } : {}),
	});
	return {
		rules,
		version: createHash("sha256").update(rules).digest("hex"),
	};
}
export const baseRuleSet = ruleSet();
