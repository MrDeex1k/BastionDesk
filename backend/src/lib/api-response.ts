import type { Response } from "express";

export function sendErrorResponse(
	res: Response,
	statusCode: number,
	code: string,
	message: string,
	details?: unknown,
): Response {
	return res.status(statusCode).json({
		success: false,
		error: {
			code,
			message,
			...(details !== undefined ? { details } : {}),
		},
	});
}
