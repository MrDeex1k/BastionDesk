import type { Response } from "express";
import { errorResponse } from "../contracts/errors";

export function sendErrorResponse(
	res: Response,
	statusCode: number,
	code: string,
	message: string,
	details?: unknown,
): Response {
	return res.status(statusCode).json(errorResponse(code, message, details));
}
