/** Public discovery response retained across the gateway cutover. */
export const apiInfo = {
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
} as const;
