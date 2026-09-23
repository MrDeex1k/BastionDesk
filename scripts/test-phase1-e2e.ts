import { mkdir, chmod, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:net";

const root = resolve(import.meta.dir, "..");
const runId = `${Date.now()}-${process.pid}`;
const project = `bastiondesk-e2e-${runId}`;
const directory = join(root, "artifacts", "phase1", runId);
await mkdir(directory, { recursive: true, mode: 0o700 });
const envFile = join(directory, "test.env");
const configFile = join(directory, "compose.json");
const tlsDirectory = join(directory, "tls");

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return address.port;
}
const port = await freePort();
const mailPort = await freePort();
const baseUrl = `http://localhost:${port}`;
const env = Object.fromEntries(
  (await Bun.file(join(root, ".env.example")).text())
    .split("\n")
    .filter((line) => /^[A-Z][A-Z_0-9]*=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
Object.assign(env, {
  NODE_ENV: "development",
  FRONTEND_URL: baseUrl,
  BETTER_AUTH_URL: baseUrl,
  BETTER_AUTH_TRUSTED_ORIGINS: baseUrl,
  WEBAUTHN_ORIGIN: baseUrl,
  CORS_ORIGIN: baseUrl,
  POSTGRES_PASSWORD: crypto.randomUUID(),
  BETTER_AUTH_SECRET: crypto.randomUUID(),
  CSRF_SECRET: crypto.randomUUID(),
  MINIO_ROOT_PASSWORD: crypto.randomUUID(),
  AUTH_PASSWORD_BREACH_CHECK_ENABLED: "false",
  SMTP_HOST: "smtp-test",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_USER: "phase1",
  SMTP_APP_PASSWORD: "phase1",
  EMAIL_FROM_ADDRESS: "phase1@bastiondesk.invalid",
  EMAIL_FROM_NAME: "BastionDesk E2E",
});
env.S3_SECRET_KEY = env.MINIO_ROOT_PASSWORD;
env.MIGRATION_DATABASE_URL = `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@database:5432/${env.POSTGRES_DB}`;
env.MIGRATION_TLS_CA = "/certs/ca/ca.crt";
env.MIGRATION_TLS_CERT = "/certs/migrator/client.crt";
env.MIGRATION_TLS_KEY = "/certs/migrator/client.key";
env.DATABASE_URL = `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@pgbouncer:6432/${env.POSTGRES_DB}`;
await Bun.write(
  envFile,
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
);
await chmod(envFile, 0o600);
const childEnv = { ...process.env, ...env, COMPOSE_PROJECT_NAME: project };

async function command(args: string[], extraEnv: Record<string, string> = {}, capture = false) {
  const child = Bun.spawn(args, {
    cwd: root,
    env: { ...childEnv, ...extraEnv },
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
  });
  const output = capture ? await new Response(child.stdout).text() : "";
  const code = await child.exited;
  if (code) throw new Error(`${args[0]} ${args[1]} failed (exit ${code})`);
  return output;
}
const compose = (args: string[], capture = false) =>
  command(
    [
      "docker",
      "compose",
      "--project-name",
      project,
      "--env-file",
      envFile,
      "-f",
      configFile,
      ...args,
    ],
    {},
    capture,
  );
let started = false;
let stopping: Promise<void> | undefined;
function stop() {
  return (stopping ??= (async () => {
    try {
      if (started) await compose(["down", "--volumes", "--remove-orphans"]);
    } finally {
      await Promise.all(
        [envFile, configFile, tlsDirectory].map((path) =>
          rm(path, { recursive: true, force: true }),
        ),
      );
    }
  })());
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void stop().finally(() => process.exit(130));
  });

try {
  await command(["sh", join(root, "infra/tls/generate-dev-certs.sh")], {
    TLS_OUT_DIR: tlsDirectory,
  });
  await rm(join(tlsDirectory, "ca", "ca.key"));
  const config = Bun.YAML.parse(await Bun.file(join(root, "docker-compose.yml")).text()) as any;
  delete config.services["postgres-backup"];
  delete config.volumes["postgres-backup-state"];
  delete config.volumes["huggingface-model-cache"];
  const smtp = (
    Bun.YAML.parse(await Bun.file(join(root, "docker-compose.phase0.yml")).text()) as any
  ).services["smtp-test"];
  smtp.ports = [`127.0.0.1:${mailPort}:8025`];
  smtp.environment.MP_MAX_MESSAGES = 1000;
  config.services["smtp-test"] = smtp;
  config.services.llm_service = {
    build: { context: root, dockerfile: "backend/Dockerfile" },
    command: ["bun", "/app/backend/phase1-llm.ts"],
    volumes: [
      `${root}/scripts/fixtures/phase1-llm.ts:/app/backend/phase1-llm.ts:ro`,
      `${tlsDirectory}/ca:/certs/ca:ro`,
      `${tlsDirectory}/llm_service:/certs/llm_service:ro`,
    ],
    networks: ["bastiondesk-net-internal"],
    healthcheck: {
      test: [
        "CMD",
        "bun",
        "-e",
        'fetch("http://localhost:8000/health").then(r=>process.exit(r.ok?0:1))',
      ],
      interval: "2s",
      timeout: "2s",
      retries: 20,
    },
  };
  for (const [name, value] of Object.entries(config.services)) {
    const service = value as any;
    delete service.container_name;
    service.restart = "no";
    if (service.env_file) service.env_file = [envFile];
    if (service.build) {
      service.build.context = resolve(root, service.build.context);
      service.image = `bastiondesk-phase1-${name}:local`;
    }
    if (service.volumes)
      service.volumes = service.volumes.map((volume: string) =>
        volume.startsWith("./")
          ? volume.replace("./infra/tls/dev", tlsDirectory).replace(/^\.\//, `${root}/`)
          : volume,
      );
  }
  config.services.database.volumes.push(
    `${root}/database/migrations/002-better-auth-1.7.3-provider-identity.sql:/migration.sql:ro`,
    `${root}/scripts/fixtures/phase1-account-migration.sql:/migration-fixture.sql:ro`,
  );
  config.services.backend.volumes.push(`${tlsDirectory}/pgbouncer:/certs/migrator:ro`);
  config.services.backend.depends_on["smtp-test"] = { condition: "service_healthy" };
  config.services.nginx.ports = [`127.0.0.1:${port}:8080`];
  await Bun.write(configFile, JSON.stringify(config, null, 2));
  console.log(`[phase1] Isolated project ${project}, application ${baseUrl}`);
  started = true;
  await compose(["build"]);
  if (process.platform === "linux") {
    // Bind mounts retain host UIDs on Linux. Keep the private test keys at 0600
    // and assign them to the users of the pinned images (Bun, PostgreSQL, PgBouncer).
    await compose([
      "run",
      "--rm",
      "--no-deps",
      "--user",
      "0:0",
      "--entrypoint",
      "/bin/sh",
      "--volume",
      `${tlsDirectory}:/phase1-certs`,
      "backend",
      "-ec",
      "chown 1000:1000 /phase1-certs/backend/client.key /phase1-certs/llm_service/server.key; chown 999:999 /phase1-certs/database/server.key; chown 70:70 /phase1-certs/pgbouncer/server.key /phase1-certs/pgbouncer/client.key; chown 0:0 /phase1-certs/storage-*/private.key",
    ]);
  }
  await compose(["up", "-d", "--wait", "--wait-timeout", "240", "database"]);
  await compose([
    "exec",
    "-T",
    "database",
    "sh",
    "-ec",
    'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /migration-fixture.sql',
  ]);
  await compose(["run", "--rm", "--no-deps", "--user", "0:0", "backend", "bun", "src/migrations/cli.ts", "apply"]);
  await compose(["up", "-d", "--wait", "--wait-timeout", "240"]);
  const testEnvironment = {
    E2E_BASE_URL: baseUrl,
    E2E_MAILPIT_URL: `http://127.0.0.1:${mailPort}`,
    E2E_RUN_ID: runId,
  };
  const task = process.argv.includes("--all") ? "test:e2e:all" : "test:e2e";
  await command(["bun", "x", "--no-install", "turbo", "run", task], testEnvironment);
  console.log(`[phase1] PASS ${task}`);
} catch (error) {
  if (started) {
    try {
      await Bun.write(
        join(directory, "compose.log"),
        await compose(["logs", "--no-color", "--tail", "100"], true),
      );
    } catch {
      console.error("[phase1] Could not collect Compose diagnostics");
    }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop();
}
