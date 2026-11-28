import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { checkServerIdentity } from "node:tls";
import type { Page } from "@playwright/test";
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

type AlertKey = { indexName: string; documentId: string };
type AlertPage = { alerts: AlertKey[]; nextCursor: string | null };
type ReadAlertPage = (cursor: string | null, action: () => Promise<void>) => Promise<AlertPage>;

async function findAlertRow(
  page: Page,
  key: AlertKey,
  current: AlertPage,
  cursor: string | null,
  readPage: ReadAlertPage,
) {
  const visited = new Set<string>();
  if (cursor) visited.add(cursor);
  for (;;) {
    const matches = current.alerts.flatMap((alert, index) =>
      alert.indexName === key.indexName && alert.documentId === key.documentId ? [index] : [],
    );
    if (matches.length > 0) {
      expect(matches).toHaveLength(1);
      const table = page.getByRole("table", { name: "Alerty Wazuh" });
      await expect(table.getByRole("row")).toHaveCount(current.alerts.length + 1);
      return { row: table.getByRole("row").nth(matches[0]! + 1), cursor };
    }
    const next = current.nextCursor;
    if (!next || visited.has(next)) throw new Error("Expected alert was not found in the list");
    visited.add(next);
    cursor = next;
    current = await readPage(cursor, () => page.getByRole("button", { name: "Następna" }).click());
  }
}

