import { expect, test } from "bun:test";
import { incidentIndicators, wazuhEvidence } from "./evidence";

test("incident IOC are canonicalized, deduplicated and keep their fields", () => {
	const hash = "ab".repeat(32);
	const result = incidentIndicators({
		userDescription: `Źródła 203.0.113.2, 2001:0DB8::A, EXAMPLE[.]ORG. hxxps://EXAMPLE[.]ORG/path#anchor ${hash.toUpperCase()}`,
		userAttachmentMetadata: { contentHash: hash },
	});
	expect(result).toEqual([
		{
			kind: "sha256",
			value: hash,
			fields: ["userAttachmentMetadata.contentHash", "userDescription"],
		},
		{ kind: "ipv4", value: "203.0.113.2", fields: ["userDescription"] },
		{ kind: "ipv6", value: "2001:db8::a", fields: ["userDescription"] },
		{ kind: "domain", value: "example.org", fields: ["userDescription"] },
		{ kind: "url", value: "https://example.org/path", fields: ["userDescription"] },
	]);
});

test("Wazuh parses known scan outputs and distinguishes no report from no match", () => {
	const sha1 = "ab".repeat(20);
	const source = {
		syscheck: { sha1_after: sha1 },
		data: {
			yara_rule: "Local_Test",
			yara_scanned_file: "/tmp/test.txt",
			virustotal: { found: "1", positives: "0", source: { sha1, alert_id: "event-1" } },
		},
	};
	expect(wazuhEvidence(source)).toEqual({
		indicators: [
			{
				kind: "sha1",
				value: sha1,
				fields: ["syscheck.sha1_after", "data.virustotal.source.sha1"],
			},
		],
		fileObservations: [
			{ method: "yara", status: "matched", rule: "Local_Test", file: "/tmp/test.txt" },
			{ method: "virustotal", status: "clean", sourceAlertId: "event-1", positives: 0 },
		],
	});
	expect(
		wazuhEvidence({ data: { virustotal: { found: "0" } } }).fileObservations[0]?.status,
	).toBe("not_found");
	expect(
		wazuhEvidence({ data: { virustotal: { error: "403" } } }).fileObservations[0]?.status,
	).toBe("failed");
	expect(
		wazuhEvidence({ data: { virustotal: { found: "1", positives: "2" } } }).fileObservations[0]
			?.status,
	).toBe("matched");
	expect(wazuhEvidence({ data: { virustotal: { found: "1" } } }).fileObservations).toEqual([]);
});

test("metadata gaps and malformed structured alert fields do not block incident details", () => {
	expect(
		incidentIndicators({
			userDescription: "See http://[2001:db8::1]",
			userAttachmentMetadata: "invalid JSON",
		}),
	).toEqual([{ kind: "url", value: "http://[2001:db8::1]/", fields: ["userDescription"] }]);
	expect(
		wazuhEvidence({
			syscheck: { sha256_after: "a".repeat(40) },
			data: {
				virustotal: { found: { toString: "ignored" }, positives: { toString: "ignored" } },
			},
		}),
	).toEqual({ indicators: [], fileObservations: [] });
});
