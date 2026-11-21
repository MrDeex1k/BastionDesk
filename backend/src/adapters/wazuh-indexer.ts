import { z } from "zod";
import { alertReference, ruleLevel, uniqueAlerts } from "../core/alerts/read";
import { indexerTransport } from "../wazuh/network";
import { WazuhError, type SourceConnection } from "../wazuh/source";

const fields = ["timestamp", "agent.id", "agent.name", "rule.id", "rule.level", "rule.description"];
const alertFields = z.object({
	timestamp: z.string().refine((value) => Number.isFinite(Date.parse(value))),
	agent: z.object({ id: z.string().min(1), name: z.string().optional() }),
	rule: z.object({ id: z.string().min(1), level: ruleLevel, description: z.string() }),
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
	_shards: z.object({ failed: z.literal(0), total: z.number().int().nonnegative() }),
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
		async document(key: DocumentKey, full: boolean) {
			const result = await search("/" + encodeURIComponent(key.indexName) + "/_search", {
				size: 1,
				_source: full ? true : fields,
				query: { ids: { values: [key.documentId] } },
			});
			const [row] = result.hits.hits;
			if (!row) throw new WazuhError("NOT_FOUND");
			if (
				row._id !== key.documentId ||
				row._index !== key.indexName ||
				(full && !row._source)
			)
				throw new WazuhError("UNAVAILABLE");
			return full ? { _index: row._index, _id: row._id, _source: row._source } : project(row);
		},
	};
}
