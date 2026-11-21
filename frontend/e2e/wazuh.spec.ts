import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { checkServerIdentity } from "node:tls";
import { test, expect, api } from "./fixtures";

const origin = process.env.E2E_WAZUH_ORIGIN;
const user = process.env.E2E_WAZUH_USER;
const caFile = process.env.E2E_WAZUH_CA_FILE;
const passwordFile = process.env.E2E_WAZUH_PASSWORD_FILE;
const tlsName = process.env.E2E_WAZUH_TLS_NAME;
const agentId = "001";

interface IndexerHit {
  _id: string;
  _index: string;
  _source: {
    agent: { id: string; name: string };
    timestamp: string;
    rule: { id: string; level: number };
  };
}

function latestAgentAlert(ca: string, password: string, since?: string) {
  const filters: object[] = [{ term: { "agent.id": agentId } }];
  if (since) filters.push({ range: { timestamp: { gte: since } } });
  const body = JSON.stringify({
    size: 1,
    query: { bool: { filter: filters } },
    sort: [{ timestamp: "desc" }],
  });
  return new Promise<IndexerHit>((resolve, reject) => {
    const req = request(
      origin + "/wazuh-alerts-*/_search?allow_partial_search_results=false",
      {
        method: "POST",
        ca,
        auth: `${user}:${password}`,
        ...(tlsName && {
          checkServerIdentity: (_host, cert) => checkServerIdentity(tlsName, cert),
        }),
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          data += chunk;
        });
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode !== 200)
            return reject(new Error(`Indexer returned HTTP ${response.statusCode}`));
          try {
            const hit = JSON.parse(data).hits.hits[0];
            if (!hit) throw new Error("No matching live alert for agent 001");
            resolve(hit);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Indexer timed out")));
    req.end(body);
  });
}

