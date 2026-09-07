import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { IncidentDetails } from "../../src/components/IncidentDetails";
import type { IncidentDetail } from "../../src/ApiModel";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

const incident: IncidentDetail = {
  id: "incident-a",
  organizationId: "org-a",
  userId: "employee-a",
  dataZgloszenia: "2026-09-04T11:00:00Z",
  status: "Raport w trakcie",
  userDescription: "Podejrzana wiadomość od dostawcy.",
  czyRozwiazany: false,
  analystId: "analyst-a",
  analystNote: "Notatka analityka",
};
const analyst = {
  id: "analyst-a",
  email: "analyst@example.invalid",
  name: "Analityk",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
for (const mode of ["employee", "admin", "analyst"] as const) {
  test(`RBAC-UI-${mode} limits workflow actions to the assigned analyst`, async () => {
    const endpoint =
      mode === "employee" ? "/api/incidents/incident-a" : `/api/${mode}/incidents/incident-a`;
    respond("GET", endpoint, () => Response.json({ success: true, data: incident }));
    renderApp(<IncidentDetails incidentId="incident-a" mode={mode} onBack={() => {}} />, {
      user: analyst,
    });
    expect(await screen.findByText(incident.userDescription)).toBeVisible();
    const report = screen.queryByRole("button", { name: "Złóż raport" });
    if (mode === "analyst") {
      expect(report).toBeEnabled();
      expect(screen.getByRole("textbox", { name: "Notatki analityka" })).toHaveValue(
        "Notatka analityka",
      );
    } else {
      expect(report).toBeNull();
      expect(screen.queryByRole("textbox", { name: "Notatki analityka" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Oznacz jako rozwiązane" })).toBeNull();
    }
  });
}

test("RBAC-UI-04 another analyst cannot edit or resolve an assigned incident", async () => {
  respond("GET", "/api/analyst/incidents/incident-a", () =>
    Response.json({ success: true, data: incident }),
  );
  renderApp(<IncidentDetails incidentId="incident-a" mode="analyst" onBack={() => {}} />, {
    user: { ...analyst, id: "analyst-b" },
  });
  await screen.findByText(incident.userDescription);
  expect(screen.queryByRole("button", { name: "Złóż raport" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Oznacz jako rozwiązane" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Notatki analityka" })).toBeNull();
});

test("INC-UI-04 inaccessible incident offers navigation back", async () => {
  respond("GET", "/api/incidents/incident-a", () =>
    Response.json({ error: { code: "INCIDENT_NOT_FOUND" } }, { status: 404 }),
  );
  renderApp(<IncidentDetails incidentId="incident-a" onBack={() => {}} />);
  expect(await screen.findByRole("heading", { name: "Błąd pobierania danych" })).toBeVisible();
  expect(screen.queryByText(incident.userDescription)).toBeNull();
});
