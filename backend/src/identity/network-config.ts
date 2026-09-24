import { readFileSync } from "node:fs";
import { validateIssuer } from "./contract";

export const authIssuer = validateIssuer(
	process.env.AUTH_ISSUER ?? "https://auth-service:3443/api/auth",
);
export function identityTls(owner: "auth-service" | "backend") {
	const peer = owner === "backend" ? "auth-service" : "backend";
	return {
		ca: readFileSync(
			process.env.IDENTITY_TLS_PEER_CERT_PATH ?? `/certs/identity/trust/${peer}.crt`,
			"utf8",
		),
		cert: readFileSync(
			process.env.IDENTITY_TLS_CERT_PATH ?? `/certs/identity/${owner}/client.crt`,
			"utf8",
		),
		key: readFileSync(
			process.env.IDENTITY_TLS_KEY_PATH ?? `/certs/identity/${owner}/client.key`,
			"utf8",
		),
		rejectUnauthorized: true,
	};
}
