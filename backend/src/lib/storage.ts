/**
 * Storage (S3/MinIO) - Bun S3Client
 *
 * Wykorzystuje Bun S3Client dla kompatybilności z MinIO.
 */

import { env } from "./env";

// Singleton klienta S3
let s3Client: Bun.S3Client | null = null;

function getClient(): Bun.S3Client {
	if (!s3Client) {
		s3Client = new Bun.S3Client({
			accessKeyId: env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY,
			bucket: env.S3_BUCKET,
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION,
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
	_options: PutObjectOptions = {},
) {
	const client = getClient();
	const file = client.file(key);
	await file.write(data, {
		type: _options.contentType,
		acl: _options.acl,
	});
	return { key };
}

/**
 * Pobierz obiekt jako Buffer
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
	const client = getClient();
	const file = client.file(key);
	try {
		const buffer = await file.arrayBuffer();
		return Buffer.from(buffer);
	} catch (error) {
		// Zakładamy, że błąd oznacza brak pliku
		if (error instanceof Error) return null;
		throw error;
	}
}

/**
 * Pobierz obiekt jako JSON
 */
export async function getObjectJson<T = unknown>(
	key: string,
): Promise<T | null> {
	const client = getClient();
	const file = client.file(key);
	try {
		return await file.json() as T;
	} catch {
		return null;
	}
}

/**
 * Usuń obiekt
 */
export async function deleteObject(key: string): Promise<void> {
	const client = getClient();
	const file = client.file(key);
	await file.delete();
}

/**
 * Wygeneruj presigned URL (np. do pobrania/wgrania)
 */
export function presignObject(
	key: string,
	{
		expiresIn = 3600, // 1h
		acl,
	}: {
		expiresIn?: number;
		acl?: "private" | "public-read";
	} = {},
): string {
	const client = getClient();
	const file = client.file(key);
	return file.presign({
		expiresIn,
		acl,
	});
}

export const storageClient = {
	putObject,
	getObjectBuffer,
	getObjectJson,
	deleteObject,
	presignObject,
};
