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
	attachment: [
		"image/png",
		"image/jpeg",
		"image/jpg",
		"image/webp",
		"application/pdf",
		"application/zip",
		"text/plain",
		"text/csv",
	],
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

/**
 * Parsuje multipart/form-data z requestu Express używając natywnego API Bun
 *
 * UWAGA: Wymaga aby Express nie używał body-parsera dla tego endpointa!
 */
export async function parseMultipartFormData(
	req: Request,
): Promise<ParsedFormData> {
	const contentType = req.headers["content-type"];

	if (!contentType || !contentType.includes("multipart/form-data")) {
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
		// biome-ignore lint/suspicious/noExplicitAny: Express req jest ReadableStream-compatible
		body: req as any,
		// biome-ignore lint/suspicious/noExplicitAny: Bun rozszerza Request API
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
				fields[key] = String(value);
			}
		}

		return { fields, files };
	} catch (error) {
		console.error("[FILE] Failed to parse multipart/form-data:", error);
		throw new AppError(
			400,
			"PARSE_ERROR",
			"Nie udało się sparsować danych formularza",
		);
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
	if (!allowedTypes.includes(mimeType)) {
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
	const sanitizedName = originalName
		.replace(/[^a-zA-Z0-9.-]/g, "_")
		.substring(0, 50);

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
