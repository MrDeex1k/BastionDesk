import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const scenarios = new Set([
  "AUTH-E2E-01",
  "AUTH-E2E-02",
  "AUTH-E2E-03",
  "INC-E2E-01",
  "INC-E2E-02",
  "ORG-E2E-01",
  "ORG-E2E-02",
  "ORG-E2E-03",
]);
const browsers = new Set(["chromium", "firefox", "webkit"]);
const statuses = new Set(["passed", "failed", "timedOut", "skipped", "interrupted"]);
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const allowed = (value: unknown, values: Set<string>) =>
  typeof value === "string" && values.has(value) ? value : "unknown";
const milliseconds = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

// Construct a new document from an allowlist. Never copy arbitrary titles,
// errors, source, attachments, URLs, headers, environment or console output.
export function publicE2eReport(input: unknown) {
  const rows: Array<{ scenario: string; browser: string; status: string; durationMs: number }> = [];
  function visit(suites: unknown) {
    for (const value of array(suites)) {
      const suite = record(value);
      for (const specValue of array(suite.specs)) {
        const spec = record(specValue);
        const id = typeof spec.title === "string" ? spec.title.split(/\s/, 1)[0] : undefined;
        for (const testValue of array(spec.tests)) {
          const test = record(testValue);
          const results = array(test.results);
          for (const resultValue of results.length ? results : [{}]) {
            const result = record(resultValue);
            rows.push({
              scenario: allowed(id, scenarios),
              browser: allowed(test.projectName, browsers),
              status: allowed(result.status, statuses),
              durationMs: milliseconds(result.duration),
            });
          }
        }
      }
      visit(suite.suites);
    }
  }
  const source = record(input);
  visit(source.suites);
  const hasErrors = array(source.errors).length > 0;
  const state = !rows.length
    ? "unavailable"
    : !hasErrors &&
        rows.every(
          (row) =>
            row.status === "passed" && row.scenario !== "unknown" && row.browser !== "unknown",
        )
      ? "passed"
      : "failed";
  return { schemaVersion: 1, state, hasErrors, rows };
}

export function publicE2eHtml(report: ReturnType<typeof publicE2eReport>) {
  // Every textual value below comes from the fixed sets above.
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>E2E results</title>
<style>body{font:16px system-ui;margin:2rem}table{border-collapse:collapse}td,th{padding:.5rem 1rem;border:1px solid #ccc;text-align:left}</style>
<h1>E2E results: ${report.state}</h1>
<p>Public summary. Raw traces, screenshots, errors and logs are excluded.</p>
<table><thead><tr><th>Scenario</th><th>Browser</th><th>Status</th><th>Duration (ms)</th></tr></thead><tbody>
${report.rows.map((row) => `<tr><td>${row.scenario}</td><td>${row.browser}</td><td>${row.status}</td><td>${row.durationMs}</td></tr>`).join("\n")}
</tbody></table></html>`;
}

if (import.meta.main) {
  const frontend = resolve(import.meta.dir, "..");
  const output = resolve(frontend, "../artifacts/phase1-public");
  // Clear the publish directory even when input parsing fails: no stale upload.
  await rm(output, { recursive: true, force: true });
  const input = Bun.file(resolve(frontend, "test-results/results.json"));
  let data: unknown = null;
  if (await input.exists()) {
    try {
      data = await input.json();
    } catch {
      throw new Error("Invalid E2E report; no public artifacts generated");
    }
  }
  const report = publicE2eReport(data);
  await mkdir(output, { recursive: true });
  await Bun.write(resolve(output, "results.json"), JSON.stringify(report, null, 2));
  await Bun.write(resolve(output, "index.html"), publicE2eHtml(report));
  console.log(`Public E2E summary: ${report.state}, ${report.rows.length} results`);
}
