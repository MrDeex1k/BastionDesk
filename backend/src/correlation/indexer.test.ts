import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { pageSize, wazuhIndexer } from "../adapters/wazuh-indexer";
import { timeWindow } from "./rules";

test("bounded candidate query projects supported evidence and rejects a mismatched document", async () => {
	const timestamp = "2025-01-01T00:00:00Z";
	const sha256 = "a1".repeat(32);
	const row = {
		_index: "wazuh-alerts-fixture",
		_id: "event-1",
		_source: {
			timestamp,
			agent: { id: "001", name: "host" },
			rule: { id: "100", level: 5, description: "fixture" },
			syscheck: { sha256_after: sha256.toUpperCase() },
			data: { srcip: "192.0.2.1", dstuser: "lab-user" },
			unrelated: "ignored",
		},
	};
	const requests: { path: string; body: unknown }[] = [];
	const indexer = wazuhIndexer(
		{ origin: "https://example.test", username: "fixture", password: "fixture" },
		async (_method, path, body) => {
			requests.push({ path, body });
			return { timed_out: false, _shards: { failed: 0, total: 1 }, hits: { hits: [row] } };
		},
	);
	const window = timeWindow(new Date(timestamp));
	expect(await indexer.candidates({ ...window, sha256s: [] })).toEqual([]);
	expect(requests).toHaveLength(0);
	const [candidate] = await indexer.candidates({ ...window, sha256s: [sha256], agentId: "001" });
	expect(requests[0]).toMatchObject({
		path: "/wazuh-alerts-*/_search?allow_partial_search_results=false",
		body: {
			size: pageSize,
			query: {
				bool: {
					filter: [{ range: { timestamp: { gte: window.from, lte: window.to } } }],
					minimum_should_match: 1,
					should: [
						{
							term: {
								"syscheck.sha256_after": { value: sha256, case_insensitive: true },
							},
						},
						{
							term: {
								"data.virustotal.source.sha256": {
									value: sha256,
									case_insensitive: true,
								},
							},
						},
					],
				},
			},
		},
	});
	expect(requests[1]).toMatchObject({
		body: {
			size: pageSize - 1,
			query: {
				bool: {
					must: [{ term: { "agent.id": "001" } }],
					must_not: [{ bool: { minimum_should_match: 1 } }],
				},
			},
		},
	});
	expect(candidate).toMatchObject({ sha256s: [sha256], ips: ["192.0.2.1"], users: ["lab-user"] });
	expect(candidate).not.toHaveProperty("unrelated");
	await rejects(
		indexer.correlationAlert({ indexName: row._index, documentId: "different" }),
		/UNAVAILABLE/,
	);
});
