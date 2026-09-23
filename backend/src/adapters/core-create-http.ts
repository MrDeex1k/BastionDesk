import type { Request, Response } from "express";
import { Effect } from "effect";
import { fromNodeHeaders } from "better-auth/node";
import {
	createIncident,
	writesLayer,
	type IncidentWrites,
	type NewIncident,
} from "../core/incidents/commands";
import { currentIdentity, identityLayer, type IdentityReader } from "../core/identity";
import { runCore } from "../core/runtime";
import { createIncidentSchema } from "../utils/validation";
import { parseMultipartFormData, validateFile, generateStorageKey } from "../utils/file.helper";
import { putObject } from "../lib/storage";
import { classifyIncident } from "../lib/llm-client";
import { query } from "../lib/database";
import { errorHandler } from "../middleware/error.middleware";

export function coreCreateHandler(identity: IdentityReader, writes: IncidentWrites) {
	return async (req: Request, res: Response) => {
		try {
			const live = await runCore(
				currentIdentity(fromNodeHeaders(req.headers)).pipe(
					Effect.provide(identityLayer(identity)),
				),
			);
			const { fields, files } = await parseMultipartFormData(req);
			const { userDescription } = createIncidentSchema.parse(fields);
			const input: NewIncident = {
				id: crypto.randomUUID(),
				userDescription,
				userScreenshotPath: null,
				userScreenshotMetadata: {},
				userAttachmentPath: null,
				userAttachmentMetadata: {},
			};
			for (const type of ["screenshot", "attachment"] as const)
				if (files[type]) validateFile(files[type], type);
			for (const type of ["screenshot", "attachment"] as const) {
				const file = files[type];
				if (!file) continue;
				const key = generateStorageKey(input.id, type, file.metadata.originalName);
				await putObject(key, Buffer.from(file.buffer), {
					contentType: file.metadata.mimeType,
				});
				if (type === "screenshot") {
					input.userScreenshotPath = key;
					input.userScreenshotMetadata = { ...file.metadata };
				} else {
					input.userAttachmentPath = key;
					input.userAttachmentMetadata = { ...file.metadata };
				}
			}
			const incident = await runCore(
				createIncident(live, input).pipe(Effect.provide(writesLayer(writes))),
			);
			res.status(201).json({ success: true, data: incident });
			// Compatibility with legacy best-effort classification; durable delivery is phase 4.
			void classifyIncident(incident.id, userDescription)
				.then((category) =>
					query(
						'UPDATE incidents SET "llmCategory" = $1 WHERE id = $2 AND "organizationId" = $3',
						[category, incident.id, live.organizationId],
					),
				)
				.catch(() => console.error("[CORE] Classification unavailable"));
		} catch (error) {
			// A lost COMMIT acknowledgement is ambiguous: never delete potentially referenced files.
			return errorHandler(error as Error, req, res, () => {});
		}
	};
}
