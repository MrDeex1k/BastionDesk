export interface StoredFileMetadata {
	path?: string;
	bucket?: string;
	filename?: string;
	originalName?: string;
	mimeType?: string;
	size?: number;
	uploadedAt?: string;
	etag?: string;
}

export type StoredFileMetadataPayload = StoredFileMetadata | StoredFileMetadata[] | null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStoredFileMetadata(value: unknown): value is StoredFileMetadata {
	return isRecord(value);
}

export function parseStoredFileMetadata(metadata: unknown): StoredFileMetadataPayload {
	const parsed = typeof metadata === "string" ? (JSON.parse(metadata) as unknown) : metadata;

	if (Array.isArray(parsed)) {
		return parsed.filter(isStoredFileMetadata);
	}

	if (isStoredFileMetadata(parsed)) {
		return parsed;
	}

	return null;
}

export function getMetadataFilename(metadata: StoredFileMetadata): string | null {
	return metadata.originalName ?? metadata.filename ?? null;
}

export function findStoredFileMetadata(
	metadata: StoredFileMetadataPayload,
	filename: string,
): StoredFileMetadata | null {
	if (!metadata) {
		return null;
	}

	if (Array.isArray(metadata)) {
		return metadata.find((file) => getMetadataFilename(file) === filename) ?? null;
	}

	return getMetadataFilename(metadata) === filename ? metadata : null;
}

function toAsciiHeaderFilename(filename: string): string {
	return Array.from(filename, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		const isPrintableAscii = codePoint >= 0x20 && codePoint <= 0x7e;
		return isPrintableAscii && character !== `"` && character !== "\\" ? character : "_";
	}).join("");
}

export function createContentDispositionHeader(filename: string): string {
	// RFC 5987 keeps the UTF-8 filename while filename= provides an ASCII fallback.
	return `attachment; filename="${toAsciiHeaderFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
