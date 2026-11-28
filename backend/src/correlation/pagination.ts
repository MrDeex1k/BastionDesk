import { z } from "zod";

const queueCursorSchema = z.tuple([z.number().int().min(-1).max(100), z.iso.datetime(), z.uuid()]);
export type QueueCursor = z.infer<typeof queueCursorSchema>;

export function encodeQueueCursor(cursor: QueueCursor) {
	return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeQueueCursor(value: string): QueueCursor | undefined {
	try {
		return queueCursorSchema.parse(
			JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
		);
	} catch {
		return undefined;
	}
}

export function page<T>(rows: T[], size: number, cursor: (row: T) => string) {
	const items = rows.slice(0, size);
	const last = items.at(-1);
	return { items, nextCursor: rows.length > size && last ? cursor(last) : null };
}

export const historyPageSize = 25;
