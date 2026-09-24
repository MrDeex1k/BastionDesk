import { env } from "../lib/env";
function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required in auth-service`);
	if (env.NODE_ENV === "production" && (value.length < 32 || value.includes("dev-secret")))
		throw new Error(`${name} must be a production secret`);
	return value;
}
export const authSecret = required("BETTER_AUTH_SECRET");
export const csrfSecret = required("CSRF_SECRET");
