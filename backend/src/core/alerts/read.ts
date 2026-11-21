import { z } from "zod";

export const ruleLevel = z.number().int().min(0).max(16);
export const ruleLevelParameter = z
	.string()
	.regex(/^(?:[0-9]|1[0-6])$/)
	.transform(Number);

export const alertReference = z.strictObject({
	agentId: z
		.string()
		.regex(/^\d{3,}$/)
		.max(32),
	indexName: z
		.string()
		.regex(/^wazuh-alerts-[a-z0-9][a-z0-9._-]*$/)
		.max(255),
	documentId: z.string().min(1).max(512),
});

export type AlertReference = z.infer<typeof alertReference>;
export type AlertSummary = AlertReference & {
	timestamp: string;
	agentName: string | null;
	ruleId: string;
	ruleLevel: number;
	description: string;
};

export function uniqueAlerts(alerts: readonly AlertSummary[]): AlertSummary[] {
	const seen = new Set<string>();
	return alerts.filter(({ indexName, documentId }) => {
		const key = JSON.stringify([indexName, documentId]);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
