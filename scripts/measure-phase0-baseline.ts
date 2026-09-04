#!/usr/bin/env bun

const root = new URL("..", import.meta.url).pathname;
const timeoutSeconds = process.env.BASELINE_MEASURE_TIMEOUT_SECONDS ?? "180";
const requestCount = Number(process.env.BASELINE_MEASURE_REQUESTS ?? "30");
if (!Number.isInteger(requestCount) || requestCount < 1) {
  throw new Error("BASELINE_MEASURE_REQUESTS must be a positive integer");
}

type CommandResult = { stdout: string; stderr: string };

async function run(args: string[], quiet = false): Promise<CommandResult> {
  if (!quiet) console.error(`[baseline-measure] ${args.join(" ")}`);
  const process = Bun.spawn(args, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${args.join(" ")} failed (${exitCode})\n${stderr || stdout}`);
  }
  return { stdout, stderr };
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function formatBytes(value: number): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  let result = value;
  let unit = units[0];
  for (const candidate of units) {
    unit = candidate;
    if (result < 1024 || candidate === units.at(-1)) break;
    result /= 1024;
  }
  return `${result.toFixed(unit === "B" ? 0 : 1)} ${unit}`;
}

function parseMemory(value: string): number {
  const match = value.trim().match(/^([0-9.]+)(B|KiB|MiB|GiB)$/);
  if (!match) throw new Error(`Unsupported Docker memory value: ${value}`);
  const multipliers = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };
  return Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
}

async function measureEndpoint(url: string): Promise<number[]> {
  const values: number[] = [];
  for (let index = 0; index < requestCount; index += 1) {
    const start = performance.now();
    const response = await fetch(url, { cache: "no-store" });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    values.push(performance.now() - start);
  }
  return values;
}

console.error("[baseline-measure] stopping services without removing volumes");
await run(["docker", "compose", "stop", "--timeout", "30"], true);

console.error("[baseline-measure] measuring warm start to healthy state");
const startupStartedAt = performance.now();
await run(
  ["docker", "compose", "up", "--detach", "--wait", "--wait-timeout", timeoutSeconds],
  true,
);
const startupMilliseconds = performance.now() - startupStartedAt;

console.error(`[baseline-measure] measuring ${requestCount} requests per endpoint`);
const endpoints = [
  ["API metadata", "http://127.0.0.1:4567/api"],
  ["CSRF token", "http://127.0.0.1:4567/api/csrf"],
] as const;
const latencyResults = [];
for (const [name, url] of endpoints) {
  latencyResults.push({ name, values: await measureEndpoint(url) });
}

console.error("[baseline-measure] sampling idle resources and image sizes");
const containerIds = (await run(["docker", "compose", "ps", "-q"], true)).stdout
  .trim()
  .split("\n")
  .filter(Boolean);
if (containerIds.length === 0) {
  throw new Error("docker compose ps returned no containers");
}
const statsOutput = await run(
  ["docker", "stats", "--no-stream", "--format", "{{json .}}", ...containerIds],
  true,
);
const stats = statsOutput.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as { CPUPerc: string; MemUsage: string; Name: string })
  .map((row) => ({
    cpu: Number(row.CPUPerc.replace("%", "")),
    memory: parseMemory(row.MemUsage.split("/")[0]!.trim()),
    name: row.Name,
  }))
  .toSorted((left, right) => left.name.localeCompare(right.name));

const imageRows = JSON.parse(
  (await run(["docker", "compose", "images", "--format", "json"], true)).stdout,
) as Array<{ ID: string; Platform: string; Repository: string; Size: number }>;
const images = imageRows.toSorted((left, right) => left.Repository.localeCompare(right.Repository));

const dockerVersion = JSON.parse(
  (await run(["docker", "version", "--format", "{{json .Server}}"], true)).stdout,
) as { Arch: string; Os: string; Version: string };
const capturedAt = new Date().toISOString();

console.log("# BastionDesk 1.0.3 — wynik pomiaru baseline'u");
console.log();
console.log(`- Czas UTC: ${capturedAt}`);
console.log(`- Docker Engine: ${dockerVersion.Version}, ${dockerVersion.Os}/${dockerVersion.Arch}`);
console.log(
  `- Warm start zatrzymanego stosu do zdrowia: ${formatMilliseconds(startupMilliseconds)}`,
);
console.log(`- Liczba próbek HTTP na endpoint: ${requestCount}`);
console.log();
console.log("## Opóźnienia HTTP");
console.log();
console.log("| Endpoint | p50 | p95 | maksimum |");
console.log("|---|---:|---:|---:|");
for (const result of latencyResults) {
  console.log(
    `| ${result.name} | ${formatMilliseconds(percentile(result.values, 0.5))} | ${formatMilliseconds(percentile(result.values, 0.95))} | ${formatMilliseconds(Math.max(...result.values))} |`,
  );
}
console.log();
console.log("## Zasoby w spoczynku");
console.log();
console.log("Jedna próbka po pomiarach HTTP; CPU może chwilowo obejmować pracę usług w tle.");
console.log();
console.log("| Kontener | CPU | RAM |");
console.log("|---|---:|---:|");
for (const row of stats) {
  console.log(`| ${row.name} | ${row.cpu.toFixed(2)}% | ${formatBytes(row.memory)} |`);
}
console.log(
  `| **Łącznie** | **${stats.reduce((sum, row) => sum + row.cpu, 0).toFixed(2)}%** | **${formatBytes(stats.reduce((sum, row) => sum + row.memory, 0))}** |`,
);
console.log();
console.log("## Logiczne rozmiary obrazów Compose");
console.log();
console.log(
  "Suma obejmuje obraz każdej usługi. Nie jest zużyciem dysku: Docker współdzieli identyczne warstwy między obrazami.",
);
console.log();
console.log("| Obraz Compose | Platforma | Rozmiar |");
console.log("|---|---|---:|");
for (const row of images) {
  console.log(`| ${row.Repository} | ${row.Platform} | ${formatBytes(row.Size)} |`);
}
console.log(
  `| **Łącznie** | | **${formatBytes(images.reduce((sum, row) => sum + row.Size, 0))}** |`,
);
