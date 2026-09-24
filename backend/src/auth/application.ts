import { APIError } from "better-auth/api";
import { apiInfo } from "../contracts/api-info";
import { Elysia } from "elysia";

export type AuthGatewayPorts = {
	origins: readonly string[];
	auth(request: Request): Promise<Response>;
	csrf(request: Request): Promise<Response>;
	signup(request: Request): Promise<Response>;
	proxy(request: Request): Promise<Response>;
	health(): Promise<boolean>;
	limit?: number;
};

/** Public surface only; internal identity resolution is never mounted here. */
export function createAuthApplication(ports: AuthGatewayPorts) {
	const buckets = new Map<string, { count: number; until: number }>();
	return new Elysia().all("*", { parse: "none" }, async ({ request }) => {
		const path = new URL(request.url).pathname;
		const origin = request.headers.get("origin");
		let response: Response;
		if (path === "/health") {
			const healthy = await ports.health();
			return Response.json(
				{ status: healthy ? "ok" : "degraded" },
				{ status: healthy ? 200 : 503 },
			);
		}
		if (origin && !ports.origins.includes(origin)) return failure(403, "CSRF_ORIGIN_INVALID");
		const emailNavigation =
			request.method === "GET" &&
			request.headers.get("sec-fetch-mode") === "navigate" &&
			(path === "/api/auth/verify-email" || path.startsWith("/api/auth/reset-password/"));
		if (!emailNavigation && request.headers.get("sec-fetch-site") === "cross-site")
			return failure(403, "FORBIDDEN");
		const now = Date.now();
		for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
		// Nginx overwrites X-Real-IP; this port is never published to the host.
		const key = request.headers.get("x-real-ip") ?? "direct";
		let bucket = buckets.get(key);
		if (!bucket) {
			if (buckets.size >= 10_000) return failure(429, "RATE_LIMITED");
			bucket = { count: 0, until: now + 60_000 };
			buckets.set(key, bucket);
		}
		if (++bucket.count > (ports.limit ?? 300)) return failure(429, "RATE_LIMITED");
		try {
			if (request.method === "OPTIONS") response = new Response(null, { status: 204 });
			else if (path === "/api" && ["GET", "HEAD"].includes(request.method))
				response = Response.json(apiInfo);
			else if (path === "/api/csrf" && request.method === "GET")
				response = await ports.csrf(request);
			else if (
				path === "/api/auth/sign-up-with-organization/email" &&
				request.method === "POST"
			)
				response = await ports.signup(request);
			else if (path.startsWith("/api/auth/")) response = await ports.auth(request);
			else if (path === "/api" || path.startsWith("/api/"))
				response = await ports.proxy(request);
			else response = failure(404, "NOT_FOUND");
		} catch (error) {
			response =
				error instanceof APIError
					? Response.json(error.body ?? { success: false }, { status: error.statusCode })
					: failure(503, "SERVICE_UNAVAILABLE");
		}
		const headers = new Headers(response.headers);
		headers.set("cache-control", "no-store");
		headers.set("x-content-type-options", "nosniff");
		headers.set("x-frame-options", "DENY");
		headers.set("referrer-policy", "strict-origin-when-cross-origin");
		if (origin) {
			headers.set("access-control-allow-origin", origin);
			headers.set("access-control-allow-credentials", "true");
			headers.append("vary", "Origin");
		}
		if (request.method === "OPTIONS") {
			headers.set(
				"access-control-allow-methods",
				"GET, HEAD, POST, PUT, PATCH, DELETE, QUERY, OPTIONS",
			);
			headers.set(
				"access-control-allow-headers",
				"Content-Type, X-CSRF-Token, Idempotency-Key, X-Correlation-Id",
			);
		}
		return new Response(response.body, { status: response.status, headers });
	});
}

export function failure(status: number, code: string): Response {
	return Response.json(
		{ success: false, error: { code, message: code } },
		{ status, headers: { "cache-control": "no-store" } },
	);
}
