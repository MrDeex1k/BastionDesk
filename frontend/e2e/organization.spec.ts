import { test, expect, login } from "./fixtures";

test("ORG-E2E-01 admin adds, changes role and removes a member", async ({ page, scenario }) => {
  const invited = await scenario.register("invited");
  await login(page, scenario.admin);
  await page.getByRole("tab", { name: "Zarządzanie Organizacją" }).click();
  await page.getByLabel("Adres e-mail", { exact: true }).fill(invited.email);
  await page.getByRole("combobox", { name: "Rola w organizacji" }).click();
  await page.getByRole("option", { name: "Analityk", exact: true }).click();
  await page.getByRole("button", { name: "Dodaj istniejącego" }).click();
  const row = page.getByRole("row").filter({ hasText: invited.email });
  await expect(row).toContainText("Analityk");
  await row.getByRole("button", { name: "Otwórz menu" }).click();
  await page.getByRole("menuitem", { name: "Pracownik", exact: true }).click();
  await expect(row).toContainText("Pracownik");
  await row.getByRole("button", { name: "Otwórz menu" }).click();
  await page.getByRole("menuitem", { name: "Usuń z organizacji" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Anuluj" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Otwórz menu" }).click();
  await page.getByRole("menuitem", { name: "Usuń z organizacji" }).click();
  await dialog.getByRole("button", { name: "Usuń", exact: true }).click();
  await expect(row).toHaveCount(0);
});

test("ORG-E2E-02 active organization change isolates visible incidents", async ({
  page,
  scenario,
}) => {
  const { api } = await import("./fixtures");
  const other = await api(scenario.admin.api, "/api/auth/organization/create", {
    name: `Other ${scenario.id}`,
    slug: `other-${scenario.id}`,
  });
  try {
    await api(scenario.admin.api, "/api/auth/organization/set-active", {
      organizationId: other.id,
    });
    await api(scenario.admin.api, "/api/auth/organization/add-member-by-email", {
      email: scenario.employee.email,
      role: "pracownik",
    });
    await login(page, scenario.employee);
    await page.getByLabel(/Opis problemu/).fill(`Tylko pierwsza organizacja ${scenario.id}`);
    await page.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }).click();
    await expect(page.getByText("Sukces!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
    await expect(
      page.getByText(`Tylko pierwsza organizacja ${scenario.id}`, { exact: true }),
    ).toBeVisible();
    // 1.0.3 has no organization switcher: use its public session API, then
    // assert the real browser view after reload (no direct database writes).
    await api(page.request, "/api/auth/organization/set-active", { organizationId: other.id });
    await page.reload();
    await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
    await expect(page.getByText("Brak zgłoszeń do wyświetlenia.")).toBeVisible();
    await expect(
      page.getByText(`Tylko pierwsza organizacja ${scenario.id}`, { exact: true }),
    ).toHaveCount(0);
    await api(page.request, "/api/auth/organization/set-active", {
      organizationId: scenario.organizationId,
    });
    await page.reload();
    await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
    await expect(
      page.getByText(`Tylko pierwsza organizacja ${scenario.id}`, { exact: true }),
    ).toBeVisible();
  } finally {
    await api(scenario.admin.api, "/api/auth/organization/delete", { organizationId: other.id });
    await api(scenario.admin.api, "/api/auth/organization/set-active", {
      organizationId: scenario.organizationId,
    });
  }
});

test("ORG-E2E-03 browser registration with a new organization", async ({ page, scenario }) => {
  const { api } = await import("./fixtures");
  const email = `owner-${scenario.id}@phase1.invalid`;
  const slug = `browser-${scenario.id}`;
  await page.goto("/create-organization");
  await page.getByLabel("Imię i nazwisko").fill("E2E Właściciel");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(scenario.employee.password);
  await page.getByLabel("Nazwa organizacji", { exact: true }).fill(`Browser ${scenario.id}`);
  await page.getByLabel("Skrót organizacji (ID)").fill(slug);
  await page.getByRole("button", { name: "Utwórz organizację" }).click();
  await expect(page.getByText("Organizacja utworzona pomyślnie!", { exact: true })).toBeVisible();
  await page.goto(await scenario.emailLink(email, "/api/auth/verify-email"));
  try {
    await expect(page.getByRole("heading", { name: "Panel Administratorski" })).toBeVisible();
    await page.getByRole("tab", { name: "Zarządzanie Organizacją" }).click();
    await expect(page.getByRole("row").filter({ hasText: email })).toContainText("Administrator");
  } finally {
    const organizations = await api(page.request, "/api/auth/organization/list");
    const created = organizations.find(
      (organization: { slug: string }) => organization.slug === slug,
    );
    if (created)
      await api(page.request, "/api/auth/organization/delete", { organizationId: created.id });
  }
});
