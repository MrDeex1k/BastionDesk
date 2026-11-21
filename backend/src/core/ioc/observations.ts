import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export type IndicatorKind = "ipv4" | "ipv6" | "domain" | "url" | "md5" | "sha1" | "sha256";
export type Indicator = { kind: IndicatorKind; value: string; fields: string[] };
type Observation = {
	field: string;
	value: unknown;
	format: "text" | "ip" | "domain" | "url" | "md5" | "sha1" | "sha256";
};
type Canonical = Omit<Indicator, "fields">;

const maxIndicators = 64;
const maxText = 16_384;
const maxToken = 2048;
const token =
	/(?:https?|hxxps?):\/\/[^\s<>"'`]+|[\p{L}\p{N}._@%:-]+(?:\[\.\][\p{L}\p{N}._@%:-]+)*/giu;
const hashes: Partial<Record<number, IndicatorKind>> = { 32: "md5", 40: "sha1", 64: "sha256" };

function parseIp(value: string): Canonical | undefined {
	const version = isIP(value);
	if (version === 4) return { kind: "ipv4", value };
	if (version === 6 && !value.includes("%"))
		return { kind: "ipv6", value: new URL(`http://[${value}]`).hostname.slice(1, -1) };
}

function parseDomain(value: string): Canonical | undefined {
	const ascii = domainToASCII(value.replace(/\.$/, "")).toLowerCase();
	const labels = ascii.split(".");
	if (labels.length < 2 || ascii.length > 253 || !/^[a-z]/.test(labels.at(-1) ?? "")) return;
	if (labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
		return { kind: "domain", value: ascii };
}

function parseUrl(value: string): Canonical | undefined {
	const url = URL.parse(value.replace(/^hxxp/i, "http"));
	if (
		!url ||
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.username ||
		url.password
	)
		return;
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (!parseIp(host) && !parseDomain(host)) return;
	url.hash = "";
	return { kind: "url", value: url.href };
}

function parseHash(value: string): Canonical | undefined {
	const kind = hashes[value.length];
	if (kind && /^[0-9a-f]+$/i.test(value)) return { kind, value: value.toLowerCase() };
}

function canonicalize(value: string, format: Observation["format"]): Canonical | undefined {
	switch (format) {
		case "ip":
			return parseIp(value);
		case "domain":
			return parseDomain(value);
		case "url":
			return parseUrl(value);
		case "text":
			return /^(?:https?|hxxps?):\/\//i.test(value)
				? parseUrl(value)
				: (parseIp(value) ?? parseHash(value) ?? parseDomain(value.replace(/:\d+$/, "")));
		default: {
			const hash = parseHash(value);
			return hash?.kind === format ? hash : undefined;
		}
	}
}

function candidates(input: Observation) {
	if (typeof input.value !== "string") return [];
	const value = input.value.trim().slice(0, maxText);
	if (input.format !== "text") return [value];
	return Array.from(value.matchAll(token), (match) => match[0]!);
}

export function observeIndicators(inputs: readonly Observation[]): Indicator[] {
	const observed = new Map<string, Indicator>();
	for (const input of inputs) {
		for (const candidate of candidates(input)) {
			if (candidate.length > maxToken) continue;
			const value = candidate.replaceAll("[.]", ".").replace(/[.,;!?)}]+$/u, "");
			const indicator = canonicalize(value, input.format);
			if (!indicator) continue;
			const key = `${indicator.kind}:${indicator.value}`;
			const existing = observed.get(key);
			if (existing) {
				if (!existing.fields.includes(input.field)) existing.fields.push(input.field);
			} else if (observed.size < maxIndicators) {
				observed.set(key, { ...indicator, fields: [input.field] });
			}
		}
	}
	return [...observed.values()];
}
