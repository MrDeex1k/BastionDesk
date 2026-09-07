import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { useAuth } from "../../src/hooks/useAuth";
import { organization } from "../../src/lib/auth-client";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

// A consumer exercises the real provider and Better Auth HTTP boundary.
function MembershipProbe() {
  const auth = useAuth();
  return (
    <>
      <output aria-label="Aktywna organizacja">
        {auth.isLoading ? "Ładowanie" : `${auth.organizationId}:${auth.role}`}
      </output>
      <output aria-label="Sesja">{auth.session?.session.id ?? "Brak sesji"}</output>
      <button onClick={() => auth.refetch()}>Odśwież sesję</button>
      <button
        onClick={async () => {
          await organization.setActive({ organizationId: "org-b" });
          await auth.refetch();
        }}
      >
        Przełącz organizację
      </button>
    </>
  );
}
test("ORG-UI-01 switching organization reloads its membership and role", async () => {
  let activeOrganizationId = "org-a";
  const user = {
    id: "member-user",
    email: "member@example.invalid",
    name: "Member",
    emailVerified: true,
    createdAt: "2026-09-04T11:00:00Z",
    updatedAt: "2026-09-04T11:00:00Z",
  };
  respond("GET", "/api/auth/get-session", () =>
    Response.json({
      user,
      session: {
        id: "session-switch",
        userId: user.id,
        token: "test-only",
        activeOrganizationId,
        expiresAt: "2026-09-11T11:00:00Z",
      },
    }),
  );
  respond("GET", "/api/auth/organization/get-active-member", () =>
    Response.json({
      id: `member-${activeOrganizationId}`,
      organizationId: activeOrganizationId,
      role: activeOrganizationId === "org-a" ? "admin" : "pracownik",
    }),
  );
  respond("POST", "/api/auth/organization/set-active", async (request) => {
    activeOrganizationId = (await request.json()).organizationId;
    return Response.json({ id: activeOrganizationId });
  });
  const { user: interaction } = renderApp(
    <AuthProvider>
      <MembershipProbe />
    </AuthProvider>,
  );
  expect(await screen.findByText("org-a:admin")).toBeVisible();
  await interaction.click(screen.getByRole("button", { name: "Przełącz organizację" }));
  expect(await screen.findByText("org-b:pracownik")).toBeVisible();
  expect(screen.queryByText("org-a:admin")).toBeNull();
});

test("ORG-UI-03 losing an authenticated session clears its organization and role", async () => {
  respond("GET", "/api/auth/get-session", () =>
    Response.json({
      user: {
        id: "member-user",
        email: "member@example.invalid",
        name: "Member",
        emailVerified: true,
        createdAt: "2026-09-04T11:00:00Z",
        updatedAt: "2026-09-04T11:00:00Z",
      },
      session: {
        id: "session-expiring",
        userId: "member-user",
        token: "test-only",
        activeOrganizationId: "org-b",
        expiresAt: "2026-09-11T11:00:00Z",
      },
    }),
  );
  respond("GET", "/api/auth/organization/get-active-member", () =>
    Response.json({ id: "member-org-b", organizationId: "org-b", role: "pracownik" }),
  );
  const { user } = renderApp(
    <AuthProvider>
      <MembershipProbe />
    </AuthProvider>,
  );
  expect(await screen.findByText("org-b:pracownik")).toBeVisible();
  expect(screen.getByLabelText("Sesja")).toHaveTextContent("session-expiring");

  respond("GET", "/api/auth/get-session", () => Response.json(null));
  await user.click(screen.getByRole("button", { name: "Odśwież sesję" }));

  expect(await screen.findByText("null:null")).toBeVisible();
  expect(screen.getByLabelText("Sesja")).toHaveTextContent("Brak sesji");
  expect(screen.queryByText("org-b:pracownik")).toBeNull();
});
