import { expect, test } from "bun:test";
import { matchReport, type CorrelationAlert, type ReportSignals } from "./rules";

const hash = "ca".repeat(32);
const time = new Date("2026-01-10T14:00:00.000Z");
const report: ReportSignals = {
	createdAt: time,
	sourceId: null,
	agentId: null,
	indicators: [],
};
const alert: CorrelationAlert = {
	sourceId: "fixture-source",
	agentId: "001",
	agentName: "test-host",
	indexName: "wazuh-alerts-fixture",
	documentId: "fixture-1",
	timestamp: time.toISOString(),
	ruleId: "1001",
	ruleLevel: 8,
	description: "Synthetic validation fixture",
	sha256s: [hash],
	ips: ["192.0.2.6"],
};
const asset = { sourceId: alert.sourceId, agentId: alert.agentId };
const attachment = {
	indicators: [
		{
			kind: "sha256" as const,
			value: hash,
			fields: ["userAttachmentMetadata.contentHash"],
		},
	],
};
const sharedIp = {
	indicators: [{ kind: "ipv4" as const, value: "192.0.2.6", fields: ["userDescription"] }],
};

test("synthetic acceptance dataset measures both incorrect suggestions and missed matches", () => {
	const fixtures: {
		name: string;
		report: Partial<ReportSignals>;
		alert?: Partial<CorrelationAlert>;
		related: boolean;
	}[] = [
		{ name: "confirmed agent", report: asset, related: true },
		{ name: "attachment fingerprint", report: attachment, related: true },
		{
			name: "same agent and fingerprint",
			report: { ...asset, ...attachment },
			related: true,
		},
		{
			name: "delayed alert in window",
			report: asset,
			alert: { timestamp: "2026-01-11T13:59:59.000Z" },
			related: true,
		},
		{
			name: "same event with weak evidence only",
			report: sharedIp,
			related: true,
		},
		{ name: "shared network address", report: sharedIp, related: false },
		{
			name: "same agent id in another source",
			report: { ...asset, sourceId: "other-source" },
			related: false,
		},
		{
			name: "same device outside the window",
			report: asset,
			alert: { timestamp: "2026-01-11T14:00:00.001Z" },
			related: false,
		},
		{
			name: "hash in description without attachment",
			report: {
				indicators: [{ kind: "sha256", value: hash, fields: ["userDescription"] }],
			},
			related: false,
		},
		{
			name: "two unrelated uses of a common file",
			report: attachment,
			related: false,
		},
	];
	const counts = { tp: 0, fp: 0, tn: 0, fn: 0 };
	const mistakes: string[] = [];
	for (const fixture of fixtures) {
		const suggestion = Boolean(
			matchReport({ ...report, ...fixture.report }, { ...alert, ...fixture.alert }),
		);
		if (suggestion !== fixture.related) mistakes.push(fixture.name);
		const outcome = fixture.related ? (suggestion ? "tp" : "fn") : suggestion ? "fp" : "tn";
		counts[outcome]++;
	}
	expect(counts).toEqual({ tp: 4, fp: 1, tn: 4, fn: 1 });
	expect(mistakes).toEqual([
		"same event with weak evidence only",
		"two unrelated uses of a common file",
	]);
	expect(counts.tp / (counts.tp + counts.fp)).toBe(0.8);
	expect(counts.tp / (counts.tp + counts.fn)).toBe(0.8);
});
