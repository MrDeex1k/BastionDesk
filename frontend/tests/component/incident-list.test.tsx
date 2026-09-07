import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { MyIncidentsList } from "../../src/components/MyIncidentsList";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

test("INC-UI-05 empty list distinguishes no reports from a loading failure", async () => {
  respond("GET", "/api/incidents/my", () =>
    Response.json({ data: [], pagination: { page: 1, totalPages: 0 } }),
  );
  renderApp(<MyIncidentsList />);
  expect(await screen.findByText("Brak zgłoszeń do wyświetlenia.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Następna" })).toBeNull();
});
test("INC-UI-06 list failure shows an error", async () => {
  respond("GET", "/api/incidents/my", () => Response.json({}, { status: 503 }));
  renderApp(<MyIncidentsList />);
  expect(await screen.findByText("Wystąpił błąd podczas pobierania zgłoszeń.")).toBeVisible();
  expect(screen.queryByText("Brak zgłoszeń do wyświetlenia.")).toBeNull();
});
test("INC-UI-07 pagination replaces visible reports and respects boundaries", async () => {
  respond("GET", "/api/incidents/my", (request) => {
    const page = Number(new URL(request.url).searchParams.get("page"));
    return Response.json({
      data: [
        {
          id: `id-${page}`,
          userId: "employee",
          userDescription: `Zgłoszenie strony ${page}`,
          status: "Zgłoszony",
          dataZgloszenia: "2026-09-04T11:00:00Z",
        },
      ],
      pagination: { page, totalPages: 2, total: 6 },
    });
  });
  const { user } = renderApp(<MyIncidentsList />);
  await screen.findByText("Zgłoszenie strony 1");
  expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Następna" }));
  expect(await screen.findByText("Zgłoszenie strony 2")).toBeVisible();
  expect(screen.queryByText("Zgłoszenie strony 1")).toBeNull();
  expect(screen.getByRole("button", { name: "Następna" })).toBeDisabled();
});
