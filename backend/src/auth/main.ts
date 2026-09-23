import { z } from "zod";
import { createGateway } from "./gateway";
import { internalIdentity } from "./internal";
import { authIssuer } from "../identity/network-config";
import { mtlsServer, serveInternal } from "../identity/transport";
import { csrfResponse } from "./csrf";
import { signup } from "./signup";
import { auth, authPool } from "./instance";
import { checkDatabaseConnection, closeDatabase } from "../lib/database";
import { env } from "../lib/env";
import { createAuthApplication } from "./application";

await authPool.query("SELECT id FROM jwks LIMIT 0");
await auth.api.getJwks();
const internal = mtlsServer("auth-service", serveInternal(internalIdentity, authIssuer));
internal.listen(Number(new URL(authIssuer).port || 443));
const app = createAuthApplication({
	origins: env.CORS_ORIGINS,
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(100000)
		.parse(process.env.AUTH_GATEWAY_RATE_LIMIT ?? 300),
	auth: (request) => auth.handler(request),
	health: checkDatabaseConnection,
	csrf: csrfResponse,
	signup,
	proxy: createGateway(),
}).listen({ port: Number(process.env.AUTH_PORT ?? 3340), maxRequestBodySize: 52_428_800 });

for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, async () => {
		await app.stop();
		internal.close();
		await closeDatabase();
		await authPool.end();
		process.exit(0);
	});
