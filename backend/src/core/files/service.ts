import { Context, Effect, Layer } from "effect";
import { DomainError } from "../../contracts/errors";
import type { LiveIdentity } from "../../identity/contract";
import { getIncident } from "../incidents/reads";
import { IncidentRuleError } from "../incidents/commands";
import { findStoredFileMetadata, parseStoredFileMetadata } from "./metadata";

export interface FileStorage {
	read(key: string): Promise<Buffer | null>;
	presign(key: string): Promise<string>;
}
export class Storage extends Context.Tag("files/Storage")<Storage, FileStorage>() {}
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
) {
	return Effect.gen(function* () {
		const incident = yield* getIncident(identity, id);
		const [pathColumn, metadataColumn] = fileColumns[kind];
		const metadata = parseStoredFileMetadata(incident[metadataColumn]);
		const file =
			filename && (strictFilename || Array.isArray(metadata))
				? findStoredFileMetadata(metadata, filename)
				: Array.isArray(metadata)
					? metadata[0]
					: metadata;
		const key = Array.isArray(metadata) ? file?.path : incident[pathColumn];
		if (!file || !key)
			return yield* Effect.fail(
				new IncidentRuleError("FILE_NOT_FOUND", "Plik nie został znaleziony", "missing"),
			);
		const storage = yield* Storage;
		const content = yield* Effect.tryPromise({
			try: async () => (presign ? await storage.presign(key) : await storage.read(key)),
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
		return { content, metadata: file };
	});
}
