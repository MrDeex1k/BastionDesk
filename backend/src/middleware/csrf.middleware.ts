import type { NextFunction, Request, Response } from "express";
import { sendErrorResponse } from "../lib/api-response";
import {
	CSRF_HEADER_NAME,
	CSRF_TOKEN_COOKIE,
	generateCsrfToken,
	getOrCreateAnonymousCsrfSeed,
	isAllowedOrigin,
	isCsrfSafeMethod,
	parseCookies,
	setCsrfTokenCookie,
	verifyCsrfToken,
} from "../lib/csrf";
import { getSessionFromRequest } from "./auth.middleware";

function getHeaderValue(value: string | string[] | undefined): string | null {
	if (Array.isArray(value)) {
		return value[0] ?? null;
	}

	return value ?? null;
}

function sendCsrfError(res: Response, code: string, message: string): Response {
	return sendErrorResponse(res, 403, code, message);
}

export async function issueCsrfToken(req: Request, res: Response): Promise<void> {
	const cookies = parseCookies(req.headers.cookie);
	const sessionData = await getSessionFromRequest(req);
	const subject = sessionData?.session?.id ?? getOrCreateAnonymousCsrfSeed(cookies, res);
	const token = generateCsrfToken(subject);

	setCsrfTokenCookie(res, token);

	res.json({
		success: true,
		data: {
			token,
		},
	});
}

export async function requireCsrf(req: Request, res: Response, next: NextFunction): Promise<void> {
	if (isCsrfSafeMethod(req.method)) {
		next();
		return;
	}

	if (!isAllowedOrigin(req.headers.origin)) {
		sendCsrfError(res, "CSRF_ORIGIN_INVALID", "Żądanie pochodzi z niedozwolonego origin");
		return;
	}

	const cookies = parseCookies(req.headers.cookie);
	const cookieToken = cookies[CSRF_TOKEN_COOKIE];
	const headerToken = getHeaderValue(req.headers[CSRF_HEADER_NAME]);

	if (!cookieToken || !headerToken) {
		sendCsrfError(res, "CSRF_TOKEN_MISSING", "Brakuje wymaganego tokenu CSRF");
		return;
	}

	if (cookieToken !== headerToken) {
		sendCsrfError(res, "CSRF_TOKEN_MISMATCH", "Token CSRF nie zgadza się z wartością cookie");
		return;
	}

	const sessionData = await getSessionFromRequest(req);
	const subject = sessionData?.session?.id ?? getOrCreateAnonymousCsrfSeed(cookies);

	if (!verifyCsrfToken(headerToken, subject)) {
		sendCsrfError(res, "CSRF_TOKEN_INVALID", "Token CSRF jest nieprawidłowy lub wygasł");
		return;
	}

	next();
}
