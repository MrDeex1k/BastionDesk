import { describe, expect, mock, test } from "bun:test";
import type { Request, Response } from "express";

let putObjectCalls = 0;
let lastStorageKey: string | null = null;

await mock.module("../../lib/env.js", () => ({ env: { S3_BUCKET: "baseline-test" } }));

await mock.module("../../lib/storage.js", () => ({
	getObjectBuffer: async () => null,
	presignObject: async () => "url",
	deleteObject: async () => {},
	putObject: async (key: string) => {
		putObjectCalls++;
		lastStorageKey = key;
	},
}));

const { coreFileHandler } = await import("../../adapters/core-file-http");
const row = {
	id: "00000000-0000-4000-8000-000000000001",
	analystId: "analyst-a",
	status: "Raport w trakcie",
	organizationId: "organization-a",
} as import("../../types").Incident;
const handler = coreFileHandler(
	{
		read: async () => ({
			subject: "analyst-a",
			organizationId: "organization-a",
			role: "analityk",
			sessionId: "s",
			sessionExpiresAt: Math.floor(Date.now() / 1000) + 60,
		}),
	},
	{ get: async () => row, list: async () => ({ incidents: [], total: 0 }) },
	{
		create: async () => {
			throw new Error("Unexpected create");
		},
		mutate: async (_identity, _id, _change, _mode, decide) => ({
			before: row,
			incident: { ...row, ...decide(row) },
		}),
	},
);

async function uploadReport(reportData: unknown, method = "POST") {
	return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
		let status = 200;
		const req = {
			method,
			path:
				method === "HEAD"
					? "/api/analyst/incidents/00000000-0000-4000-8000-000000000001/files/reports/report.pdf"
					: "/api/analyst/incidents/00000000-0000-4000-8000-000000000001/reports",
			headers: {},
			get: () => undefined,
			params: { id: "00000000-0000-4000-8000-000000000001" },
			body: { reportData },
			user: { id: "analyst-a" },
			organizationId: "organization-a",
			memberRole: "analityk",
		} as unknown as Request;
		const res = {
			status(code: number) {
				status = code;
				return this;
			},
			json(body: unknown) {
				resolve({ status, body });
				return this;
			},
		} as unknown as Response;

		try {
			void handler(req, res).catch(reject);
		} catch (error) {
			reject(error);
		}
	});
}

describe("analyst upload validation", () => {
	test("HEAD download follows read policy without uploading a document", async () => {
		putObjectCalls = 0;
		const result = await uploadReport(undefined, "HEAD");
		expect(result.status).toBe(404);
		expect(putObjectCalls).toBe(0);
	});
	test("INC-03-03 rejects invalid base64 before writing to storage", async () => {
		putObjectCalls = 0;

		const result = await uploadReport({
			filename: "report.pdf",
			data: "%%%not-base64%%%",
			mimeType: "application/pdf",
		});

		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			success: false,
			error: {
				code: "INVALID_FILE_DATA",
				message: "Dane pliku nie są poprawnym base64",
			},
		});
		expect(putObjectCalls).toBe(0);
	});

	test("INC-03-03 rejects a MIME type outside the document allowlist", async () => {
		putObjectCalls = 0;

		const result = await uploadReport({
			filename: "report.html",
			data: Buffer.from("<html></html>").toString("base64"),
			mimeType: "text/html",
		});

		expect(result.status).toBe(400);
		expect(result.body).toHaveProperty("error.code", "INVALID_FILE_TYPE");
		expect(putObjectCalls).toBe(0);
	});

	test("INC-03-01 stores a valid PDF under a server-generated key", async () => {
		putObjectCalls = 0;
		lastStorageKey = null;

		const result = await uploadReport({
			filename: "report.pdf",
			data: Buffer.from("%PDF-1.7\nfixture").toString("base64"),
			mimeType: "application/pdf",
		});

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("success", true);
		expect(putObjectCalls).toBe(1);
		expect(lastStorageKey).toMatch(
			/^incidents\/00000000-0000-4000-8000-000000000001\/report_[0-9]+_[0-9a-f-]{36}_report\.pdf$/,
		);
	});
});
