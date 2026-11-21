import { expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { WazuhAlerts } from "../../src/components/WazuhAlerts";
import { WazuhSourceForm } from "../../src/components/WazuhSourceForm";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

test("repeated Wazuh reads replace the table snapshot and the level changes the query", async () => {
  const date = new Date("2026-11-21T15:06:03.745Z");
  const filters: (string | null)[] = [];
  const views = new Set<string>();
  const alert = {
    documentId: "one",
    indexName: "wazuh-alerts-test",
    agentId: "001",
    agentName: "Ubuntu",
    timestamp: date.toISOString(),
    ruleId: "510",
    ruleLevel: 7,
    description: "Testowy alert",
  };
  respond("GET", "/api/wazuh/source", () =>
    Response.json({ data: { source: { enabled: true, revision: "test" }, refreshSeconds: 0 } }),
  );
  respond("GET", "/api/wazuh/alerts", (request) => {
    const query = new URL(request.url).searchParams;
    expect(query.get("organizationId")).toBe("org");
    expect(query.get("view")).not.toBeNull();
    views.add(query.get("view")!);
    const level = query.get("level");
    filters.push(level);
    return Response.json({
      data: { alerts: level === null || level === "7" ? [alert] : [] },
    });
  });
  const { user } = renderApp(<WazuhAlerts />, {
    role: "analityk",
    organizationId: "org",
    session: {
      session: { id: "test-session", userId: "admin", token: "fixture", expiresAt: date },
      user: {
        id: "admin",
        email: "admin@example.test",
        name: "Admin",
        emailVerified: true,
        createdAt: date,
        updatedAt: date,
      },
    },
  });
  await screen.findByText("Testowy alert");
  const refresh = screen.getByRole("button", { name: "Odśwież" });
  await user.click(refresh);
  await waitFor(() => {
    expect(filters).toEqual([null, null]);
    expect(refresh).toBeEnabled();
  });
  expect(within(screen.getByRole("table")).getAllByText("Testowy alert")).toHaveLength(1);
  await user.selectOptions(screen.getByRole("combobox", { name: "Poziom reguły" }), "8");
  expect(await screen.findByText("Brak alertów dla wybranych filtrów.")).toBeVisible();
  expect(filters).toEqual([null, null, "8"]);
  expect(views.size).toBe(1);
});

test("the Wazuh source form sends the displayed revision and can reload after a conflict", async () => {
  const revision = crypto.randomUUID();
  const reload = mock(async () => {});
  respond("PUT", "/api/wazuh/source", async (request) => {
    expect(await request.json()).toEqual({
      revision,
      origin: "https://indexer.example.test",
      username: "reader",
    });
    return Response.json(
      { error: { code: "WAZUH_STALE", message: "Źródło Wazuh uległo zmianie." } },
      { status: 409 },
    );
  });
  const { user } = renderApp(
    <WazuhSourceForm
      organizationId="org"
      status={{
        source: { enabled: true, revision },
        refreshSeconds: 60,
        settings: { origin: "https://indexer.example.test", username: "reader", ca: null },
      }}
      onChange={reload}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Zapisz i włącz" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Źródło Wazuh uległo zmianie.");
  expect(reload).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Wczytaj aktualną konfigurację" }));
  expect(reload).toHaveBeenCalledTimes(1);
});
