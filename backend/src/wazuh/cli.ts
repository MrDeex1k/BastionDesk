import { alertReference, ruleLevelParameter } from "../core/alerts/read";
import { configuredWazuhIndexer } from "./config";
import { WazuhError } from "./source";

try {
	const [agentId, indexName, documentId, requestedLevel] = process.argv.slice(2);
	const reference = alertReference.safeParse({ agentId, indexName, documentId });
	const level = ruleLevelParameter.optional().safeParse(requestedLevel);
	if (!reference.success || !level.success || process.argv.length > 6) {
		throw new Error("Usage: bun run wazuh:read <agent> <index> <document> [level]");
	}
	const source = await configuredWazuhIndexer();
	const document = await source.document(reference.data, false);
	if (!("agentId" in document)) throw new WazuhError("UNAVAILABLE");
	console.log(
		JSON.stringify(
			document.agentId === agentId &&
				(level.data === undefined || level.data === document.ruleLevel)
				? [document]
				: [],
		),
	);
} catch (error) {
	console.error(error instanceof WazuhError ? error.code : "WAZUH_READ_FAILED");
	process.exitCode = 1;
}
