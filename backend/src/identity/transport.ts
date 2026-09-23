import { createServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { identityTls } from "./network-config";

export function fromNodeHeaders(input: IncomingMessage["headers"]): Headers {
	const headers = new Headers();
	for (const [key, value] of Object.entries(input)) {
		if (Array.isArray(value)) for (const item of value) headers.append(key, item);
		else if (value !== undefined) headers.set(key, value);
	}
	return headers;
}

export function mtlsServer(
	owner: "auth-service" | "backend",
	handle: (req: IncomingMessage, res: ServerResponse) => void,
) {
	return createServer({ ...identityTls(owner), requestCert: true }, (req, res) => {
		const socket = req.socket as TLSSocket;
		// Each direction trusts only the explicitly pinned peer certificate.
		if (!socket.authorized) {
			res.writeHead(403).end();
			return;
		}
		handle(req, res);
	});
}

/** Fixed HTTPS destination, no redirects, and a caller-provided bounded deadline. */
export function internalFetch(owner: "auth-service" | "backend", origin: string) {
	const target = new URL(origin);
	if (
		target.protocol !== "https:" ||
		target.username ||
		target.password ||
		target.pathname !== "/" ||
		target.search ||
		target.hash
	)
		throw new Error("INVALID_INTERNAL_ORIGIN");
	const tls = identityTls(owner);
	return (url: string | URL, init: RequestInit = {}) => {
		if (new URL(url).origin !== target.origin) throw new Error("INVALID_INTERNAL_DESTINATION");
		return fetch(url, {
			...init,
			redirect: "manual",
			tls,
			signal: init.signal ?? AbortSignal.timeout(2000),
		});
	};
}

export function serveInternal(handle: (request: Request) => Promise<Response>, origin: string) {
	return (req: IncomingMessage, res: ServerResponse): void => {
		void (async () => {
			// Internal protocol is GET-only; no browser-controlled bodies are accepted.
			if (req.method !== "GET") {
				res.writeHead(405).end();
				return;
			}
			const request = new Request(new URL(req.url ?? "/", origin).href, {
				headers: fromNodeHeaders(req.headers),
			});
			const result = await handle(request);
			res.writeHead(result.status, Object.fromEntries(result.headers));
			res.end(Buffer.from(await result.arrayBuffer()));
		})().catch(() => {
			if (!res.headersSent) res.writeHead(503);
			res.end();
		});
	};
}