test.use({ trace: "off", screenshot: "off" });
test("WAZ-04 agent 001 from the Indexer to the analyst, including the full JSON", async ({
  page,
  context,
  scenario,
  request: anonymous,
}) => {
  test.skip(!origin || !user || !caFile || !passwordFile, "Requires a live Wazuh Indexer");
  const ca = await readFile(caFile!, "utf8");
  const password = (await readFile(passwordFile!, "utf8")).replace(/\r?\n$/, "");
  const hit = await latestAgentAlert(ca, password, process.env.E2E_WAZUH_EVENT_SINCE);
  expect(hit._source.agent.id).toBe(agentId);
  const sourcePath = `/api/wazuh/source?organizationId=${scenario.organizationId}`;

  await scenario.login(page, scenario.admin);
  await page.getByRole("tab", { name: "Alerty Wazuh", exact: true }).click();
  await page.getByLabel("Adres HTTPS Indexera").fill(origin!);
  await page.getByLabel("Użytkownik Indexera").fill(user!);
  await page.getByLabel("Hasło konta Indexera").fill(password);
  await page.getByLabel("Certyfikat CA", { exact: false }).fill(ca);
  await page.getByRole("button", { name: "Sprawdź połączenie" }).click();
  await expect(
    page.getByText("Połączenie i uprawnienia do odczytu zostały sprawdzone."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zapisz i włącz" }).click();
  await expect
    .poll(async () => {
      const source = await scenario.admin.api.get(sourcePath);
      return (await source.json()).data?.source?.enabled;
    })
    .toBe(true);
  const config = await (await scenario.admin.api.get(sourcePath)).json();
  expect(JSON.stringify(config).includes(password)).toBe(false);
  const revision = config.data.source.revision;
  const detailQuery = new URLSearchParams({
    organizationId: scenario.organizationId,
    revision,
    documentId: hit._id,
    indexName: hit._index,
  });
  const listPath = `/api/wazuh/alerts?organizationId=${scenario.organizationId}&revision=${revision}`;
  const detailPath = `/api/wazuh/alerts/detail?${detailQuery}`;
  const jsonPath = `/api/wazuh/alerts/json?${detailQuery}`;
  expect((await anonymous.get(listPath)).status()).toBe(401);
  for (const [path, requestContext] of [
    [listPath, scenario.employee.api],
    [detailPath, scenario.employee.api],
    [jsonPath, scenario.employee.api],
  ] as const)
    expect((await requestContext.get(path)).status()).toBe(403);
  const adminDetails = await scenario.admin.api.get(detailPath);
  expect(adminDetails.status()).toBe(200);
  const adminData = (await adminDetails.json()).data;

  await context.clearCookies();
  await scenario.login(page, scenario.analyst);
  await page.getByRole("tab", { name: "Alerty Wazuh", exact: true }).click();
  await expect(page.getByLabel("Hasło konta Indexera")).toHaveCount(0);
  const timestamp = Date.parse(hit._source.timestamp);
  const [from, to] = await page.evaluate((time) => {
    const localDate = (value: number) => {
      const date = new Date(value);
      return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    };
    return [localDate(time - 60_000), localDate(time + 60_000)];
  }, timestamp);
  await page.getByLabel("Od (czas lokalny)", { exact: true }).fill(from);
  await page.getByLabel("Do (czas lokalny)", { exact: true }).fill(to);
  await page
    .getByLabel("Poziom reguły", { exact: true })
    .selectOption(String(hit._source.rule.level));
  await page.getByRole("button", { name: "Pokaż zakres" }).click();
  const open = page.getByRole("button", { name: `Szczegóły alertu ${hit._id}` });
  const row = page.getByRole("row").filter({ has: open });
  await expect(row).toContainText(`${hit._source.agent.name} (001)`);
  await expect(row).toContainText(hit._source.rule.id);
  await expect(row.locator("time")).toHaveAttribute("datetime", new Date(timestamp).toISOString());
  for (let attempt = 0; attempt < 2; attempt++) {
    const refreshed = page.waitForResponse((response) =>
      response.url().includes("/api/wazuh/alerts?"),
    );
    await page.getByRole("button", { name: "Odśwież", exact: true }).click();
    expect((await refreshed).ok()).toBe(true);
    await expect(row).toHaveCount(1);
  }

  let rawRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/wazuh/alerts/json?")) rawRequests++;
  });
  const details = page.waitForResponse((response) =>
    response.url().includes("/api/wazuh/alerts/detail?"),
  );
  await open.click();
  expect((await (await details).json()).data).toEqual(adminData);
  const dialog = page.getByRole("dialog", { name: "Szczegóły alertu Wazuh" });
  await expect(dialog.getByText(hit._index, { exact: true })).toBeVisible();
  await expect(dialog.getByText(hit._id, { exact: true })).toBeVisible();
  expect(rawRequests).toBe(0);
  const raw = page.waitForResponse((response) =>
    response.url().includes("/api/wazuh/alerts/json?"),
  );
  await dialog.getByRole("button", { name: "Pokaż JSON" }).click();
  expect((await raw).headers()["cache-control"]).toBe("private, no-store");
  const json = dialog.getByLabel("Dokument JSON Wazuh");
  try {
    expect(isDeepStrictEqual(JSON.parse((await json.textContent())!), hit._source)).toBe(true);
    expect(rawRequests).toBe(1);
  } finally {
    await page.keyboard.press("Escape");
  }

  const other = await api(scenario.admin.api, "/api/auth/organization/create", {
    name: `Other ${scenario.id}`,
    slug: `other-${scenario.id}`,
  });
  try {
    await api(scenario.admin.api, "/api/auth/organization/set-active", {
      organizationId: other.id,
    });
    await api(scenario.admin.api, "/api/auth/organization/add-member-by-email", {
      email: scenario.analyst.email,
      role: "analityk",
    });
    await api(page.request, "/api/auth/organization/set-active", { organizationId: other.id });
    for (const path of [listPath, detailPath, jsonPath])
      expect((await page.request.get(path)).status()).toBe(403);
    await page.reload();
    await page.getByRole("tab", { name: "Alerty Wazuh", exact: true }).click();
    await expect(page.getByText("Organizacja nie ma skonfigurowanego źródła Wazuh.")).toBeVisible();
    await expect(row).toHaveCount(0);
  } finally {
    await api(scenario.admin.api, "/api/auth/organization/delete", { organizationId: other.id });
    await api(scenario.admin.api, "/api/auth/organization/set-active", {
      organizationId: scenario.organizationId,
    });
  }

  await context.clearCookies();
  await scenario.login(page, scenario.admin);
  await page.getByRole("tab", { name: "Alerty Wazuh", exact: true }).click();
  const check = page.getByRole("button", { name: "Sprawdź połączenie" });
  const originField = page.getByLabel("Adres HTTPS Indexera");
  const passwordField = page.getByLabel("Hasło konta Indexera");
  const caField = page.getByLabel("Certyfikat CA", { exact: false });
  await expect(passwordField).toHaveValue("");
  await originField.fill("https://127.1:9200");
  await passwordField.fill("invalid-test-value");
  await check.click();
  await expect(page.getByRole("alert")).toContainText("Podaj prawidłowy, dostępny");
  await originField.fill(origin!);
  await page.getByRole("button", { name: "Zapisz i włącz" }).click();
  await expect(page.getByRole("alert")).toContainText("Indexer odrzucił dane logowania");
  expect((await scenario.analyst.api.get(detailPath)).status()).toBe(200);
  await passwordField.fill("");
  await caField.fill("");
  await check.click();
  await expect(page.getByRole("alert")).toContainText("Nie udało się zweryfikować certyfikatu TLS");

  await page.getByRole("button", { name: "Wyłącz", exact: true }).click();
  await expect(page.getByText("Źródło Wazuh jest wyłączone.", { exact: true })).toBeVisible();
  expect((await scenario.analyst.api.get(detailPath)).status()).toBe(409);
  await page.getByRole("button", { name: "Włącz ponownie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Wyłącz", exact: true })).toBeVisible();

  const remove = page.getByRole("button", { name: "Usuń źródło" });
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await remove.click();
  await expect(remove).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await remove.click();
  await expect(page.getByText("Organizacja nie ma skonfigurowanego źródła Wazuh.")).toBeVisible();
  const hitAfterDeletion = await latestAgentAlert(ca, password, process.env.E2E_WAZUH_EVENT_SINCE);
  expect(hitAfterDeletion._source.agent.id).toBe(agentId);
  console.log(
    `Verified live agent ${agentId} document ${hit._index}/${hit._id} at ${hit._source.timestamp}`,
  );
});

