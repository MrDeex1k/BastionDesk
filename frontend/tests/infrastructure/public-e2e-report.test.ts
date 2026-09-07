import { expect, test } from "bun:test";
import { publicE2eHtml, publicE2eReport } from "../../scripts/public-e2e-report";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function fixture(status: string = "passed") {
  return {
    suites: [
      {
        specs: [
          {
            title: "AUTH-E2E-01 login",
            tests: [
              {
                projectName: "chromium",
                results: [{ status, duration: 123.4 }],
              },
            ],
          },
        ],
      },
    ],
    errors: [] as unknown[],
  };
}

test("public report preserves scenario, browser, result and timing", () => {
  const report = publicE2eReport(fixture());
  expect(report.state).toBe("passed");
  expect(report.rows).toEqual([
    { scenario: "AUTH-E2E-01", browser: "chromium", status: "passed", durationMs: 123 },
  ]);
});

test("public report excludes secrets even inside titles, errors and attachments", () => {
  const secret = "PRIVATE-COOKIE-PASSWORD-RESET-TOKEN";
  const input = fixture("failed");
  const spec = input.suites[0]!.specs[0]!;
  spec.title += ` ${secret}`;
  Object.assign(spec.tests[0]!.results[0]!, {
    error: { message: secret, stack: secret },
    stdout: [secret],
    stderr: [secret],
    attachments: [{ body: secret, path: secret }],
  });
  Object.assign(input, { config: { metadata: secret, webServer: { env: { PASSWORD: secret } } } });
  input.errors.push({ message: secret });
  const report = publicE2eReport(input);
  expect(report.state).toBe("failed");
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(publicE2eHtml(report)).not.toContain(secret);
});

test("public report rejects arbitrary names and HTML in all displayed strings", () => {
  const input = fixture();
  const spec = input.suites[0]!.specs[0]!;
  spec.title = '<script>alert("private")</script>';
  spec.tests[0]!.projectName = "secret-browser";
  spec.tests[0]!.results[0]!.status = "secret-status";
  const report = publicE2eReport(input);
  expect(report.rows[0]).toMatchObject({
    scenario: "unknown",
    browser: "unknown",
    status: "unknown",
  });
  expect(report.state).toBe("failed");
  expect(publicE2eHtml(report)).not.toContain("secret");
  expect(publicE2eHtml(report)).not.toContain("<script>");
});

test("missing results and runner errors cannot produce a passing summary", () => {
  expect(publicE2eReport(null).state).toBe("unavailable");
  const input = fixture();
  input.errors.push({ message: "runner failed" });
  expect(publicE2eReport(input).state).toBe("failed");
  expect(publicE2eReport(fixture("skipped")).state).toBe("failed");
});

test("publish command emits only safe files and removes stale output on invalid input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bastiondesk-public-report-"));
  const frontend = join(directory, "frontend");
  const script = join(frontend, "scripts/public-e2e-report.ts");
  const input = join(frontend, "test-results/results.json");
  const output = join(directory, "artifacts/phase1-public");
  const secret = "PRIVATE-TRACE-COOKIE";
  try {
    await mkdir(join(frontend, "scripts"), { recursive: true });
    await mkdir(join(frontend, "test-results"), { recursive: true });
    await Bun.write(
      script,
      Bun.file(new URL("../../scripts/public-e2e-report.ts", import.meta.url)),
    );
    await Bun.write(input, JSON.stringify({ ...fixture(), config: { secret } }));
    await Bun.write(join(frontend, "test-results/trace.zip"), secret);
    const run = () =>
      Bun.spawn([process.execPath, script], { stdout: "ignore", stderr: "ignore" }).exited;
    expect(await run()).toBe(0);
    expect((await readdir(output)).sort()).toEqual(["index.html", "results.json"]);
    for (const file of await readdir(output)) {
      expect(await Bun.file(join(output, file)).text()).not.toContain(secret);
    }
    await Bun.write(join(output, "stale.txt"), secret);
    await Bun.write(input, "invalid JSON");
    expect(await run()).not.toBe(0);
    expect(await Bun.file(join(output, "results.json")).exists()).toBe(false);
    expect(await Bun.file(join(output, "stale.txt")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
