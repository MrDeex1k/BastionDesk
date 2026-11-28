import { expect, test } from "bun:test";
import {
	correlationRule,
	matchReport,
	timeWindow,
	type CorrelationAlert,
	type ReportSignals,
} from "./rules";

const anchor = new Date("2025-01-01T00:00:00Z");
const alert: CorrelationAlert = {
	timestamp: anchor.toISOString(),
	sourceId: "source-a",
	agentId: "001",
	agentName: "lab-host",
	ruleLevel: 4,
	ruleId: "fixture",
	indexName: "wazuh-alerts-fixture",
	documentId: "1",
	description: "synthetic test",
	sha256s: ["0".repeat(64)],
	ips: ["192.0.2.1"],
	users: ["lab-user"],
};
const report: ReportSignals = {
	createdAt: anchor,
	sourceId: "source-a",
	agentId: "001",
	indicators: [{ kind: "ipv4", value: "192.0.2.1", fields: ["userDescription"] }],
	userDescription: "lab-user lab-host",
};

test("inclusive event and report windows have the same boundary in both directions", () => {
	const window = timeWindow(anchor);
	for (const timestamp of [window.from, window.to]) {
		expect(matchReport(report, { ...alert, timestamp })?.signals).toEqual([
			"asset:001",
			"hostname:lab-host",
			"ip:192.0.2.1",
			"user:lab-user",
		]);
		expect(matchReport({ ...report, createdAt: new Date(timestamp) }, alert)).toBeDefined();
	}
	for (const sign of [-1, 1]) {
		const date = new Date(anchor.getTime() + sign * (correlationRule.windowMs + 1));
		expect(matchReport({ ...report, createdAt: date }, alert)).toBeUndefined();
	}
});
test("asset namespace, exact SHA-256 and supporting signals", () => {
	expect(matchReport({ ...report, sourceId: "other" }, alert)).toBeUndefined();
	expect(matchReport({ ...report, agentId: null }, alert)).toBeUndefined();
	expect(
		matchReport(
			{
				...report,
				sourceId: "other",
				indicators: [
					{
						kind: "sha256",
						value: alert.sha256s[0]!,
						fields: ["userAttachmentMetadata.contentHash"],
					},
				],
			},
			alert,
		)?.signals,
	).toContain("sha256:" + alert.sha256s[0]);
});