test("WAZ-06 refresh interval, inactive views, historical pages and manual recovery", async ({
  page,
  scenario,
}) => {
  const revision = "dc1de105-b015-498d-b899-9ab9273947bb";
  const entry = {
    indexName: "wazuh-alerts-clock",
    documentId: "first",
    timestamp: new Date().toISOString(),
    agentName: "Ubuntu",
    agentId: "001",
    ruleId: "510",
    ruleLevel: 7,
    description: "Poprzedni alert",
  };
  let seconds = 60;
  let requests = 0;
  let moreAlerts = false;
  let unavailable = false;
  await scenario.login(page, scenario.analyst);
  await expect(page.getByRole("heading", { name: "Panel Analityka" })).toBeVisible();
  await page.clock.install();
  await page.route("**/api/wazuh/source?*", (route) =>
    route.fulfill({
      json: { data: { source: { enabled: true, revision }, refreshSeconds: seconds } },
    }),
  );
  await page.route("**/api/wazuh/alerts?*", (route) => {
    requests++;
    if (unavailable)
      return route.fulfill({
        status: 502,
        json: { error: { message: "Nie udało się połączyć z Indexerem Wazuh." } },
      });
    const secondPage = new URL(route.request().url()).searchParams.get("cursor") === "older";
    const alerts = secondPage
      ? [{ ...entry, documentId: "older", description: "Starszy alert" }]
      : moreAlerts
        ? [{ ...entry, documentId: "new", description: "Nowy alert" }, entry]
        : [entry];
    return route.fulfill({
      json: {
        data: {
          alerts,
          cursor: secondPage ? "older" : "first",
          nextCursor: secondPage ? null : "older",
        },
      },
    });
  });
  const open = () => page.getByRole("tab", { name: "Alerty Wazuh", exact: true }).click();
  const refresh = page.getByRole("button", { name: "Odśwież", exact: true });
  await open();
  await expect(page.getByText("Poprzedni alert", { exact: true })).toBeVisible();
  const beforePolling = requests;
  moreAlerts = true;
  await page.clock.fastForward(55_000);
  expect(requests).toBe(beforePolling);
  await page.clock.fastForward(5_000);
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  expect(requests).toBe(beforePolling + 1);

  await page.getByRole("button", { name: "Następna" }).click();
  await expect(page.getByText("Starszy alert", { exact: true })).toBeVisible();
  const beforeOlder = requests;
  await page.clock.fastForward(61_000);
  expect(requests).toBe(beforeOlder);
  await page.getByRole("button", { name: "Wróć do aktualnych wyników" }).click();
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  await expect(refresh).toBeEnabled();

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const beforeHidden = requests;
  await page.clock.fastForward(61_000);
  expect(requests).toBe(beforeHidden);
  await page.getByRole("tab", { name: "Przypisane do mnie", exact: true }).click();
  await expect(refresh).toHaveCount(0);
  const beforeInactive = requests;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(61_000);
  expect(requests).toBe(beforeInactive);

  seconds = 30;
  await page.reload();
  await open();
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  const beforeShort = requests;
  await page.clock.fastForward(31_000);
  await expect.poll(() => requests).toBe(beforeShort + 1);
  await expect(refresh).toBeEnabled();
  await page.getByLabel("Od (czas lokalny)").fill("2026-11-20T00:00");
  await page.getByLabel("Do (czas lokalny)").fill("2026-11-21T00:00");
  await page.getByRole("button", { name: "Pokaż zakres" }).click();
  await expect(refresh).toBeEnabled();
  const beforeRange = requests;
  await page.clock.fastForward(31_000);
  expect(requests).toBe(beforeRange);

  seconds = 0;
  await page.reload();
  await open();
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  const beforeManual = requests;
  await page.clock.fastForward(61_000);
  expect(requests).toBe(beforeManual);
  unavailable = true;
  await refresh.click();
  await expect(page.getByRole("alert")).toContainText("Nie udało się połączyć z Indexerem Wazuh.");
  unavailable = false;
  await refresh.click();
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  expect(requests).toBe(beforeManual + 2);
});
