import { expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { AlertTriage, ReportTriage } from "../../src/components/correlation/Triage";
import { Cases } from "../../src/components/correlation/Cases";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

const date = new Date("2026-11-21T15:06:03.745Z");
const analyst = {
  id: "analyst",
  name: "A",
  email: "a@example.test",
  emailVerified: true,
  createdAt: date,
  updatedAt: date,
};
const auth = {
  role: "analityk" as const,
  organizationId: "org",
  user: analyst,
  session: {
    session: { id: "session", userId: "analyst", token: "fixture", expiresAt: date },
    user: analyst,
  },
};
const reference = { revision: "rev", indexName: "wazuh-alerts", documentId: "alert-42" };
const alert = {
  ...reference,
  sourceId: "source",
  description: "Alert testowy",
  ruleLevel: 7,
  ruleId: "100",
  agentName: "Host",
  agentId: "001",
  timestamp: date.toISOString(),
};
const matchedCase = {
  id: "test-case",
  title: "Incydent testowy",
  createdAt: date.toISOString(),
  status: "open",
  analystId: "analyst",
  riskScore: 0,
  riskLevel: "low",
  riskReasons: [],
  pendingRiskUpdate: false,
};
const reply = (data: unknown) => Response.json({ success: true, data });

for (const entry of ["report", "alert"] as const) {
  test(
    "manual pairing from " + entry + " sends both evidence references and opens the linked case",
    async () => {
      respond("GET", "/api/correlation/alert-case", () => reply({ caseId: null }));
      respond("GET", "/api/correlation/reports/report-1", () =>
        reply({ caseId: null, suggestions: [], asset: null }),
      );
      respond("GET", "/api/correlation/reports", () =>
        reply([{ id: "report-1", description: "Zgłoszenie", createdAt: date.toISOString() }]),
      );
      respond("GET", "/api/correlation/alerts", () => reply([alert]));
      respond("POST", "/api/correlation/links", async (req) => {
        expect(req.headers.get("X-CSRF-Token")).toBe("component-csrf");
        expect(await req.json()).toEqual({ reportId: "report-1", alert: reference });
        return reply({ id: "test-case" });
      });
      respond("GET", "/api/correlation/cases/test-case", () => reply(matchedCase));
      const report = entry === "report";
      const { user } = renderApp(
        report ? (
          <ReportTriage reportId="report-1" />
        ) : (
          <AlertTriage alert={alert} revision="rev" />
        ),
        auth,
      );
      await user.click(
        await screen.findByRole("button", {
          name: report ? "Korelacja z alertami Wazuh" : /Utwórz incydent/,
        }),
      );
      const field = await screen.findByRole("searchbox", {
        name: report ? "Wyszukaj alert do powiązania" : "Powiąż istniejące zgłoszenie",
      });
      await user.click(within(field.closest("form")!).getByRole("button", { name: "Szukaj" }));
      await user.click(await screen.findByRole("button", { name: "Wybierz" }));
      expect(await screen.findByText("Incydent testowy")).toBeVisible();
      expect(await screen.findByRole("heading", { name: /Ryzyko · Niskie \(0\)/ })).toBeVisible();
    },
  );
}
test("the queue opts into numeric sorting and keeps risk labels descriptive", async () => {
  const sorts: (string | null)[] = [];
  respond("GET", "/api/correlation/cases", (req) => {
    const sort = new URL(req.url).searchParams.get("sort");
    sorts.push(sort);
    const unrated = {
      ...matchedCase,
      title: "Bez danych",
      id: "unrated",
      riskScore: null,
      riskLevel: null,
    };
    return reply({
      items: sort === "risk" ? [matchedCase, unrated] : [unrated, matchedCase],
      nextCursor: null,
    });
  });
  const { user } = renderApp(<Cases />, auth);
  await screen.findByRole("heading", { name: "Bez danych" });
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Bez danych");
  await user.click(screen.getByRole("checkbox", { name: /Sortuj/ }));
  await screen.findByText(/Otwarty · Niskie/);
  expect(sorts).toEqual(["recent", "risk"]);
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Incydent testowy");
  expect(screen.getByText(/Brak oceny/)).toBeVisible();
});

test("the queue pages and only fetches history when opened", async () => {
  const paths: (string | null)[] = [];
  respond("GET", "/api/correlation/cases", (req) => {
    const query = new URL(req.url).searchParams;
    paths.push(query.get("cursor"));
    if (query.get("cursor")) return reply({ items: [matchedCase], nextCursor: null });
    return reply({ items: [], nextCursor: "next" });
  });
  respond("GET", "/api/correlation/cases/test-case", () => reply(matchedCase));
  let historyReads = 0;
  respond("GET", "/api/correlation/cases/test-case/history", (req) => {
    historyReads++;
    expect(new URL(req.url).searchParams.get("kind")).toBe("operations");
    return reply({
      items: [{ id: "1", action: "created", actorId: "analyst", createdAt: date.toISOString() }],
      nextCursor: null,
    });
  });
  const { user } = renderApp(<Cases />, auth);
  await user.selectOptions(await screen.findByLabelText("Status"), "open");
  await user.click(await screen.findByRole("button", { name: "Następna strona" }));
  expect(paths.at(-1)).toBe("next");
  await user.click(await screen.findByRole("button", { name: "Otwórz incydent" }));
  await screen.findByText("Incydent testowy");
  expect(historyReads).toBe(0);
  await user.click(screen.getByText("Historia incydentu"));
  expect(await screen.findByText("created · analyst")).toBeVisible();
  expect(historyReads).toBe(1);
});
