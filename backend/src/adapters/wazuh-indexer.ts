import { z } from "zod";
import { alertReference, ruleLevel, uniqueAlerts } from "../core/alerts/read";
import { wazuhEvidence } from "../core/ioc/evidence";
import { indexerTransport } from "../wazuh/network";
import { WazuhError, type SourceConnection } from "../wazuh/source";

const fields = ["timestamp", "agent.id", "agent.name", "rule.id", "rule.level", "rule.description"];
const evidenceFields = [
	"data.srcip",
	"data.dstip",
	"data.domain",
	"data.url",
	"data.yara",
	"data.yara_rule",
	"data.yara_scanned_file",
	"data.virustotal",
	"syscheck.sha256_after",
	"syscheck.sha1_after",
	"syscheck.md5_after",
];
const alertFields = z.object({
	timestamp: z.string().refine((value) => Number.isFinite(Date.parse(value))),
	agent: z.object({ id: z.string().min(1), name: z.string().optional() }),
	rule: z.object({
		id: z.string().min(1),
		level: ruleLevel,
		description: z.string(),
	}),
});
const documentKey = alertReference.pick({ indexName: true, documentId: true });
const hit = z.object({
	_index: documentKey.shape.indexName,
	_id: documentKey.shape.documentId,
	_source: z.record(z.string(), z.unknown()).optional(),
	sort: z.tuple([z.number(), z.string(), z.string()]).optional(),
});
const response = z.object({
	timed_out: z.literal(false),
	_shards: z.object({
		failed: z.literal(0),
		total: z.number().int().nonnegative(),
	}),
	hits: z.object({ hits: z.array(hit).max(51) }),
});
const snapshotResponse = z.object({
	pit_id: z.string().min(1),
	_shards: z.object({ failed: z.literal(0) }).optional(),
});
const closeResponse = z.object({
	pits: z.tuple([z.object({ successful: z.literal(true), pit_id: z.string() })]),
});
export const pageSize = 50;
export const keepAliveMs = 120_000;
export type Sort = [number, string, string];
export type SearchFilters = { from: string; to: string; level?: number };
export type CandidateFilters = {
	from: string;
	to: string;
	agentId?: string;
	sha256s: string[];
};
export type DocumentKey = z.infer<typeof documentKey>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
	const result = schema.safeParse(value);
	if (!result.success) throw new WazuhError("UNAVAILABLE");
	return result.data;
}

function project(document: z.infer<typeof hit>) {
	const source = parse(alertFields, document._source);
	return {
		indexName: document._index,
		documentId: document._id,
		agentId: source.agent.id,
		agentName: source.agent.name ?? null,
		timestamp: new Date(source.timestamp).toISOString(),
		ruleId: source.rule.id,
		ruleLevel: source.rule.level,
		description: source.rule.description,
	};
}

const correlationFields = [
	...fields,
	"syscheck.sha256_after",
	"data.virustotal.source.sha256",
	"data.srcip",
	"data.dstip",
	"data.srcuser",
	"data.dstuser",
	"data.user",
];

function correlationProjection(row: z.infer<typeof hit>) {
	const indicators = wazuhEvidence(row._source ?? {}).indicators;
	const data = z.record(z.string(), z.unknown()).safeParse(row._source?.data);
	const users = data.success
		? ["srcuser", "dstuser", "user"]
				.map((key) => data.data[key])
				.filter(
					(value): value is string =>
						typeof value === "string" && value.length > 0 && value.length <= 128,
				)
		: [];
	return {
		...project(row),
		sha256s: indicators.filter((i) => i.kind === "sha256").map((i) => i.value),
		ips: indicators.filter((i) => i.kind === "ipv4" || i.kind === "ipv6").map((i) => i.value),
		users: [...new Set(users)],
	};
}

