/**
 * File Helper - Natywna obsługa plików w Bun
 *
 * Wykorzystuje Web API FormData i Blob do parsowania multipart/form-data
 */

import type { Request } from "express";
import { AppError } from "../middleware/error.middleware";

// Maksymalne rozmiary plików (w bajtach)
const MAX_FILE_SIZE = {
	screenshot: 10 * 1024 * 1024, // 10MB
	attachment: 50 * 1024 * 1024, // 50MB
	report: 50 * 1024 * 1024, // 50MB
	statement: 50 * 1024 * 1024, // 50MB
};

// Dozwolone typy MIME
const ALLOWED_MIME_TYPES = {
	screenshot: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
	attachment: ["*"], // Wszystkie typy plików dozwolone dla załączników
	report: [
		"application/pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
		"application/msword", // .doc
	],
	statement: [
		"application/pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
		"application/msword", // .doc
	],
};

const FILE_EXTENSIONS: Record<"report" | "statement", Record<string, string>> = {
	report: {
		"application/pdf": "pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
		"application/msword": "doc",
	},
	statement: {
		"application/pdf": "pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
		"application/msword": "doc",
	},
};

export type FileType = keyof typeof MAX_FILE_SIZE;

export interface ParsedFile {
	file: File;
	buffer: ArrayBuffer;
	metadata: {
		originalName: string;
		size: number;
		mimeType: string;
		uploadedAt: string;
	};
}

export interface ParsedFormData {
	fields: Record<string, string>;
	files: Record<string, ParsedFile>;
}

export interface Base64FileUpload {
	filename: string;
	data: string;
	mimeType: string;
}

export interface ParsedBase64FileUpload {
	buffer: Buffer;
	metadata: {
		filename: string;
		mimeType: string;
		size: number;
	};
}

function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
	if (mimeType === "application/pdf") {
		return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
	}

	if (mimeType === "application/msword") {
		return buffer.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"));
	}

	if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
		const signature = buffer.subarray(0, 4).toString("hex");
		return ["504b0304", "504b0506", "504b0708"].includes(signature);
	}

	return false;
}

function decodeStrictBase64(data: string): Buffer {
	if (
		data.length === 0 ||
		data.length % 4 !== 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
	) {
		throw new AppError(400, "INVALID_FILE_DATA", "Dane pliku nie są poprawnym base64");
	}

	const buffer = Buffer.from(data, "base64");
	if (buffer.toString("base64") !== data) {
		throw new AppError(400, "INVALID_FILE_DATA", "Dane pliku nie są poprawnym base64");
	}

	return buffer;
}

export function parseBase64FileUpload(
	value: unknown,
	fileType: "report" | "statement",
): ParsedBase64FileUpload {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new AppError(400, "MISSING_FILE_DATA", "Brak danych pliku");
	}

	const { filename, data, mimeType } = value as Partial<Base64FileUpload>;
	if (typeof filename !== "string" || typeof data !== "string" || typeof mimeType !== "string") {
		throw new AppError(400, "INVALID_FILE_DATA", "Nieprawidłowa struktura danych pliku");
	}

	const containsControlCharacter = Array.from(filename).some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127;
	});

	if (
		filename.length === 0 ||
		filename.length > 255 ||
		filename !== filename.trim() ||
		filename === "." ||
		filename === ".." ||
		filename.includes("/") ||
		filename.includes("\\") ||
		containsControlCharacter
	) {
		throw new AppError(400, "INVALID_FILENAME", "Nieprawidłowa nazwa pliku");
	}

	const expectedExtension = FILE_EXTENSIONS[fileType][mimeType];
	if (!expectedExtension) {
		throw new AppError(400, "INVALID_FILE_TYPE", "Nieprawidłowy typ pliku");
	}

	if (getFileExtension(filename) !== expectedExtension) {
		throw new AppError(400, "INVALID_FILE_TYPE", "Rozszerzenie pliku nie pasuje do typu MIME");
	}

	const maxEncodedLength = 4 * Math.ceil(MAX_FILE_SIZE[fileType] / 3);
	if (data.length > maxEncodedLength) {
		throw new AppError(400, "FILE_TOO_LARGE", "Plik przekracza limit 50MB");
	}

	const buffer = decodeStrictBase64(data);
	if (buffer.length > MAX_FILE_SIZE[fileType]) {
		throw new AppError(400, "FILE_TOO_LARGE", "Plik przekracza limit 50MB");
	}

	if (!hasExpectedSignature(buffer, mimeType)) {
		throw new AppError(400, "INVALID_FILE_CONTENT", "Zawartość pliku nie pasuje do typu MIME");
	}

	return {
		buffer,
		metadata: {
			filename,
			mimeType,
			size: buffer.length,
		},
	};
}

