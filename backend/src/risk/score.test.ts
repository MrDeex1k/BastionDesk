import { expect, test } from "bun:test";
import { scoreRisk, type RiskInputs } from "./score";

const empty: RiskInputs = { evidence: [], scans: [], checks: [] };
const alert = {
	evidenceId: "1",
	reportId: null,
	sourceId: "source",
	agentId: "agent",
	ruleLevel: 10,
};
const scan = {
	evidenceId: "2",
	jobId: "job",
	hash: "a".repeat(64),
	version: "v1",
	matches: ["Fixture"],
	completedAt: "2026-01-01",
};

test("missing data, unavailable TI and a measured zero remain distinct", () => {
	expect(scoreRisk(empty).score).toBeNull();
	expect(scoreRisk({ ...empty, evidence: [{ ...alert, ruleLevel: null }] }).score).toBeNull();
	expect(
		scoreRisk({
			...empty,
			checks: [
				{
					...alert,
					jobId: "a",
					kind: "url",
					indicator: "fixture",
					provider: "urlhaus",
					result: { status: "unavailable", provider: "urlhaus" },
				},
			],
		}).score,
	).toBeNull();
	expect(scoreRisk({ ...empty, evidence: [{ ...alert, ruleLevel: 0 }] })).toMatchObject({
		score: 0,
		level: "low",
	});
});

test("duplicate observations count once, independent asset and file signals add points", () => {
	const repeated = {
		...empty,
		evidence: [alert, { ...alert, evidenceId: "3" }],
		scans: [scan, { ...scan, evidenceId: "4" }],
	};
	expect(scoreRisk(repeated)).toMatchObject({ score: 55, level: "high" });
	expect(
		scoreRisk({
			...repeated,
			evidence: [...repeated.evidence, { ...alert, sourceId: "another source" }],
		}).score,
	).toBe(65);
	const fresh = { ...scan, completedAt: "2026-02-01", version: "v2", matches: [] };
	expect(scoreRisk({ ...empty, scans: [fresh, scan] })).toEqual(
		scoreRisk({ ...empty, scans: [scan, fresh] }),
	);
	expect(scoreRisk({ ...empty, scans: [scan, fresh] }).score).toBe(0);
});

test("provider agreement on one file uses the strongest TI verdict, while independent YARA contributes", () => {
	const check: RiskInputs["checks"][number] = {
		evidenceId: "1",
		jobId: "ti-a",
		provider: "otx",
		kind: "sha256",
		indicator: scan.hash,
		result: {
			provider: "otx",
			status: "ready",
			summary: { kind: "pulses", count: 1 },
			fetchedAt: "2026-01-01",
			expiresAt: "2026-01-02",
		},
	};
	const second: typeof check = {
		...check,
		jobId: "ti-b",
		provider: "virustotal",
		result: {
			provider: "virustotal",
			status: "ready",
			summary: { kind: "engines", malicious: 2, suspicious: 0, evaluated: 12 },
			fetchedAt: "2026-01-01",
			expiresAt: "2026-01-02",
		},
	};
	const assessment = scoreRisk({ evidence: [alert], scans: [scan], checks: [check, second] });
	expect(assessment).toMatchObject({ score: 75, level: "critical" });
	expect(
		scoreRisk({ evidence: [alert], scans: [scan], checks: [second, check, second] }),
	).toEqual(assessment);
});
