import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("URLhaus checks the URL indicator and distinguishes a match from feed failure", async () => {
  const url = "https://sample.example/payload";
  respond("GET", "/api/analyst/incidents/incident-a", () =>
    Response.json({
      success: true,
      data: {
        ...incident,
        urlhaus: true,
        indicators: [{ kind: "url", value: url, fields: ["userDescription"] }],
      },
    }),
  );
  const path = "/api/analyst/incidents/incident-a/urlhaus";
  respond("POST", path, async (request) => {
    expect(await request.json()).toEqual({ url });
    return Response.json({
      success: true,
      data: {
        provider: "urlhaus",
        status: "matched",
        fetchedAt: "2026-09-04T11:00:00Z",
        expiresAt: "2026-09-04T11:10:00Z",
      },
    });
  });
  renderApp(<IncidentDetails incidentId="incident-a" mode="analyst" onBack={() => {}} />, {
    user: analyst,
  });
  const user = userEvent.setup();
  const check = await screen.findByRole("button", { name: "Sprawdź w URLhaus" });
  await user.click(check);
  expect(await screen.findByText("Adres jest w wykazie URLhaus.")).toBeVisible();
  expect(screen.getByText(/Wykaz pobrano/)).toBeVisible();

  respond("POST", path, () =>
    Response.json({ success: true, data: { provider: "urlhaus", status: "unavailable" } }),
  );
  await user.click(check);
  expect(await screen.findByText("Nie udało się pobrać aktualnego wykazu URLhaus.")).toBeVisible();
  expect(screen.queryByText(/Wykaz pobrano/)).toBeNull();
});

test("new incident shows background checks and keeps the failed provider's retry visible but disabled", async () => {
  const value = "a".repeat(64);
  const current = new Date().toISOString();
  const retryAt = new Date(Date.now() + 60_000).toISOString();
  const file = { kind: "sha256", value };
  respond("GET", "/api/analyst/incidents/incident-a", () =>
    Response.json({
      success: true,
      data: {
        ...incident,
        indicators: [{ ...file, fields: ["userAttachmentMetadata.contentHash"] }],
        lookupProviders: ["otx", "hybrid_analysis", "virustotal"],
        enrichmentChecks: [
          { ...file, provider: "otx", result: null, retryAt: null },
          {
            ...file,
            provider: "hybrid_analysis",
            result: { provider: "hybrid_analysis", status: "unavailable" },
            retryAt,
          },
          {
            ...file,
            provider: "virustotal",
            result: {
              provider: "virustotal",
              status: "not_found",
              fetchedAt: current,
              expiresAt: current,
            },
            retryAt,
          },
        ],
      },
    }),
  );
  renderApp(<IncidentDetails incidentId="incident-a" mode="analyst" onBack={() => {}} />, {
    user: analyst,
  });
  expect(await screen.findByText("LevelBlue OTX · Sprawdzanie w tle…")).toBeVisible();
  expect(screen.getByRole("button", { name: "Ponów w Hybrid Analysis" })).toBeDisabled();
  expect(screen.getByText("VirusTotal · Brak raportu dla tego SHA-256.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /w VirusTotal/ })).toBeNull();
});
