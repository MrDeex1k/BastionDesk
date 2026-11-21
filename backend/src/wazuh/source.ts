import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export type Source = {
	organization_id: string;
	revision: string;
	origin: string;
	username: string;
	ca_pem: string | null;
	encrypted_password: string;
	enabled: boolean;
};
export type SourceConnection = { origin: string; username: string; password: string; ca?: string };
export type SourceDraft = Omit<SourceConnection, "password"> & { password?: string };

export function parseIndexerOrigin(value: string) {
	const url = URL.parse(value);
	if (
		!url ||
		url.protocol !== "https:" ||
		url.pathname !== "/" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new WazuhError("INVALID_ADDRESS");
	}
	return url;
}

export class WazuhError extends Error {
	constructor(
		public code:
			| "INVALID_ADDRESS"
			| "NETWORK"
			| "TIMEOUT"
			| "TLS"
			| "AUTHENTICATION"
			| "PERMISSION"
			| "UNAVAILABLE"
			| "NOT_FOUND"
			| "STALE"
			| "PASSWORD_REQUIRED"
			| "NOT_CONFIGURED"
			| "DISABLED",
	) {
		super(code);
	}
}

export function assertWithinDeadline(signal?: AbortSignal) {
	if (signal?.aborted) throw new WazuhError("TIMEOUT");
}

async function encryptionKey() {
	const path = process.env.WAZUH_SOURCE_KEY_FILE;
	if (!path) throw new WazuhError("NOT_CONFIGURED");
	const encoded = (await readFile(path, "utf8")).trim();
	const key = Buffer.from(encoded, "base64");
	if (key.length !== 32 || key.toString("base64") !== encoded)
		throw new WazuhError("NOT_CONFIGURED");
	return key;
}

function associatedData(org: string, origin: string, username: string) {
	return Buffer.from(JSON.stringify(["bastiondesk-wazuh-v1", org, origin, username]));
}

async function encrypt(org: string, value: SourceConnection) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
	cipher.setAAD(associatedData(org, value.origin, value.username));
	const encrypted = Buffer.concat([cipher.update(value.password, "utf8"), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export async function sourceConnection(source: Source): Promise<SourceConnection> {
	const data = Buffer.from(source.encrypted_password, "base64");
	const decipher = createDecipheriv("aes-256-gcm", await encryptionKey(), data.subarray(0, 12));
	decipher.setAAD(associatedData(source.organization_id, source.origin, source.username));
	decipher.setAuthTag(data.subarray(12, 28));
	return {
		origin: source.origin,
		username: source.username,
		ca: source.ca_pem ?? undefined,
		password: Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString(
			"utf8",
		),
	};
}

export async function draftConnection(draft: SourceDraft, previous: Source | undefined) {
	const origin = parseIndexerOrigin(draft.origin).origin;
	let password = draft.password;
	if (
		password === undefined &&
		previous?.origin === origin &&
		previous.username === draft.username
	) {
		password = (await sourceConnection(previous)).password;
	}
	if (!password) throw new WazuhError("PASSWORD_REQUIRED");
	return { origin, username: draft.username, password, ca: draft.ca };
}

export function wazuhSourceStore(db: Pick<Pool, "query">) {
	return {
		async get(org: string) {
			return (
				await db.query<Source>("SELECT * FROM wazuh_sources WHERE organization_id = $1", [
					org,
				])
			).rows[0];
		},
		async save(
			org: string,
			connection: SourceConnection,
			expected?: string,
			signal?: AbortSignal,
		) {
			const values = [
				org,
				crypto.randomUUID(),
				connection.origin,
				connection.username,
				connection.ca ?? null,
				await encrypt(org, connection),
			];
			assertWithinDeadline(signal);
			const result = expected
				? await db.query<Source>(
						`UPDATE wazuh_sources SET revision=$2, origin=$3, username=$4, ca_pem=$5, encrypted_password=$6, enabled=true
					 WHERE organization_id=$1 AND revision=$7 RETURNING *`,
						[...values, expected],
					)
				: await db.query<Source>(
						`INSERT INTO wazuh_sources (organization_id,revision,origin,username,ca_pem,encrypted_password)
					 VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`,
						values,
					);
			const saved = result.rows[0];
			if (!saved) throw new WazuhError("STALE");
			return saved;
		},
		async setEnabled(org: string, expected: string, enabled: boolean, signal?: AbortSignal) {
			assertWithinDeadline(signal);
			const result = await db.query<Source>(
				"UPDATE wazuh_sources SET enabled=$3, revision=$4 WHERE organization_id=$1 AND revision=$2 RETURNING *",
				[org, expected, enabled, crypto.randomUUID()],
			);
			const saved = result.rows[0];
			if (!saved) throw new WazuhError("STALE");
			return saved;
		},
		async remove(org: string, expected: string) {
			const result = await db.query(
				"DELETE FROM wazuh_sources WHERE organization_id=$1 AND revision=$2",
				[org, expected],
			);
			if (!result.rowCount) throw new WazuhError("STALE");
		},
	};
}
