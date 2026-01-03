/**
 * Storage (S3/MinIO) - AWS SDK S3 client
 *
 * Wykorzystuje AWS SDK S3 client dla kompatybilności z MinIO.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";

// Singleton klienta S3
let s3Client: S3Client | null = null;

function getClient(): S3Client {
	if (!s3Client) {
		s3Client = new S3Client({
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION,
			credentials: {
				accessKeyId: env.S3_ACCESS_KEY,
				secretAccessKey: env.S3_SECRET_KEY,
			},
			forcePathStyle: true, // Wymagane dla MinIO
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
	const command = new PutObjectCommand({
		Bucket: env.S3_BUCKET,
		Key: key,
		Body: data,
		ContentType: _options.contentType,
		ACL: _options.acl,
	});
	await client.send(command);
	return { key };
}

/**
 * Pobierz obiekt jako Buffer
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
	const client = getClient();
	const command = new GetObjectCommand({
		Bucket: env.S3_BUCKET,
		Key: key,
	});
	try {
		const response = await client.send(command);
		if (response.Body) {
			const chunks: Uint8Array[] = [];
			const reader = response.Body.transformToByteArray();
			return Buffer.from(await reader);
		}
		return null;
	} catch (error) {
		if ((error as any).name === 'NoSuchKey') return null;
		throw error;
	}
}

/**
 * Pobierz obiekt jako JSON
 */
export async function getObjectJson<T = unknown>(
	key: string,
): Promise<T | null> {
	const buffer = await getObjectBuffer(key);
	if (!buffer) return null;
	try {
		return JSON.parse(buffer.toString()) as T;
	} catch {
		return null;
	}
}

/**
 * Usuń obiekt
 */
export async function deleteObject(key: string): Promise<void> {
	const client = getClient();
	const command = new DeleteObjectCommand({
		Bucket: env.S3_BUCKET,
		Key: key,
	});
	await client.send(command);
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
	throw new Error("Presigned URLs not implemented yet");
}

export const storageClient = {
	putObject,
	getObjectBuffer,
	getObjectJson,
	deleteObject,
	presignObject,
};
