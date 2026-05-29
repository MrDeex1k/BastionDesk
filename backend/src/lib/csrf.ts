import crypto from "node:crypto";
import type { Response } from "express";
import { env } from "./env";

export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_TOKEN_COOKIE = "bd_csrf";
export const CSRF_ANON_COOKIE = "bd_csrf_seed";
export const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function parseCookies(
	cookieHeader: string | string[] | undefined,
): Record<string, string> {
	const rawHeader = Array.isArray(cookieHeader)
		? cookieHeader.join(";")
		: cookieHeader;

	if (!rawHeader) {
		return {};
	}

	return rawHeader
		.split(";")
		.reduce<Record<string, string>>((cookies, chunk) => {
			const [name, ...valueParts] = chunk.trim().split("=");
			if (!name || valueParts.length === 0) {
				return cookies;
			}

			const value = valueParts.join("=");
			cookies[name] = decodeURIComponent(value);
			return cookies;
		}, {});
}

export function isCsrfSafeMethod(method: string): boolean {
	return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function getAllowedOrigins(): string[] {
	return env.CORS_ORIGINS;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
	if (!origin) {
		return false;
	}

	return getAllowedOrigins().includes(origin);
}

export function getOrCreateAnonymousCsrfSeed(
	cookies: Record<string, string>,
	res?: Response,
): string {
	const existingSeed = cookies[CSRF_ANON_COOKIE];
	if (existingSeed) {
		return existingSeed;
	}

	const nextSeed = crypto.randomBytes(32).toString("base64url");
	if (res) {
		res.cookie(CSRF_ANON_COOKIE, nextSeed, {
			httpOnly: true,
			sameSite: "strict",
			secure: env.NODE_ENV === "production",
			path: "/",
			maxAge: COOKIE_MAX_AGE_MS,
		});
	}

	return nextSeed;
}

export function generateCsrfToken(subject: string): string {
	const nonce = crypto.randomBytes(32).toString("base64url");
	const expiresAt = Date.now() + CSRF_TOKEN_TTL_MS;
	const signature = signCsrfPayload(subject, nonce, expiresAt.toString());

	return `${nonce}.${expiresAt.toString()}.${signature}`;
}

export function setCsrfTokenCookie(res: Response, token: string): void {
	res.cookie(CSRF_TOKEN_COOKIE, token, {
		httpOnly: true,
		sameSite: "strict",
		secure: env.NODE_ENV === "production",
		path: "/",
		maxAge: CSRF_TOKEN_TTL_MS,
	});
}

export function verifyCsrfToken(token: string, subject: string): boolean {
	const [nonce, expiresAt, signature] = token.split(".");
	if (!nonce || !expiresAt || !signature) {
		return false;
	}

	const expiresAtMs = Number.parseInt(expiresAt, 10);
	if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
		return false;
	}

	const expectedSignature = signCsrfPayload(subject, nonce, expiresAt);
	return safeCompare(signature, expectedSignature);
}

function signCsrfPayload(
	subject: string,
	nonce: string,
	expiresAt: string,
): string {
	return crypto
		.createHmac("sha256", env.CSRF_SECRET)
		.update(`${subject}:${nonce}:${expiresAt}`)
		.digest("base64url");
}

function safeCompare(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left, "utf8");
	const rightBuffer = Buffer.from(right, "utf8");

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
