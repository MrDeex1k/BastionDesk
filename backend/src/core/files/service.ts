import { Context, Effect, Layer } from "effect";
import { DomainError } from "../../contracts/errors";
import type { Incident } from "../../types";
import type { LiveIdentity } from "../../identity/contract";
import { getIncident } from "../incidents/reads";
import { IncidentRuleError } from "../incidents/commands";
import { findStoredFileMetadata, parseStoredFileMetadata } from "./metadata";

export interface FileStorage {
	read(key: string): Promise<Buffer | null>;
	presign(key: string): Promise<string>;
}
export class Storage extends Context.Service<Storage, FileStorage>()("files/Storage") {}
export const storageLayer = (port: FileStorage) => Layer.succeed(Storage, port);
export const fileColumns = {
	screenshots: ["userScreenshotPath", "userScreenshotMetadata"],
	attachments: ["userAttachmentPath", "userAttachmentMetadata"],
	reports: ["analystReportPath", "analystReportMetadata"],
	statements: ["analystStatementPath", "analystStatementMetadata"],
} as const;
export type StoredFileKind = keyof typeof fileColumns;
export function incidentFile(
	identity: LiveIdentity,
	id: string,
	kind: StoredFileKind,
	filename?: string,
	presign = false,
	strictFilename = true,
	authorize?: (file: ReturnType<typeof storedIncidentFile>) => Promise<void>,
) {
	return Effect.gen(function* () {
		const incident = yield* getIncident(identity, id);
		const file = yield* Effect.try({
			try: () => storedIncidentFile(incident, kind, filename, strictFilename),
			catch: (error) => error,
		});
		if (authorize)
			yield* Effect.tryPromise({
				try: () => authorize(file),
				catch: (error) => error,
			});
		const storage = yield* Storage;
		const content = yield* Effect.tryPromise({
			try: async () =>
				presign ? await storage.presign(file.key) : await storage.read(file.key),
			catch: () => new DomainError("SERVICE_UNAVAILABLE"),
		});
		if (!content)
			return yield* Effect.fail(
				new IncidentRuleError(
					"FILE_NOT_FOUND",
					"Plik nie jest dostępny w storage",
					"missing",
				),
			);
		return { content, metadata: file.metadata };
	});
}

export function storedIncidentFile(
	incident: Incident,
	kind: StoredFileKind,
	filename?: string,
	strictFilename = true,
) {
	const [pathColumn, metadataColumn] = fileColumns[kind];
	const parsed = parseStoredFileMetadata(incident[metadataColumn]);
	const metadata =
		filename && (strictFilename || Array.isArray(parsed))
			? findStoredFileMetadata(parsed, filename)
			: Array.isArray(parsed)
				? parsed[0]
				: parsed;
	const key = Array.isArray(parsed) ? metadata?.path : incident[pathColumn];
	if (!metadata || !key)
		throw new IncidentRuleError("FILE_NOT_FOUND", "Plik nie został znaleziony", "missing");
	return { key, metadata };
}
