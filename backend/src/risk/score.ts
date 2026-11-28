import type { EnrichmentResult } from "../core/ioc/automatic";

export const ruleVersion = "soc-risk-v1";
export type RiskInputs = {
	evidence: {
		evidenceId: string;
		reportId: string | null;
		sourceId: string | null;
		agentId: string | null;
		ruleLevel: number | null;
	}[];
	scans: {
		evidenceId: string;
		jobId: string;
		hash: string;
		version: string;
		matches: string[];
		completedAt: string;
	}[];
	checks: {
		evidenceId: string;
		jobId: string;
		provider: string;
		kind: string;
		indicator: string;
		result: EnrichmentResult;
	}[];
};

function tiPoints(result: EnrichmentResult): number | null {
	if (result.status === "matched") return 20;
	if (result.status !== "ready") return null;
	if ("result" in result)
		return result.result.confidence >= 75 ? 20 : result.result.confidence > 0 ? 10 : 0;
	switch (result.summary.kind) {
		case "sandbox":
			switch (result.summary.verdict) {
				case "unknown":
					return null;
				case "malicious":
					return 20;
				case "suspicious":
					return 10;
				case "benign":
					return 0;
			}
			break;
		case "engines":
			if (result.summary.evaluated === 0) return null;
			return result.summary.malicious > 0 ? 20 : result.summary.suspicious > 0 ? 10 : 0;
		case "pulses":
			return result.summary.count > 0 ? 10 : null;
	}
}

export function scoreRisk({ evidence, scans, checks }: RiskInputs) {
	const reasons: { label: string; points: number }[] = [];
	const assets = new Set<string>();
	let severity: number | null = null;
	for (const alert of evidence) {
		if (alert.agentId && alert.sourceId)
			assets.add(JSON.stringify([alert.sourceId, alert.agentId]));
		if (
			alert.ruleLevel !== null &&
			Number.isInteger(alert.ruleLevel) &&
			alert.ruleLevel >= 0 &&
			alert.ruleLevel <= 16
		)
			severity = Math.max(severity ?? 0, alert.ruleLevel);
	}
	if (severity !== null)
		reasons.push({
			label: "Najwyższy poziom reguły Wazuh",
			points: severity * 3,
		});
	if (assets.size > 1)
		reasons.push({
			label: "Dodatkowe zasoby",
			points: Math.min(2, assets.size - 1) * 10,
		});
	// Select a single latest completed rule set per content hash.
	const files = new Map<string, RiskInputs["scans"][number]>();
	for (const scan of scans) {
		const previous = files.get(scan.hash);
		if (
			!previous ||
			scan.completedAt > previous.completedAt ||
			(scan.completedAt === previous.completedAt && scan.jobId > previous.jobId)
		)
			files.set(scan.hash, scan);
	}
	if (files.size)
		reasons.push({
			label: "Wyniki skanowania plików YARA",
			points:
				Math.min(2, [...files.values()].filter((scan) => scan.matches.length).length) * 25,
		});
	const indicators = new Map<string, number>();
	for (const check of checks) {
		const points = tiPoints(check.result);
		if (points === null) continue;
		const key = JSON.stringify([check.kind, check.indicator]);
		indicators.set(key, Math.max(points, indicators.get(key) ?? 0));
	}
	if (indicators.size)
		reasons.push({
			label: "Reputacja wskaźników Threat Intelligence",
			points: Math.min(
				40,
				[...indicators.values()].reduce((total, value) => total + value, 0),
			),
		});
	const score = reasons.length
		? Math.min(
				100,
				reasons.reduce((total, reason) => total + reason.points, 0),
			)
		: null;
	const level =
		score === null
			? null
			: score >= 75
				? "critical"
				: score >= 45
					? "high"
					: score >= 20
						? "medium"
						: "low";
	return { score, level, reasons };
}
