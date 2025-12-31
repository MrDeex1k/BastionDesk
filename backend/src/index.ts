/**
 * BastionDesk Backend
 *
 * Serwer Express z Better-Auth dla autoryzacji i autentykacji
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { env } from "./lib/env";
import { closeDatabase, checkDatabaseConnection } from "./lib/database";
import { errorHandler, notFoundHandler, apiRateLimiter } from "./middleware";

const app = express();


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
		origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
		methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		credentials: true,
		allowedHeaders: ["Content-Type", "Authorization"],
	}),
);


// Better-Auth Handler
app.all("/api/auth/*splat", toNodeHandler(auth));


// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));


// Health Check (z weryfikacją bazy danych)
app.get("/health", async (_req, res) => {
	const dbConnected = await checkDatabaseConnection();

	res.status(dbConnected ? 200 : 503).json({
		status: dbConnected ? "ok" : "degraded",
		timestamp: new Date().toISOString(),
		service: "bastiondesk-backend",
		checks: {
			database: dbConnected ? "connected" : "disconnected",
		},
	});
});


// API Info
app.get("/api", (_req, res) => {
	res.json({
		message: "BastionDesk API",
		version: "0.9.0",
		endpoints: {
			auth: "/api/auth/*",
			incidents: "/api/incidents",
			analyst: "/api/analyst/*",
			admin: "/api/admin/*",
			health: "/health",
		},
	});
});


import incidentsRouter from "./routes/incidents";
import apiRoutes from "./routes/index";

// Rate Limiting dla własnych endpointów (zgodnie z Better-Auth: 100 req/10s)
app.use("/api/incidents", apiRateLimiter, incidentsRouter);
app.use("/api/admin", apiRateLimiter);
app.use("/api/analyst", apiRateLimiter);
app.use("/api", apiRoutes); // Podłącza /api/admin/* i /api/analyst/*


app.use(notFoundHandler);
app.use(errorHandler);


// Start Server
const server = app.listen(env.PORT, () => {
	console.log(`
	Server running on port ${env.PORT.toString().padEnd(32)}
	Environment: ${env.NODE_ENV.padEnd(42)}
	Auth URL: ${env.BETTER_AUTH_URL.padEnd(45)}
	
	Available endpoints:
	/api/auth/* - Better-Auth endpoints
	/api/incidents - Incidents API
	/health - Health check
  `);
});


// Graceful Shutdown
async function gracefulShutdown(signal: string) {
	console.log(`\n${signal} received, shutting down gracefully...`);

	server.close(async () => {
		console.log("HTTP server closed");

		try {
			await closeDatabase();
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