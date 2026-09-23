import { auth } from "../lib/auth";
import { checkDatabaseConnection, closeDatabase } from "../lib/database";
import { env } from "../lib/env";
import { createAuthApplication, failure } from "./application";

// Parallel deployment: gateway traffic is switched only after identity integration.
const app = createAuthApplication({
	origins: env.CORS_ORIGINS,
	auth: (request) => auth.handler(request),
	health: checkDatabaseConnection,
	csrf: async () => failure(503, "GATEWAY_NOT_READY"),
	signup: async () => failure(503, "GATEWAY_NOT_READY"),
	proxy: async () => failure(503, "GATEWAY_NOT_READY"),
}).listen({ port: Number(process.env.AUTH_PORT ?? 3340), maxRequestBodySize: 52_428_800 });

for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, async () => {
		await app.stop();
		await closeDatabase();
		process.exit(0);
	});
