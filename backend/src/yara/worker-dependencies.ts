import { readFileSync } from "node:fs";
import { S3Client } from "bun";
import { Pool } from "pg";
import { z } from "zod";
import { runtimeConnectionString } from "../lib/database-config";

const config = z.object({
	DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
	DB_TLS_CA_PATH: z.string().min(1),
	DB_TLS_CERT_PATH: z.string().min(1),
	DB_TLS_KEY_PATH: z.string().min(1),
	YARA_S3_ENDPOINT: z.url(),
	YARA_S3_BUCKET: z.string().min(1),
	YARA_S3_ACCESS_KEY: z.string().min(1),
	YARA_S3_SECRET_KEY: z.string().min(16),
});
const maxObjectSize = 50 * 1024 * 1024;

export function workerDependencies(environment: Record<string, string | undefined>) {
	const settings = config.parse(environment);
	const pool = new Pool({
		connectionString: runtimeConnectionString(settings.DATABASE_URL),
		ssl: {
			rejectUnauthorized: true,
			ca: readFileSync(settings.DB_TLS_CA_PATH, "utf8"),
			cert: readFileSync(settings.DB_TLS_CERT_PATH, "utf8"),
			key: readFileSync(settings.DB_TLS_KEY_PATH, "utf8"),
		},
		max: 4,
		connectionTimeoutMillis: 2000,
		query_timeout: 10_000,
	});
	pool.on("error", () => console.error("[YARA] Idle database connection interrupted"));
	const storage = new S3Client({
		endpoint: settings.YARA_S3_ENDPOINT,
		bucket: settings.YARA_S3_BUCKET,
		accessKeyId: settings.YARA_S3_ACCESS_KEY,
		secretAccessKey: settings.YARA_S3_SECRET_KEY,
	});
	return {
		pool,
		fileStore: {
			async read(key: string) {
				const object = storage.file(key);
				const { size } = await object.stat();
				if (size > maxObjectSize) throw new Error("YARA_ATTACHMENT_TOO_LARGE");
				return Buffer.from(await object.arrayBuffer());
			},
		},
	};
}
