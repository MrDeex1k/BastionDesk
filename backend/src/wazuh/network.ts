import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import { checkServerIdentity } from "node:tls";
import {
	assertWithinDeadline,
	parseIndexerOrigin,
	type SourceConnection,
	WazuhError,
	withinDeadline,
} from "./source";

const denied = new BlockList();
for (const [ip, bits] of [
	["0.0.0.0", 8],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const)
	denied.addSubnet(ip, bits);
for (const [ip, bits] of [
	["::", 96],
	["fe80::", 10],
	["ff00::", 8],
	["64:ff9b::", 96],
	["2002::", 16],
	["2001::", 32],
] as const)
	denied.addSubnet(ip, bits, "ipv6");
for (const ip of ["168.63.129.16", "100.100.100.200"]) denied.addAddress(ip);
denied.addAddress("fd00:ec2::254", "ipv6");

function normalizedHost(value: string) {
	return value
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "");
}

function protectedHosts(env: NodeJS.ProcessEnv) {
	const hosts = new Set(
		[
			"localhost",
			hostname(),
			"host.docker.internal",
			"gateway.docker.internal",
			"database",
			"pgbouncer",
			"backend",
			"auth-service",
			"postgres-backup",
			"frontend",
			"nginx",
			"storage-1",
			"storage-2",
			"storage-3",
			"storage-4",
			"llm_service",
			"rabbitmq",
			"otel-collector",
			env.PGBOUNCER_HOST,
			env.SMTP_HOST,
			env.LLM_GRPC_TARGET?.split(":")[0],
			...[
				"S3_ENDPOINT",
				"DATABASE_URL",
				"RABBITMQ_URL",
				"OTEL_EXPORTER_OTLP_ENDPOINT",
				"FRONTEND_URL",
			].map((key) => env[key] && URL.parse(env[key])?.hostname),
		]
			.filter((host) => Boolean(host))
			.map((host) => normalizedHost(host?.trim() ?? "")),
	);
	return hosts;
}

const lookupAll = (host: string) => lookup(host, { all: true });

export async function indexerAddress(url: URL, env = process.env, resolveHost = lookupAll) {
	const host = normalizedHost(url.hostname);
	const required = new Set(
		(env.WAZUH_PROTECTED_HOSTS ?? "")
			.split(",")
			.map((name) => normalizedHost(name.trim()))
			.filter(Boolean),
	);
	const protectedNames = protectedHosts(env);
	for (const name of required) protectedNames.add(name);
	if (protectedNames.has(host) || host.endsWith(".localhost"))
		throw new WazuhError("INVALID_ADDRESS");
	const addresses = new BlockList();
	for (const interfaces of Object.values(networkInterfaces())) {
		for (const { address, family } of interfaces ?? [])
			addresses.addAddress(address, family === "IPv4" ? "ipv4" : "ipv6");
	}
	const configured = await Promise.all(
		[...protectedNames].filter(Boolean).map(async (value) => {
			const resolved = await resolveHost(value).catch(() => []);
			if (resolved.length === 0 && required.has(value)) throw new WazuhError("NETWORK");
			return resolved;
		}),
	);
	for (const { address, family } of configured.flat())
		addresses.addAddress(address, family === 4 ? "ipv4" : "ipv6");
	let resolved: { address: string; family: number }[];
	try {
		resolved = await resolveHost(host);
	} catch {
		throw new WazuhError("NETWORK");
	}
	if (
		!resolved.length ||
		resolved.some(({ address, family }) => {
			const type = family === 4 ? "ipv4" : "ipv6";
			return denied.check(address, type) || addresses.check(address, type);
		})
	)
		throw new WazuhError("INVALID_ADDRESS");
	return resolved.find(({ family }) => family === 4)?.address ?? resolved[0]!.address;
}

export function indexerTransport(
	connection: SourceConnection,
	env = process.env,
	resolveAddress = indexerAddress,
) {
	const url = parseIndexerOrigin(connection.origin);
	const host = normalizedHost(url.hostname);
	// This optional identity is configured by the installation operator for one origin only.
	const name =
		env.WAZUH_INDEXER_TLS_ORIGIN === url.origin && env.WAZUH_INDEXER_TLS_NAME && connection.ca
			? env.WAZUH_INDEXER_TLS_NAME
			: host;
	const authorization =
		"Basic " + Buffer.from(connection.username + ":" + connection.password).toString("base64");
	return async (
		method: "POST" | "DELETE",
		path: string,
		data?: object,
		deadline = AbortSignal.timeout(10_000),
	): Promise<unknown> => {
		const address = await withinDeadline(deadline, () => resolveAddress(url, env));
		assertWithinDeadline(deadline);
		const body = data && JSON.stringify(data);
		return new Promise((resolve, reject) => {
			const req = request(
				{
					protocol: "https:",
					hostname: address,
					port: url.port || 443,
					servername: isIP(name) ? undefined : name,
					checkServerIdentity: (_, cert) => checkServerIdentity(name, cert),
					ca: connection.ca,
					rejectUnauthorized: true,
					agent: false,
					signal: deadline,
					method,
					path,
					headers: {
						host: url.host,
						authorization,
						accept: "application/json",
						...(body
							? {
									"content-type": "application/json",
									"content-length": Buffer.byteLength(body),
								}
							: {}),
					},
				},
				(res) => {
					const status = res.statusCode ?? 0;
					if (status < 200 || status >= 300) {
						res.destroy();
						reject(
							new WazuhError(
								status === 401
									? "AUTHENTICATION"
									: status === 403
										? "PERMISSION"
										: status === 404
											? "NOT_FOUND"
											: "UNAVAILABLE",
							),
						);
						return;
					}
					const chunks: Buffer[] = [];
					let bytes = 0;
					res.on("data", (part: Buffer) => {
						bytes += part.byteLength;
						if (bytes > 8 * 1024 * 1024) {
							res.destroy();
							reject(new WazuhError("UNAVAILABLE"));
						} else chunks.push(part);
					});
					const incomplete = () =>
						reject(new WazuhError(deadline.aborted ? "TIMEOUT" : "UNAVAILABLE"));
					res.on("error", incomplete);
					res.on("aborted", incomplete);
					res.on("end", () => {
						try {
							resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
						} catch {
							reject(new WazuhError("UNAVAILABLE"));
						}
					});
				},
			);
			req.on("error", (error: Error & { code?: string }) => {
				const tls =
					/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(
						error.code ?? "",
					) || /certificate|\bTLS\b|\bSSL\b/i.test(error.message);
				reject(new WazuhError(deadline.aborted ? "TIMEOUT" : tls ? "TLS" : "NETWORK"));
			});
			req.end(body);
		});
	};
}
