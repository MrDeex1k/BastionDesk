import { randomBytes } from "node:crypto";
import { auth } from "../lib/auth";
import { env } from "../lib/env";
import {
	CSRF_ANON_COOKIE,
	CSRF_TOKEN_COOKIE,
	CSRF_TOKEN_TTL_MS,
	generateCsrfToken,
	isAllowedOrigin,
	isCsrfSafeMethod,
	parseCookies,
	verifyCsrfToken,
} from "../lib/csrf";
import { failure } from "./application";

async function subject(request: Request): Promise<string | null> {
	return (
		(
			await auth.api.getSession({
				headers: request.headers,
				query: { disableCookieCache: true },
			})
		)?.session.id ?? null
	);
}
function cookie(name: string, value: string, seconds: number): string {
	return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function csrfResponse(request: Request): Promise<Response> {
	const cookies = parseCookies(request.headers.get("cookie") ?? undefined);
	const headers = new Headers();
	let identity = await subject(request);
	if (!identity) {
		identity = cookies[CSRF_ANON_COOKIE] ?? randomBytes(32).toString("base64url");
		headers.append("set-cookie", cookie(CSRF_ANON_COOKIE, identity, 604800));
	}
	const token = generateCsrfToken(identity);
	headers.append("set-cookie", cookie(CSRF_TOKEN_COOKIE, token, CSRF_TOKEN_TTL_MS / 1000));
	return Response.json({ success: true, data: { token } }, { headers });
}
export async function checkCsrf(request: Request): Promise<Response | null> {
	if (isCsrfSafeMethod(request.method)) return null;
	if (!isAllowedOrigin(request.headers.get("origin") ?? undefined))
		return failure(403, "CSRF_ORIGIN_INVALID");
	const cookies = parseCookies(request.headers.get("cookie") ?? undefined);
	const token = request.headers.get("x-csrf-token");
	if (!token || !cookies[CSRF_TOKEN_COOKIE]) return failure(403, "CSRF_TOKEN_MISSING");
	if (token !== cookies[CSRF_TOKEN_COOKIE]) return failure(403, "CSRF_TOKEN_MISMATCH");
	const identity = (await subject(request)) ?? cookies[CSRF_ANON_COOKIE];
	return identity && verifyCsrfToken(token, identity) ? null : failure(403, "CSRF_TOKEN_INVALID");
}
