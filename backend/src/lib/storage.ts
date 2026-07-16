/**
 * Storage (S3/MinIO) - Bun native S3 client
 *
 * Połączenie HTTPS do MinIO korzysta z globalnego zaufania CA procesu
 * (`NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE`) ustawianego w Docker Compose.
 */

import { S3Client } from "bun";
import { env } from "./env";

// Singleton klienta S3
let s3Client: S3Client | null = null;

function getClient(): S3Client {
	if (!s3Client) {
		s3Client = new S3Client({
			accessKeyId: env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY,
			bucket: env.S3_BUCKET,
			endpoint: env.S3_ENDPOINT,
		});
	}
	return s3Client;
}

// Typy pomocnicze
export interface PutObjectOptions {
	contentType?: string;
	acl?: "private" | "public-read";
}

/**
 * Zapis obiektu (buffer/string/Blob/ReadableStream)
 */
export async function putObject(
	key: string,
	data: Blob | Buffer | ArrayBuffer | string,
	options: PutObjectOptions = {},
) {
	const file = getClient().file(key);
	const body = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

	await file.write(body, {
		type: options.contentType,
	});

	return { key };
}

/**
 * Pobierz obiekt jako Buffer
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
	const file = getClient().file(key);
	const exists = await file.exists();

	if (!exists) {
		return null;
	}

	return Buffer.from(await file.arrayBuffer());
}

/**
 * Pobierz obiekt jako JSON
 */
export async function getObjectJson<T = unknown>(key: string): Promise<T | null> {
	try {
		const file = getClient().file(key);
		const exists = await file.exists();

		if (!exists) {
			return null;
		}

		return (await file.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Usuń obiekt
 */
export async function deleteObject(key: string): Promise<void> {
	await getClient().file(key).delete();
}

/**
 * Wygeneruj presigned URL do pobrania
 */
export async function presignObject(
	key: string,
	{
		expiresIn = 3600, // 1h
	}: {
		expiresIn?: number;
		acl?: "private" | "public-read";
	} = {},
): Promise<string> {
	return getClient().file(key).presign({
		expiresIn,
		method: "GET",
	});
}

export const storageClient = {
	putObject,
	getObjectBuffer,
	getObjectJson,
	deleteObject,
	presignObject,
};
