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

test("AUTH-E2E-04 register and use a persisted PassKey through the auth gateway", async ({
  page,
  context,
  browserName,
  scenario,
}) => {
  test.skip(browserName !== "chromium", "Virtual WebAuthn authenticator uses Chromium CDP");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await login(page, scenario.employee);
  await expect(page.getByRole("heading", { name: "Panel Pracownika" })).toBeVisible();
  await page.getByRole("button", { name: "Ustawienia", exact: true }).click();
  const registration = page.waitForResponse((response) =>
    response.url().includes("/passkey/verify-registration"),
  );
  await page.getByRole("button", { name: "Dodaj klucz" }).click();
  expect((await registration).status()).toBe(200);
  await expect(page.getByText("Klucz PassKey został dodany", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Wyloguj/ }).click();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Zaloguj się", exact: true }),
  ).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Adres e-mail", { exact: true }).fill(scenario.employee.email);
  await page.getByRole("button", { name: "Dalej", exact: true }).click();
  await page.getByRole("button", { name: "Zaloguj używając PassKey" }).click();
  await expect(page.getByRole("heading", { name: "Panel Pracownika" })).toBeVisible();
  expect((await page.request.get("/api/auth/token")).status()).toBe(404);
  const session = await page.request.get("/api/auth/get-session");
  expect(session.headers()["set-auth-jwt"]).toBeUndefined();
  await cdp.detach();
});

test("AUTH-E2E-05 gateway rejects forged browser identity and missing CSRF", async ({
  scenario,
  request,
  baseURL,
}) => {
  const forged = { authorization: "Bearer attacker", "x-user-id": "admin", "x-user-role": "admin" };
  expect((await request.get("/api/admin/incidents", { headers: forged })).status()).toBe(401);
  expect(
    (await scenario.employee.api.get("/api/admin/incidents", { headers: forged })).status(),
  ).toBe(403);
  expect(
    (
      await scenario.employee.api.post("/api/incidents", {
        data: { userDescription: "Rejected mutation" },
        headers: { origin: baseURL! },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await scenario.employee.api.get("/api/incidents", {
        headers: { origin: "https://attacker.invalid" },
      })
    ).status(),
  ).toBe(403);
});