/**
 * Parsuje multipart/form-data z requestu Express używając natywnego API Bun
 *
 * UWAGA: Wymaga aby Express nie używał body-parsera dla tego endpointa!
 */
export async function parseMultipartFormData(req: Request): Promise<ParsedFormData> {
	const contentType = req.headers["content-type"];

	if (!contentType?.includes("multipart/form-data")) {
		throw new AppError(
			400,
			"INVALID_CONTENT_TYPE",
			"Content-Type musi być multipart/form-data",
		);
	}

	try {
		// Express przekazuje surowy request z Node.js
		// Musimy stworzyć Web API Request z surowego Node.js request
		const webRequest = new Request(`http://localhost${req.url}`, {
			method: req.method,
			headers: req.headers as Record<string, string>,
			// oxlint-disable-next-line typescript/no-explicit-any -- Express req jest ReadableStream-compatible
			body: req as any,
			// oxlint-disable-next-line typescript/no-explicit-any -- Bun rozszerza Request API
			duplex: "half" as any,
		});

		// Użyj natywnego parsowania FormData
		const formData = await webRequest.formData();

		const fields: Record<string, string> = {};
		const files: Record<string, ParsedFile> = {};

		// Iteruj po wszystkich wpisach
		for (const [key, value] of formData.entries()) {
			if (value instanceof File) {
				// To jest plik
				const buffer = await value.arrayBuffer();

				files[key] = {
					file: value,
					buffer,
					metadata: {
						originalName: value.name,
						size: value.size,
						mimeType: value.type,
						uploadedAt: new Date().toISOString(),
					},
				};
			} else {
				// To jest zwykłe pole tekstowe
				if (typeof value !== "string") {
					throw new TypeError("Nieobsługiwany typ pola formularza");
				}
				fields[key] = value;
			}
		}

		return { fields, files };
	} catch (error) {
		console.error("[FILE] Failed to parse multipart/form-data:", error);
		throw new AppError(400, "PARSE_ERROR", "Nie udało się sparsować danych formularza");
	}
}

/**
 * Waliduje plik pod kątem rozmiaru i typu MIME
 */
export function validateFile(parsedFile: ParsedFile, fileType: FileType): void {
	const { size, mimeType } = parsedFile.metadata;

	// Sprawdź rozmiar
	const maxSize = MAX_FILE_SIZE[fileType];
	if (size > maxSize) {
		throw new AppError(
			400,
			"FILE_TOO_LARGE",
			`Plik jest za duży. Maksymalny rozmiar: ${(maxSize / 1024 / 1024).toFixed(0)}MB`,
		);
	}

	// Sprawdź typ MIME
	const allowedTypes = ALLOWED_MIME_TYPES[fileType];
	if (!allowedTypes.includes("*") && !allowedTypes.includes(mimeType)) {
		throw new AppError(
			400,
			"INVALID_FILE_TYPE",
			`Nieprawidłowy typ pliku. Dozwolone: ${allowedTypes.join(", ")}`,
		);
	}
}

/**
 * Generuje unikalną nazwę pliku dla MinIO
 */
export function generateStorageKey(
	incidentId: string,
	fileType: FileType,
	originalName: string,
): string {
	const timestamp = Date.now();
	const _extension = originalName.split(".").pop() || "bin";
	const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").substring(0, 50);

	return `incidents/${incidentId}/${fileType}_${timestamp}_${sanitizedName}`;
}

/**
 * Ekstrahuje rozszerzenie pliku
 */
export function getFileExtension(filename: string): string {
	return filename.split(".").pop()?.toLowerCase() || "";
}

/**
 * Sprawdza czy plik jest obrazem
 */
export function isImageFile(mimeType: string): boolean {
	return mimeType.startsWith("image/");
}
