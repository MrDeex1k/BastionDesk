import { expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { AdminOrganizationManagement } from "../../src/components/AdminOrganizationManagement";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

test("ORG-UI-02 admin can select a role and see the added member", async () => {
  let added = false;
  respond("GET", "/api/auth/organization/list-members", () =>
    Response.json({
      members: added
        ? [
            {
              id: "member-a",
              userId: "user-a",
              role: "analityk",
              createdAt: "2026-09-04T11:00:00Z",
              user: { name: "Nowy Analityk", email: "new@example.invalid" },
            },
          ]
        : [],
    }),
  );
  respond("POST", "/api/auth/organization/add-member-by-email", async (request) => {
    expect(await request.json()).toEqual({ email: "new@example.invalid", role: "analityk" });
    added = true;
    return Response.json({ success: true });
  });
  const { user } = renderApp(<AdminOrganizationManagement />);
  await user.type(await screen.findByLabelText("Adres e-mail"), "new@example.invalid");
  await user.click(screen.getByRole("combobox", { name: "Rola w organizacji" }));
  await user.click(await screen.findByRole("option", { name: "Analityk" }));
  await user.click(screen.getByRole("button", { name: "Dodaj istniejącego" }));
  expect(await screen.findByText("Nowy Analityk")).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText("Adres e-mail")).toHaveValue(""));
});
