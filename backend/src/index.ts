import { startTelemetry, httpTelemetry } from "./messaging/telemetry";
import { createServer } from "node:http";
import { mtlsServer } from "./identity/transport";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { checkDatabaseConnection, closeDatabase } from "./lib/database";
import { testEmailConnection } from "./lib/email";
import { env } from "./lib/env";
import { apiRateLimiter, errorHandler, notFoundHandler } from "./middleware";

const telemetry = startTelemetry("bastiondesk-backend");
const app = express();
app.use(httpTelemetry);

// Trust proxy - wymagane dla express-rate-limit z nginx
app.set("trust proxy", 1);

// Security Headers
app.use(
	helmet({
		// Wyłącz HSTS - aplikacja działa tylko na localhost bez HTTPS
		hsts: false,

		// Content Security Policy - dostosowany do aplikacji
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "https:"],
				connectSrc: ["'self'"],
				fontSrc: ["'self'"],
				objectSrc: ["'none'"],
				mediaSrc: ["'self'"],
				frameSrc: ["'none'"],
			},
		},

		// Zapobiega clickjacking
		frameguard: { action: "deny" },

		// Zapobiega MIME-type sniffing
		noSniff: true,

		// Włącza wbudowany filtr XSS przeglądarki
		xssFilter: true,

		// Kontroluje informacje wysyłane w Referer
		referrerPolicy: { policy: "strict-origin-when-cross-origin" },

		// Wyłącza nagłówek X-Powered-By (ukrywa Express)
		hidePoweredBy: true,
	}),
);

// CORS Configuration
app.use(
	cors({
		origin: env.CORS_ORIGINS,
		methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "QUERY", "OPTIONS"],
		credentials: true,
		allowedHeaders: [
			"Accept",
			"Authorization",
			"Content-Type",
			"X-CSRF-Token",
			"Idempotency-Key",
			"X-Correlation-Id",
		],
		maxAge: 600,
	}),
);

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Root route - przekierowanie do frontendu
app.get("/", (_req, res) => {
	res.redirect(302, env.FRONTEND_URL);
});

// Health Check (z weryfikacją bazy danych i email)
app.get("/health", async (_req, res) => {
	const dbConnected = await checkDatabaseConnection();
	const emailConnected = await testEmailConnection();

	const allHealthy = dbConnected && emailConnected;

	res.status(allHealthy ? 200 : 503).json({
		status: allHealthy ? "ok" : "degraded",
		timestamp: new Date().toISOString(),
		service: "bastiondesk-backend",
		checks: {
			database: dbConnected ? "connected" : "disconnected",
			email: emailConnected ? "connected" : "disconnected",
		},
	});
});

// Email Health Check
app.get("/api/email/health", async (_req, res) => {
	const emailConnected = await testEmailConnection();

	res.status(emailConnected ? 200 : 503).json({
		status: emailConnected ? "ok" : "error",
		smtp: {
			connected: emailConnected,
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
		},
		timestamp: new Date().toISOString(),
	});
});

// API Info
app.get("/api", (_req, res) => {
	res.json({
		message: "BastionDesk API",
		version: "1.0.3",
		endpoints: {
			auth: "/api/auth/*",
			incidents: "/api/incidents",
			analyst: "/api/analyst/*",
			admin: "/api/admin/*",
			health: "/health",
			emailHealth: "/api/email/health",
		},
	});
});

import apiRoutes from "./routes/index";

const { coreIncidentWrites } = await import("./adapters/core-incident-writes");
const { coreWriteRoutes, coreCommandHandler } = await import("./adapters/core-command-http");
const { coreFileRoutes, coreFileHandler } = await import("./adapters/core-file-http");
const { coreCreateHandler } = await import("./adapters/core-create-http");
const { coreAdminRoutes, coreAdminHandler } = await import("./adapters/core-admin-http");
const { executeAdminIncidentsQuery, readIncidentFilters, readIncidentSummary } =
	await import("./adapters/core-admin-reads");
const { coreIdentity } = await import("./adapters/core-identity");
const { coreIncidentReads } = await import("./adapters/core-incident-reads");
const { coreReadPaths, coreReadHandler } = await import("./adapters/core-http");
await (await import("./adapters/core-schema")).assertCoreSchema();
const core = await (
	await import("./core/application")
).createCoreApplication([
	...coreAdminRoutes.map((route) => ({
		...route,
		handle: coreAdminHandler(coreIdentity, {
			query: executeAdminIncidentsQuery,
			filters: readIncidentFilters,
			summary: readIncidentSummary,
		}),
	})),
	{ paths: coreReadPaths, handle: coreReadHandler(coreIdentity, coreIncidentReads) },
	...coreFileRoutes.map((route) => ({
		...route,
		handle: coreFileHandler(coreIdentity, coreIncidentReads, coreIncidentWrites),
	})),
	...coreWriteRoutes.map((route) => ({
		...route,
		handle: coreCommandHandler(coreIdentity, coreIncidentWrites),
	})),
	{
		method: "post",
		paths: ["/api/incidents"],
		handle: coreCreateHandler(coreIdentity, coreIncidentWrites),
	},
]);
app.get("/api/core/health", core.http);

for (const route of coreAdminRoutes) {
	if (route.method === "query") {
		if (!app.query) throw new Error("This runtime must support HTTP QUERY");
		app.query(route.paths, apiRateLimiter, core.http);
	} else app.get(route.paths, apiRateLimiter, core.http);
}
app.get(coreReadPaths, apiRateLimiter, core.http);

for (const route of coreFileRoutes) app.route(route.paths)[route.method](apiRateLimiter, core.http);
for (const route of coreWriteRoutes)
	app.route(route.paths)[route.method](apiRateLimiter, core.http);
app.post("/api/incidents", apiRateLimiter, core.http);

// Rate Limiting dla własnych endpointów (zgodnie z Better-Auth: 100 req/10s)
app.use("/api/admin", apiRateLimiter);
app.use("/api/analyst", apiRateLimiter);
const { requireAuth, requireRole } = await import("./middleware/auth.middleware");
const { rejectUnsupportedQueryMethod } = await import("./routes/admin/query-schemas");
app.all(
	"/api/admin/incidents",
	apiRateLimiter,
	requireAuth,
	requireRole(["admin"]),
	rejectUnsupportedQueryMethod("GET, HEAD, QUERY, OPTIONS"),
);
app.use("/api", apiRoutes); // Podłącza /api/admin/* i /api/analyst/*

app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
const server = mtlsServer("backend", app).listen(env.PORT, () => {
	console.log(`Core listening with mTLS on ${env.PORT}`);
});

const healthServer = createServer((_req, res) => {
	void checkDatabaseConnection()
		.then((healthy) => {
			res.writeHead(healthy ? 200 : 503).end();
		})
		.catch(() => res.writeHead(503).end());
}).listen(3335, "127.0.0.1");

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
	console.log(`\n${signal} received, shutting down gracefully...`);

	healthServer.close();
	server.close(async () => {
		console.log("HTTP server closed");

		try {
			await core.close();
			await closeDatabase();
			await telemetry.shutdown();
			console.log("Database connections closed");
		} catch (error) {
			console.error("Error closing database:", error);
		}

		process.exit(0);
	});

	// Force exit po 10 sekundach
	setTimeout(() => {
		console.error("Forced shutdown after timeout");
		process.exit(1);
	}, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
