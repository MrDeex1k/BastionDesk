import { test, expect, login } from "./fixtures";

test("AUTH-E2E-01 login, role redirect, reload and logout", async ({ page, scenario }) => {
  await page.goto("/admin-dashboard");
  await expect(page).toHaveURL(/\/login/);
  await login(page, { ...scenario.employee, password: "Wrong-password-123!" });
  await expect(page.getByLabel("Hasło", { exact: true })).toBeVisible();
  await expect(page.getByText(/Invalid email or password|Nieprawidłow/i).first()).toBeVisible();
  await page.getByLabel("Hasło", { exact: true }).fill(scenario.employee.password);
  await page.getByRole("main").getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Panel Pracownika" })).toBeVisible();
  await page.goto("/admin-dashboard");
  await expect(page).toHaveURL(/\/employee-dashboard/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Panel Pracownika" })).toBeVisible();
  await page.getByRole("button", { name: /Wyloguj/ }).click();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Zaloguj się", exact: true }),
  ).toBeVisible();
  await page.goto("/employee-dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("AUTH-E2E-02 browser registration, email verification and missing organization", async ({
  page,
  scenario,
}) => {
  const email = `browser-${scenario.id}@phase1.invalid`;
  await page.goto("/register");
  await page.getByLabel("Imię i nazwisko").fill("E2E Nowy Użytkownik");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(scenario.employee.password);
  await page.getByRole("button", { name: "Utwórz konto" }).click();
  await expect(page.getByText("Rejestracja zakończona pomyślnie!", { exact: true })).toBeVisible();
  const link = await scenario.emailLink(email, "/api/auth/verify-email");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Witaj w BastionDesk" })).toBeVisible();
  await page.goto("/employee-dashboard");
  await expect(page).toHaveURL(/\/waiting-for-organization/);
  await expect(page.getByText(/organizacj/i).first()).toBeVisible();
});

test("AUTH-E2E-03 password reset through captured email", async ({ page, scenario }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Adres e-mail").fill(scenario.employee.email);
  await page.getByRole("button", { name: "Wyślij link resetujący" }).click();
  await expect(page.getByText(/otrzymasz link do resetu/)).toBeVisible();
  await page.goto(await scenario.emailLink(scenario.employee.email, "/api/auth/reset-password/"));
  const nextPassword = `Changed-${scenario.employee.password}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(nextPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(nextPassword);
  await page.getByRole("button", { name: /Zmień hasło|Zapisz/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, { ...scenario.employee, password: nextPassword });
  await expect(page.getByRole("heading", { name: "Panel Pracownika" })).toBeVisible();
});
