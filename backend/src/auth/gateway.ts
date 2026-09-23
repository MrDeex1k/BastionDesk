import { issueCoreToken, coreRequestHeaders } from "../identity/auth-bridge";
import { authIssuer } from "../identity/network-config";
import { internalFetch } from "../identity/transport";
import { auth } from "./instance";
import { failure } from "./application";
import { checkCsrf } from "./csrf";
import { authIdentity } from "./state";

export function createGateway() {
	const origin = process.env.CORE_ORIGIN ?? "https://backend:3333";
	const transport = internalFetch("auth-service", origin);
	return async (request: Request): Promise<Response> => {
		const forbidden = await checkCsrf(request);
		if (forbidden) return forbidden;
		const identity = await authIdentity.forBrowser(request.headers, request.signal);
		if (!identity) return failure(401, "UNAUTHORIZED");
		const token = await issueCoreToken(
			authIssuer,
			identity,
			async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
		);
		const headers = coreRequestHeaders(token);
		for (const key of [
			"content-type",
			"accept",
			"idempotency-key",
			"x-correlation-id",
			"traceparent",
			"tracestate",
		]) {
			const value = request.headers.get(key);
			if (value) headers.set(key, value);
		}
		const ip = request.headers.get("x-real-ip");
		if (ip) headers.set("x-forwarded-for", ip);
		const url = new URL(request.url);
		const result = await transport(`${origin}${url.pathname}${url.search}`, {
			method: request.method,
			headers,
			body: ["GET", "HEAD"].includes(request.method)
				? undefined
				: await request.arrayBuffer(),
			signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]),
		});
		const responseHeaders = new Headers(result.headers);
		for (const key of [
			"set-cookie",
			"set-auth-jwt",
			"authorization",
			"connection",
			"transfer-encoding",
			"content-length",
			"content-encoding",
		])
			responseHeaders.delete(key);
		return new Response(result.body, { status: result.status, headers: responseHeaders });
	};
}