export function wazuhIndexer(connection: SourceConnection, send = indexerTransport(connection)) {
	const search = async (path: string, body: object, signal?: AbortSignal) =>
		parse(
			response,
			await send("POST", path + "?allow_partial_search_results=false", body, signal),
		);
	const closeSnapshot = async (pit: string, signal?: AbortSignal) => {
		const result = await send("DELETE", "/_search/point_in_time", { pit_id: [pit] }, signal);
		if (parse(closeResponse, result).pits[0].pit_id !== pit)
			throw new WazuhError("UNAVAILABLE");
	};

	return {
		async correlationPicker(
			filters: { from: string; to: string; query: string },
			signal?: AbortSignal,
		) {
			const { from, to, query } = filters;
			const recent = { range: { timestamp: { gte: from, lte: to } } };
			const filter = query
				? {
						bool: {
							should: [
								{ ids: { values: [query] } },
								{
									bool: {
										filter: [recent],
										should: [
											{ term: { "agent.id": query } },
											{ term: { "rule.id": query } },
											{
												prefix: {
													"agent.name": {
														value: query,
														case_insensitive: true,
													},
												},
											},
											{
												prefix: {
													"rule.description": {
														value: query,
														case_insensitive: true,
													},
												},
											},
										],
										minimum_should_match: 1,
									},
								},
							],
							minimum_should_match: 1,
						},
					}
				: recent;
			const result = await search(
				"/wazuh-alerts-*/_search",
				{
					size: pageSize,
					track_total_hits: false,
					_source: fields,
					sort: [{ timestamp: "desc" }, { _index: "asc" }, { _id: "asc" }],
					query: { bool: { filter } },
				},
				signal,
			);
			return uniqueAlerts(result.hits.hits.map(project));
		},
		async hasAlertIndices(signal?: AbortSignal) {
			const result = await search(
				"/wazuh-alerts-*/_search",
				{ size: 0, track_total_hits: false, _source: false },
				signal,
			);
			return result._shards.total > 0;
		},
		async openSnapshot(signal?: AbortSignal) {
			const result = await send(
				"POST",
				"/wazuh-alerts-*/_search/point_in_time?keep_alive=2m&allow_partial_pit_creation=false&allow_no_indices=false",
				undefined,
				signal,
			);
			return parse(snapshotResponse, result).pit_id;
		},
		closeSnapshot,
		async page(
			filters: SearchFilters,
			pit: string,
			after: Sort | undefined,
			signal?: AbortSignal,
		) {
			const filter: object[] = [
				{ range: { timestamp: { gte: filters.from, lte: filters.to } } },
			];
			if (filters.level !== undefined) filter.push({ term: { "rule.level": filters.level } });
			const result = await search(
				"/_search",
				{
					pit: { id: pit, keep_alive: "2m" },
					size: pageSize + 1,
					track_total_hits: false,
					_source: fields,
					sort: [{ timestamp: "desc" }, { _index: "asc" }, { _id: "asc" }],
					query: { bool: { filter } },
					search_after: after,
				},
				signal,
			);
			const hits = result.hits.hits;
			const page = hits.slice(0, pageSize);
			const next = hits.length > pageSize ? page.at(-1)?.sort : undefined;
			if (hits.length > pageSize && !next) throw new WazuhError("UNAVAILABLE");
			const alerts = uniqueAlerts(page.map(project));
			if (
				filters.level !== undefined &&
				alerts.some((row) => row.ruleLevel !== filters.level)
			)
				throw new WazuhError("UNAVAILABLE");
			return { alerts, next };
		},
		async candidates(filters: CandidateFilters, signal?: AbortSignal) {
			const hashes = ["syscheck.sha256_after", "data.virustotal.source.sha256"].flatMap(
				(field) =>
					filters.sha256s.slice(0, 64).map((hash) => ({
						term: { [field]: { value: hash, case_insensitive: true } },
					})),
			);
			const query = async (size: number, conditions: object) => {
				const result = await search(
					"/wazuh-alerts-*/_search",
					{
						size,
						track_total_hits: false,
						_source: correlationFields,
						sort: [{ timestamp: "desc" }, { _index: "asc" }, { _id: "asc" }],
						query: {
							bool: {
								filter: [
									{
										range: {
											timestamp: { gte: filters.from, lte: filters.to },
										},
									},
								],
								...conditions,
							},
						},
					},
					signal,
				);
				return result.hits.hits;
			};
			const hashMatch = { bool: { should: hashes, minimum_should_match: 1 } };
			const exact = hashes.length ? await query(pageSize, hashMatch.bool) : [];
			const agent =
				filters.agentId && exact.length < pageSize
					? await query(pageSize - exact.length, {
							must: [{ term: { "agent.id": filters.agentId } }],
							...(hashes.length && { must_not: [hashMatch] }),
						})
					: [];
			return [...exact, ...agent].map(correlationProjection);
		},
		async correlationAlert(key: DocumentKey, signal?: AbortSignal) {
			const checked = parse(documentKey, key);
			const result = await search(
				"/" + encodeURIComponent(checked.indexName) + "/_search",
				{
					size: 1,
					_source: correlationFields,
					query: { ids: { values: [checked.documentId] } },
				},
				signal,
			);
			const [row] = result.hits.hits;
			if (!row) throw new WazuhError("NOT_FOUND");
			if (row._index !== checked.indexName || row._id !== checked.documentId)
				throw new WazuhError("UNAVAILABLE");
			return correlationProjection(row);
		},
		async document(key: DocumentKey, full: boolean, signal?: AbortSignal) {
			const result = await search(
				"/" + encodeURIComponent(key.indexName) + "/_search",
				{
					size: 1,
					_source: full ? true : [...fields, ...evidenceFields],
					query: { ids: { values: [key.documentId] } },
				},
				signal,
			);
			const [row] = result.hits.hits;
			if (!row) throw new WazuhError("NOT_FOUND");
			if (
				row._id !== key.documentId ||
				row._index !== key.indexName ||
				(full && !row._source)
			)
				throw new WazuhError("UNAVAILABLE");
			return full
				? { _index: row._index, _id: row._id, _source: row._source }
				: { ...project(row), ...wazuhEvidence(row._source ?? {}) };
		},
	};
}
