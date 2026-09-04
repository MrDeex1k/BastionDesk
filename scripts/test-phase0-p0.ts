import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { p0Scenarios, type EvidenceSuite } from "./phase0-p0-manifest";

const prefix = "[baseline-p0]";
const runId = process.env.BASELINE_RUN_ID ?? `${Date.now()}-${process.pid}`;
const reportRoot = process.env.BASELINE_P0_REPORT_DIR ?? "artifacts/baseline";
const reportDirectory = path.resolve(reportRoot, `p0-${runId}`);
const matrixPath = path.resolve("docs/baseline/1.0.3-regression-scenarios.md");

if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
  throw new Error("BASELINE_RUN_ID may contain only letters, digits, _ and -");
}

const suiteCommands: Record<EvidenceSuite, string[]> = {
  baseline: ["bun", "run", "test:baseline"],
  fixture: ["bun", "run", "test:baseline:fixture"],
  restore: ["bun", "run", "test:baseline:restore"],
};

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function command(args: string[], env?: Record<string, string>): Promise<CommandResult> {
  const child = Bun.spawn(args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function hashFiles(pattern: string): Promise<string> {
  const paths = [...new Bun.Glob(pattern).scanSync({ cwd: process.cwd(), onlyFiles: true })].sort();
  const hasher = new Bun.CryptoHasher("sha256");
  for (const filePath of paths) {
    hasher.update(filePath);
    hasher.update(await Bun.file(filePath).arrayBuffer());
  }
  return hasher.digest("hex");
}

function matrixP0Ids(markdown: string): string[] {
  return [...markdown.matchAll(/^\| `([^`]+)` \| `P0[^`]*` \|/gm)].map((match) => match[1]!);
}

function assertManifestMatchesMatrix(matrixIds: readonly string[]): void {
  const manifestIds = p0Scenarios.map(({ id }) => id);
  const duplicates = manifestIds.filter((id, index) => manifestIds.indexOf(id) !== index);
  const absentFromManifest = matrixIds.filter((id) => !manifestIds.includes(id));
  const absentFromMatrix = manifestIds.filter((id) => !matrixIds.includes(id));
  if (
    matrixIds.length !== 41 ||
    manifestIds.length !== 41 ||
    duplicates.length ||
    absentFromManifest.length ||
    absentFromMatrix.length
  ) {
    throw new Error(
      `P0 manifest mismatch: matrix=${matrixIds.length}, manifest=${manifestIds.length}, ` +
        `duplicates=${duplicates.join(",") || "-"}, missing=${absentFromManifest.join(",") || "-"}, ` +
        `extra=${absentFromMatrix.join(",") || "-"}`,
    );
  }
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

await mkdir(reportDirectory, { recursive: true });
const matrix = await readFile(matrixPath, "utf8");
const matrixIds = matrixP0Ids(matrix);
assertManifestMatchesMatrix(matrixIds);

const suiteResults = {} as Record<
  EvidenceSuite,
  { command: string; exitCode: number; log: string }
>;
for (const suite of Object.keys(suiteCommands) as EvidenceSuite[]) {
  console.log(`${prefix} running ${suite}`);
  const result = await command(suiteCommands[suite], { BASELINE_RUN_ID: runId });
  const logPath = path.join(reportDirectory, `${suite}.log`);
  await Bun.write(logPath, `${result.stdout}${result.stderr}`);
  suiteResults[suite] = {
    command: suiteCommands[suite].join(" "),
    exitCode: result.exitCode,
    log: path.relative(process.cwd(), logPath),
  };
  console.log(`${prefix} ${suite}: ${result.exitCode === 0 ? "PASS" : "FAIL"}`);
}

const git = await command(["git", "rev-parse", "HEAD"]);
const gitStatus = await command(["git", "status", "--short"]);
const bun = await command(["bun", "--version"]);
const composeImages = await command(["docker", "compose", "images", "--format", "json"]);
const generatedAt = new Date().toISOString();
const results = p0Scenarios.map((scenario) => {
  const failedSuites = scenario.suites.filter((suite) => suiteResults[suite].exitCode !== 0);
  const status = failedSuites.length
    ? "FAIL"
    : scenario.coverage === "full"
      ? "PASS"
      : scenario.coverage === "partial"
        ? "PARTIAL"
        : "NOT_COVERED";
  return { ...scenario, status, failedSuites };
});
const summary = {
  total: results.length,
  pass: results.filter(({ status }) => status === "PASS").length,
  partial: results.filter(({ status }) => status === "PARTIAL").length,
  notCovered: results.filter(({ status }) => status === "NOT_COVERED").length,
  fail: results.filter(({ status }) => status === "FAIL").length,
};
const report = {
  schemaVersion: 1,
  package: "baseline-p0",
  runId,
  generatedAt,
  gitSha: git.stdout.trim() || "unknown",
  workingTreeDirty: Boolean(gitStatus.stdout.trim()),
  workingTreeStatus: gitStatus.stdout.trim().split("\n").filter(Boolean),
  bunVersion: bun.stdout.trim() || "unknown",
  schemaSha256: await hashFiles("database/**/*.{sql,sh}"),
  protoSha256: await hashFiles("proto/**/*.proto"),
  composeImages:
    composeImages.exitCode === 0 ? composeImages.stdout.trim().split("\n").filter(Boolean) : [],
  suiteResults,
  summary,
  decision: summary.pass === summary.total ? "GO" : "NO-GO",
  results,
};

const markdown = [
  "# BastionDesk 1.0.3 — raport P0",
  "",
  `- Run ID: \`${runId}\``,
  `- UTC: \`${generatedAt}\``,
  `- Git SHA: \`${report.gitSha}\``,
  `- Working tree: ${report.workingTreeDirty ? "dirty (lista ścieżek w JSON)" : "clean"}`,
  `- Bun: \`${report.bunVersion}\``,
  `- Wynik: **${report.decision}**`,
  `- Podsumowanie: ${summary.pass} PASS, ${summary.partial} PARTIAL, ${summary.notCovered} NOT_COVERED, ${summary.fail} FAIL / ${summary.total}`,
  "",
  "| ID | Wynik | Pakiet dowodowy | Dowód / luka |",
  "| --- | --- | --- | --- |",
  ...results.map(({ id, status, suites, evidence, gap, failedSuites }) => {
    const detail = failedSuites.length
      ? `Nie przeszedł pakiet: ${failedSuites.join(", ")}. ${gap ?? evidence}`
      : gap
        ? `${evidence} Luka: ${gap}`
        : evidence;
    return `| \`${id}\` | ${status} | ${suites.join(", ") || "—"} | ${markdownEscape(detail)} |`;
  }),
  "",
  "## Pakiety wykonania",
  "",
  ...Object.entries(suiteResults).map(
    ([suite, result]) =>
      `- \`${suite}\`: exit ${result.exitCode}, log [${path.basename(result.log)}](${path.basename(result.log)})`,
  ),
  "",
].join("\n");

const jsonPath = path.join(reportDirectory, "report.json");
const markdownPath = path.join(reportDirectory, "report.md");
await Promise.all([
  Bun.write(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
  Bun.write(markdownPath, markdown),
]);

console.log(
  `${prefix} ${report.decision}: ${summary.pass} PASS, ${summary.partial} PARTIAL, ` +
    `${summary.notCovered} NOT_COVERED, ${summary.fail} FAIL / ${summary.total}`,
);
console.log(`${prefix} report: ${path.relative(process.cwd(), markdownPath)}`);
if (report.decision !== "GO") process.exitCode = 1;
