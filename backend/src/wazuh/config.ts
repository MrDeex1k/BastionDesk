import { readFile } from "node:fs/promises";
import { WazuhError, parseIndexerOrigin } from "./source";
import { wazuhIndexer } from "../adapters/wazuh-indexer";
import { indexerTransport } from "./network";

export function wazuhRefreshSeconds(env = process.env) {
	const value = env.WAZUH_REFRESH_INTERVAL_SECONDS?.trim();
	if (!value) return 60;
	const seconds = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(seconds) || seconds > 2_147_483) {
		throw new Error("WAZUH_REFRESH_INTERVAL_SECONDS_INVALID");
	}
	return seconds;
}

export async function configuredWazuhIndexer(env = process.env) {
	const {
		WAZUH_INDEXER_URL,
		WAZUH_INDEXER_USER,
		WAZUH_INDEXER_PASSWORD_FILE,
		WAZUH_INDEXER_CA,
		WAZUH_INDEXER_TLS_NAME,
	} = env;
	if (!WAZUH_INDEXER_URL || !WAZUH_INDEXER_USER || !WAZUH_INDEXER_PASSWORD_FILE) {
		throw new WazuhError("NOT_CONFIGURED");
	}
	const connection = {
		origin: parseIndexerOrigin(WAZUH_INDEXER_URL).origin,
		username: WAZUH_INDEXER_USER,
		password: (await readFile(WAZUH_INDEXER_PASSWORD_FILE, "utf8")).replace(/\r?\n$/, ""),
		ca: WAZUH_INDEXER_CA ? await readFile(WAZUH_INDEXER_CA, "utf8") : undefined,
	};
	return wazuhIndexer(
		connection,
		indexerTransport(connection, {
			...env,
			WAZUH_INDEXER_TLS_ORIGIN: connection.origin,
			WAZUH_INDEXER_TLS_NAME,
		}),
	);
}
