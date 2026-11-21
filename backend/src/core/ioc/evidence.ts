import { parseStoredFileMetadata } from "../files/metadata";
import { observeIndicators, type Indicator } from "./observations";

export function incidentIndicators(incident: {
	userDescription: string;
	userAttachmentMetadata: unknown;
}) {
	let parsed: ReturnType<typeof parseStoredFileMetadata>;
	try {
		parsed = parseStoredFileMetadata(incident.userAttachmentMetadata);
	} catch {
		parsed = null;
	}
	const attachments = Array.isArray(parsed) ? parsed : [parsed];
	return observeIndicators([
		...attachments.map((attachment) => ({
			field: "userAttachmentMetadata.contentHash",
			value: attachment?.contentHash,
			format: "sha256" as const,
		})),
		{ field: "userDescription", value: incident.userDescription, format: "text" },
	]);
}

type Data = Record<string, unknown>;
function record(value: unknown): Data {
	return value && typeof value === "object" && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: {};
}

export type WazuhFileObservation =
	| { method: "yara"; status: "matched"; rule: string; file?: string }
	| {
			method: "virustotal";
			status: "matched" | "clean" | "not_found" | "failed";
			file?: string;
			sourceAlertId?: string;
			positives?: number;
	  };

function boundedString(value: unknown, limit: number) {
	return typeof value === "string" && value.length > 0 && value.length <= limit
		? value
		: undefined;
}

function fileObservations(data: Data): WazuhFileObservation[] {
	const result: WazuhFileObservation[] = [];
	const yara = record(data.yara);
	const yaraRule = boundedString(data.yara_rule ?? yara.rule, 200);
	const yaraFile = boundedString(data.yara_scanned_file ?? yara.file, 4096);
	if (yaraRule)
		result.push({ method: "yara", status: "matched", rule: yaraRule, file: yaraFile });
	const vt = record(data.virustotal);
	const source = record(vt.source);
	const rawCount = vt.positives;
	const count =
		(typeof rawCount === "string" || typeof rawCount === "number") &&
		/^(?:0|[1-9][0-9]{0,5})$/.test(String(rawCount))
			? Number(rawCount)
			: undefined;
	const found =
		vt.found === 0 || vt.found === "0"
			? "0"
			: vt.found === 1 || vt.found === "1"
				? "1"
				: undefined;
	const status = vt.error
		? "failed"
		: found === "0"
			? "not_found"
			: found === "1" && count !== undefined
				? count > 0
					? "matched"
					: "clean"
				: undefined;
	if (status)
		result.push({
			method: "virustotal",
			status,
			file: boundedString(source.file, 4096),
			sourceAlertId: boundedString(source.alert_id, 100),
			positives: count,
		});
	return result;
}

export function wazuhEvidence(source: Data): {
	indicators: Indicator[];
	fileObservations: WazuhFileObservation[];
} {
	const data = record(source.data);
	const syscheck = record(source.syscheck);
	const vt = record(data.virustotal);
	const origin = record(vt.source);
	return {
		indicators: observeIndicators([
			{ field: "data.srcip", value: data.srcip, format: "ip" },
			{ field: "data.dstip", value: data.dstip, format: "ip" },
			{ field: "data.domain", value: data.domain, format: "domain" },
			{ field: "data.url", value: data.url, format: "url" },
			{ field: "syscheck.sha256_after", value: syscheck.sha256_after, format: "sha256" },
			{ field: "syscheck.sha1_after", value: syscheck.sha1_after, format: "sha1" },
			{ field: "syscheck.md5_after", value: syscheck.md5_after, format: "md5" },
			{ field: "data.virustotal.source.sha256", value: origin.sha256, format: "sha256" },
			{ field: "data.virustotal.source.sha1", value: origin.sha1, format: "sha1" },
			{ field: "data.virustotal.source.md5", value: origin.md5, format: "md5" },
			{ field: "data.virustotal.sha1", value: vt.sha1, format: "sha1" },
		]),
		fileObservations: fileObservations(data),
	};
}