function alertPageReader(
  page: Page,
  matchesFilters: (query: URLSearchParams) => boolean,
): ReadAlertPage {
  return async (cursor, action) => {
    const [response] = await Promise.all([
      page.waitForResponse((response) => {
        const { pathname, searchParams } = new URL(response.url());
        return (
          pathname === "/api/wazuh/alerts" &&
          searchParams.get("cursor") === cursor &&
          matchesFilters(searchParams)
        );
      }),
      action(),
    ]);
    expect(response.ok()).toBe(true);
    const { data }: { data: AlertPage } = await response.json();
    return data;
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
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
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
  const readPage = alertPageReader(
    page,
    (query) =>
      query.get("organizationId") === scenario.organizationId &&
      query.get("revision") === revision &&
      query.get("level") === String(hit._source.rule.level) &&
      query.has("from") &&
      query.has("to"),
  );
  const firstPage = await readPage(null, () =>
    page.getByRole("button", { name: "Pokaż zakres" }).click(),
  );
  const key = { indexName: hit._index, documentId: hit._id };
  let found = await findAlertRow(page, key, firstPage, null, readPage);
  const { row } = found;
  await expect(row).toContainText(`${hit._source.agent.name} (001)`);
  await expect(row).toContainText(hit._source.rule.id);
  await expect(row.locator("time")).toHaveAttribute("datetime", new Date(timestamp).toISOString());
  for (let attempt = 0; attempt < 2; attempt++) {
    const refreshed = await readPage(found.cursor, () =>
      page.getByRole("button", { name: "Odśwież", exact: true }).click(),
    );
    found = await findAlertRow(page, key, refreshed, found.cursor, readPage);
  }

  let rawRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/wazuh/alerts/json?")) rawRequests++;
  });
  const details = page.waitForResponse((response) =>
    response.url().includes("/api/wazuh/alerts/detail?"),
  );
  await found.row.getByRole("button", { name: `Szczegóły alertu ${hit._id}`, exact: true }).click();
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

  await found.row.getByRole("button", { name: `Szczegóły alertu ${hit._id}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Utwórz incydent lub powiąż zgłoszenie" }).click();
  await dialog.getByRole("textbox", { name: "Tytuł" }).fill("Incydent z alertu " + scenario.id);
  const createCase = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/correlation/cases") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Utwórz incydent", exact: true }).click();
  const createdCase = await createCase;
  expect(createdCase.ok(), `Utworzenie incydentu: ${await createdCase.text()}`).toBe(true);
  const { id: caseId } = (await createdCase.json()).data;
  const casePath = "/api/correlation/cases/" + caseId;
  const { data: initialCase } = await api(scenario.analyst.api, casePath);
  expect(initialCase.evidence).toEqual([
    expect.objectContaining({
      alert: expect.objectContaining({ documentId: hit._id }),
    }),
  ]);
  expect((await scenario.employee.api.get(casePath)).status()).toBe(403);

  const csrf = await scenario.employee.api.get("/api/csrf");
  const token = (await csrf.json()).data.token;
  const report = await scenario.employee.api.post("/api/incidents", {
    multipart: { userDescription: "Zgłoszenie do korelacji " + scenario.id },
    headers: { "x-csrf-token": token, origin: new URL(csrf.url()).origin },
  });
  expect(report.ok()).toBe(true);
  const { id: reportId } = (await report.json()).data;
  const reportPath = "/api/correlation/reports/" + reportId;
  const { data: candidates } = await api(
    scenario.analyst.api,
    "/api/correlation/alerts?query=" + encodeURIComponent(hit._id),
  );
  const selected = candidates.find((candidate: AlertKey) => candidate.documentId === hit._id);
  expect(selected).toMatchObject({ ...key, revision, agentId });
  if (Math.abs(Date.now() - timestamp) < 24 * 60 * 60_000 - 60_000) {
    await test.step("Confirming an agent automatically suggests a matching alert", async () => {
      await api(scenario.analyst.api, reportPath + "/asset", {
        sourceId: selected.sourceId,
        agentId,
      });
      await expect
        .poll(async () => (await api(scenario.analyst.api, reportPath)).data.suggestions)
        .toContainEqual(
          expect.objectContaining({
            alert: expect.objectContaining({ agentId }),
            signals: expect.arrayContaining(["asset:" + agentId]),
          }),
        );
    });
  } else {
    test.info().annotations.push({
      type: "historical-alert",
      description: "The live alert is outside the automatic correlation window.",
    });
  }
  const { data: linked } = await api(scenario.analyst.api, "/api/correlation/links", {
    reportId,
    alert: { ...key, revision },
  });
  expect(linked.id).toBe(caseId);
  expect((await api(scenario.analyst.api, reportPath)).data.caseId).toBe(caseId);
  expect((await api(scenario.analyst.api, casePath)).data.evidence).toContainEqual(
    expect.objectContaining({ reportId }),
  );
  await page.keyboard.press("Escape");

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
    await api(page.request, "/api/auth/organization/set-active", {
      organizationId: other.id,
    });
    for (const path of [listPath, detailPath, jsonPath])
      expect((await page.request.get(path)).status()).toBe(403);
    expect((await page.request.get(casePath)).status()).toBe(404);
    await page.reload();
    await page.getByRole("tab", { name: "Alerty Wazuh", exact: true }).click();
    await expect(page.getByText("Organizacja nie ma skonfigurowanego źródła Wazuh.")).toBeVisible();
    await expect(page.getByRole("table", { name: "Alerty Wazuh" })).toHaveCount(0);
  } finally {
    await api(scenario.admin.api, "/api/auth/organization/delete", {
      organizationId: other.id,
    });
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
      json: {
        data: { source: { enabled: true, revision }, refreshSeconds: seconds },
      },
    }),
  );
  await page.route("**/api/wazuh/alerts?*", (route) => {
    requests++;
    if (unavailable)
      return route.fulfill({
        status: 502,
        json: {
          error: { message: "Nie udało się połączyć z Indexerem Wazuh." },
        },
      });
    const secondPage = new URL(route.request().url()).searchParams.get("cursor") === "older";
    const alerts = secondPage
      ? [{ ...entry, documentId: "older", description: "Starszy alert" }]
      : moreAlerts
        ? [
            { ...entry, documentId: "new", description: "Nowy alert" },
            { ...entry, indexName: "wazuh-alerts-other", documentId: "older" },
            entry,
          ]
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
  const readPage = alertPageReader(page, (query) => query.get("revision") === revision);
  const polled = await readPage(null, () => page.clock.fastForward(5_000));
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  expect(requests).toBe(beforePolling + 1);

  const older = await findAlertRow(
    page,
    { indexName: entry.indexName, documentId: "older" },
    polled,
    null,
    readPage,
  );
  await expect(older.row).toContainText("Starszy alert");
  const beforeOlder = requests;
  await page.clock.fastForward(61_000);
  expect(requests).toBe(beforeOlder);
  await page.getByRole("button", { name: "Wróć do aktualnych wyników" }).click();
  await expect(page.getByText("Nowy alert", { exact: true })).toBeVisible();
  await expect(refresh).toBeEnabled();

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const beforeHidden = requests;
  await page.clock.fastForward(61_000);
  expect(requests).toBe(beforeHidden);
  await page.getByRole("tab", { name: "Przypisane do mnie", exact: true }).click();
  await expect(refresh).toHaveCount(0);
  const beforeInactive = requests;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
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
