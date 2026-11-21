import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { api, expect, login, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("YARA blocks a stored attachment when an organization rule matches", async ({
  page,
  scenario,
}) => {
  const description = `Załącznik do lokalnej analizy ${scenario.id}`;
  await login(page, scenario.employee);
  await page.getByLabel(/Opis problemu/).fill(description);
  await page.getByLabel(/Załącznik/).setInputFiles({
    name: "yara-fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`BastionDesk harmless YARA fixture ${scenario.id}`),
  });
  await page.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }).click();
  await expect(page.getByText("Sukces!", { exact: true })).toBeVisible();
  const response = await scenario.employee.api.get("/api/incidents/my");
  const { data } = await response.json();
  const incident = data.find(
    (item: { userDescription: string }) => item.userDescription === description,
  );
  const params = new URLSearchParams({
    organizationId: scenario.organizationId,
  });
  const scan = `/api/incidents/${incident.id}/attachment-scan?${params}`;
  const rules = `/api/admin/yara/rules?${params}`;
  const download = `/api/incidents/${incident.id}/files/attachments/yara-fixture.txt`;
  const link = `/api/incidents/${incident.id}/files/attachment/download`;
  await expect
    .poll(async () => (await (await scenario.employee.api.get(scan)).json()).data, {
      timeout: 20_000,
    })
    .toEqual({ state: "clean" });
  expect((await scenario.employee.api.get(download)).ok()).toBe(true);
  const compatible = (await (await scenario.employee.api.get(link)).json()).data.url;
  expect(compatible).toMatch(/^\/api\/incidents\//);
  const base = await api(scenario.admin.api, rules);
  const changed = await api(
    scenario.admin.api,
    rules,
    {
      rules:
        'rule Test_Organization { strings: $marker = "BastionDesk harmless YARA fixture" condition: $marker }',
    },
    "PUT",
  );
  expect(changed.data.version).not.toBe(base.data.version);
  const csrf = await scenario.admin.api.get("/api/csrf");
  const invalid = await scenario.admin.api.put(rules, {
    headers: { "x-csrf-token": (await csrf.json()).data.token },
    data: { rules: "rule Invalid_Organization { condition: }" },
  });
  expect(invalid.status()).toBe(422);
  expect((await api(scenario.admin.api, rules)).data.version).toBe(changed.data.version);
  expect((await scenario.employee.api.get(compatible)).status()).toBe(409);
  await expect
    .poll(async () => (await (await scenario.analyst.api.get(scan)).json()).data, {
      timeout: 20_000,
    })
    .toMatchObject({
      state: "matched",
      latest: {
        matches: ["organization:Test_Organization"],
        ruleVersion: changed.data.version,
      },
      history: [{ ruleVersion: base.data.version, matches: [] }],
    });
  expect((await (await scenario.employee.api.get(scan)).json()).data).toEqual({
    state: "matched",
  });
  expect((await scenario.employee.api.get(download)).status()).toBe(409);
  expect((await scenario.employee.api.get(link)).status()).toBe(409);
  await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
  await page.getByRole("button").filter({ hasText: description }).click();
  await expect(page.getByRole("button", { name: "Pobierz Załącznik" })).toBeDisabled();
  await expect(page.getByText("YARA wykryła dopasowanie. Pobieranie zablokowane.")).toBeVisible();
  await api(scenario.admin.api, rules, undefined, "DELETE");
  expect((await scenario.employee.api.get(compatible)).ok()).toBe(true);
});

test("YARA scans a legacy attachment without SHA-256 from the analyst card", async ({
  page,
  scenario,
  context,
}) => {
  const project = process.env.E2E_YARA_COMPOSE_PROJECT;
  const config = process.env.E2E_YARA_COMPOSE_CONFIG;
  const envFile = process.env.E2E_YARA_COMPOSE_ENV;
  test.skip(
    !project || !/^bastiondesk-e2e-\d+-\d+$/.test(project) || !config || !envFile,
    "Requires the disposable --yara Compose stack to prepare pre-upgrade data.",
  );
  const description = `Faza 7 test starszego załącznika ${scenario.id}`;
  await login(page, scenario.employee);
  await page.getByLabel(/Opis problemu/).fill(description);
  await page.getByLabel(/Załącznik/).setInputFiles({
    name: "legacy-fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`BastionDesk legacy fixture ${scenario.id}`),
  });
  await page.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }).click();
  await expect(page.getByText("Sukces!", { exact: true })).toBeVisible();
  const { data } = await (await scenario.employee.api.get("/api/incidents/my")).json();
  const incident = data.find(
    (item: { userDescription: string }) => item.userDescription === description,
  );
  expect(incident.id).toMatch(/^[a-f0-9-]{36}$/);
  const params = new URLSearchParams({ organizationId: scenario.organizationId });
  const status = `/api/incidents/${incident.id}/attachment-scan?${params}`;
  const download = `/api/incidents/${incident.id}/files/attachments/legacy-fixture.txt`;
  await expect
    .poll(async () => (await (await scenario.employee.api.get(status)).json()).data?.state, {
      timeout: 20_000,
    })
    .toBe("clean");
  await execFileAsync("docker", [
    "compose",
    "--project-name",
    project!,
    "--env-file",
    envFile!,
    "-f",
    config!,
    "exec",
    "-T",
    "backend",
    "bun",
    "phase7-yara-legacy.ts",
    incident.id,
  ]);
  expect((await (await scenario.employee.api.get(status)).json()).data?.state).toBe("unscanned");
  expect((await scenario.employee.api.get(download)).ok()).toBe(true);
  await api(
    scenario.admin.api,
    `/api/admin/yara/rules?${params}`,
    {
      rules:
        'rule Test_Legacy { strings: $marker = "BastionDesk legacy fixture" condition: $marker }',
    },
    "PUT",
  );
  await context.clearCookies();
  await login(page, scenario.analyst);
  await page.getByRole("tab", { name: "Nieprzypisane", exact: true }).click();
  await page.getByRole("button").filter({ hasText: description }).click();
  const requested = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("attachment-scan"),
  );
  await page.getByRole("button", { name: "Przeskanuj plik" }).click();
  expect((await (await requested).json()).data?.state).toBe("pending");
  expect((await scenario.employee.api.get(download)).status()).toBe(409);
  await expect(page.getByText("YARA wykryła dopasowanie. Pobieranie zablokowane.")).toBeVisible();
  expect((await scenario.employee.api.get(download)).status()).toBe(409);
  await page.getByText("Szczegóły skanu YARA").click();
  await expect(page.getByText("organization:Test_Legacy")).toBeVisible();
});
