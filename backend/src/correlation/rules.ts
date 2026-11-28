import type { AlertSummary } from "../core/alerts/read";
import type { Indicator } from "../core/ioc/observations";

export type CorrelationAlert = AlertSummary & {
	sourceId: string;
	sha256s: string[];
	ips?: string[];
	users?: string[];
};
export type ReportSignals = {
	createdAt: Date;
	sourceId: string | null;
	agentId: string | null;
	indicators: Indicator[];
	userDescription?: string;
};
export const correlationRule = {
	version: "correlation.v1",
	windowMs: 24 * 60 * 60_000,
};

export function configuredWindowMs(raw = process.env.CORRELATION_WINDOW_HOURS) {
	if (!raw) return correlationRule.windowMs;
	const hours = Number(raw);
	if (!Number.isInteger(hours) || hours < 1 || hours > 168)
		throw new Error("CORRELATION_WINDOW_HOURS must be an integer from 1 to 168");
	return hours * 60 * 60_000;
}

export function timeWindow(anchor: Date, windowMs = correlationRule.windowMs) {
	return {
		from: new Date(anchor.getTime() - windowMs).toISOString(),
		to: new Date(anchor.getTime() + windowMs).toISOString(),
	};
}

export function isAttachmentHash(indicator: Indicator) {
	return (
		indicator.kind === "sha256" &&
		indicator.fields.includes("userAttachmentMetadata.contentHash")
	);
}

export function matchReport(
	report: ReportSignals,
	alert: CorrelationAlert,
	windowMs = correlationRule.windowMs,
) {
	const distance = Math.abs(report.createdAt.getTime() - Date.parse(alert.timestamp));
	if (!Number.isFinite(distance) || distance > windowMs) return;
	const asset = report.sourceId === alert.sourceId && report.agentId === alert.agentId;
	const hashes = report.indicators.filter(
		(i) => isAttachmentHash(i) && alert.sha256s.includes(i.value),
	);
	if (!asset && !hashes.length) return;
	const signals = hashes.map((i) => "sha256:" + i.value);
	if (asset) signals.unshift("asset:" + alert.agentId);
	const words = new Set(
		(report.userDescription ?? "")
			.slice(0, 16384)
			.toLowerCase()
			.match(/[\p{L}\p{N}._@\\-]+/gu),
	);
	if (alert.agentName && words.has(alert.agentName.toLowerCase()))
		signals.push("hostname:" + alert.agentName);
	for (const ip of alert.ips ?? [])
		if (
			report.indicators.some(
				(i) => (i.kind === "ipv4" || i.kind === "ipv6") && i.value === ip,
			)
		)
			signals.push("ip:" + ip);
	for (const user of alert.users ?? [])
		if (words.has(user.toLowerCase())) signals.push("user:" + user);
	return {
		confidence: asset && hashes.length ? 100 : hashes.length ? 95 : 80,
		signals,
		version:
			windowMs === correlationRule.windowMs
				? correlationRule.version
				: correlationRule.version + "." + windowMs / (60 * 60_000) + "h",
	};
}
