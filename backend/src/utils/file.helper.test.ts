import { describe, expect, test } from "bun:test";
import { AppError } from "../middleware/error.middleware.js";
import { parseBase64FileUpload } from "./file.helper.js";

function pdfData(content = "%PDF-1.7\nfixture") {
	return Buffer.from(content).toString("base64");
}

function expectAppError(action: () => unknown, code: string) {
	try {
		action();
		throw new Error("Expected AppError");
	} catch (error) {
		expect(error).toBeInstanceOf(AppError);
		expect((error as AppError).code).toBe(code);
	}
}

describe("base64 analyst file validation", () => {
	test("accepts a PDF with a matching extension, MIME and signature", () => {
		const result = parseBase64FileUpload(
			{ filename: "report.pdf", data: pdfData(), mimeType: "application/pdf" },
			"report",
		);

		expect(result.metadata).toEqual({
			filename: "report.pdf",
			mimeType: "application/pdf",
			size: 16,
		});
		expect(result.buffer.toString()).toBe("%PDF-1.7\nfixture");
	});

	test("rejects malformed base64", () => {
		expectAppError(
			() =>
				parseBase64FileUpload(
					{
						filename: "report.pdf",
						data: "%%%not-base64%%%",
						mimeType: "application/pdf",
					},
					"report",
				),
			"INVALID_FILE_DATA",
		);
	});

	test("rejects an unsupported MIME type", () => {
		expectAppError(
			() =>
				parseBase64FileUpload(
					{ filename: "report.html", data: pdfData(), mimeType: "text/html" },
					"report",
				),
			"INVALID_FILE_TYPE",
		);
	});

	test("rejects an extension that does not match the MIME type", () => {
		expectAppError(
			() =>
				parseBase64FileUpload(
					{ filename: "report.docx", data: pdfData(), mimeType: "application/pdf" },
					"report",
				),
			"INVALID_FILE_TYPE",
		);
	});

	test("rejects path components and control characters in filenames", () => {
		for (const filename of ["../report.pdf", "folder/report.pdf", "report\n.pdf"]) {
			expectAppError(
				() =>
					parseBase64FileUpload(
						{ filename, data: pdfData(), mimeType: "application/pdf" },
						"report",
					),
				"INVALID_FILENAME",
			);
		}
	});

	test("rejects content whose signature does not match the declared MIME", () => {
		expectAppError(
			() =>
				parseBase64FileUpload(
					{
						filename: "report.pdf",
						data: Buffer.from("plain text").toString("base64"),
						mimeType: "application/pdf",
					},
					"report",
				),
			"INVALID_FILE_CONTENT",
		);
	});
});
