/**
 * Storage (S3/MinIO) - Bun native S3 client
 *
 * Wykorzystuje natywny sterownik S3 w Bun (S3Client).
 * Obsługuje MinIO (S3-compatible) działające w serwisie `storage`.
 */

import { S3Client, write } from "bun";
import { env } from "./env";

// Singleton klienta S3
let s3Client: S3Client | null = null;

function getClient(): S3Client {
	if (!s3Client) {
		s3Client = new S3Client({
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION,
			accessKeyId: env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY,
			bucket: env.S3_BUCKET,
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
	const client = getClient();
	const file = client.file(key) as any;
	await write(file, data as any);
	return { key };
}

/**
 * Pobierz obiekt jako Buffer
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
	const client = getClient();
	const file = client.file(key) as any;
	if (file.exists && !(await file.exists())) return null;
	const ab: ArrayBuffer | undefined =
		(typeof file.arrayBuffer === "function" && (await file.arrayBuffer())) ||
		(undefined as any);
	if (!ab) return null;
	return Buffer.from(ab);
}

/**
 * Pobierz obiekt jako JSON
 */
export async function getObjectJson<T = unknown>(key: string): Promise<T | null> {
	const client = getClient();
	const file = client.file(key) as any;
	if (file.exists && !(await file.exists())) return null;
	if (typeof file.json !== "function") return null;
	return (await file.json()) as T;
}

/**
 * Usuń obiekt
 */
export async function deleteObject(key: string): Promise<void> {
	const client = getClient();
	const file = client.file(key) as any;
	if (typeof file.delete === "function") {
		await file.delete();
	}
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
	const file = client.file(key) as any;
	return file.presign({
		expiresIn,
		acl,
	});
}

/**
 * Prostą ścieżkę klucza można zbudować tak:
 * const key = `incidents/${incidentId}/${fileName}`;
 */

export const storageClient = {
	putObject,
	getObjectBuffer,
	getObjectJson,
	deleteObject,
	presignObject,
};

