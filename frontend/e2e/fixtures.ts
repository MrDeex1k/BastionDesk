import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export interface Identity {
  email: string;
  password: string;
  name: string;
  api: APIRequestContext;
}
export interface Scenario {
  id: string;
  organizationId: string;
  admin: Identity;
  employee: Identity;
  analyst: Identity;
  register: (label: string, verify?: boolean) => Promise<Identity>;
  emailLink: (email: string, fragment: string) => Promise<string>;
  login: (page: Page, identity: Identity) => Promise<void>;
}

export async function api(
  context: APIRequestContext,
  path: string,
  data?: unknown,
  method = data === undefined ? "GET" : "POST",
) {
  const tokenResponse = await context.get("/api/csrf");
  expect(tokenResponse.status(), "CSRF bootstrap").toBe(200);
  const token = (await tokenResponse.json()).data.token;
  const response = await context.fetch(path, {
    method,
    data,
    headers: { "x-csrf-token": token, origin: new URL(tokenResponse.url()).origin },
  });
  expect(response.ok(), `${method} ${path}: HTTP ${response.status()}`).toBe(true);
  return response.json();
}

export async function login(page: Page, identity: Identity) {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail", { exact: true }).fill(identity.email);
  await page.getByRole("button", { name: "Dalej", exact: true }).click();
  await page.getByLabel("Hasło", { exact: true }).fill(identity.password);
  await page.getByRole("main").getByRole("button", { name: "Zaloguj się", exact: true }).click();
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({ playwright, baseURL }, use) => {
    const mailpit = process.env.E2E_MAILPIT_URL;
    if (!mailpit || !baseURL)
      throw new Error(
        "Use bun run test:e2e, or set E2E_BASE_URL and E2E_MAILPIT_URL for a disposable stack.",
      );
    const id = `e2e-${randomUUID()}`;
    const clients: APIRequestContext[] = [];
    let admin: Identity | undefined;
    let organizationId: string | undefined;
    const mailbox = await playwright.request.newContext({ baseURL: mailpit });
    async function emailLink(email: string, fragment: string) {
      let link: string | undefined;
      await expect
        .poll(
          async () => {
            const response = await mailbox.get(
              `/view/latest.html?query=${encodeURIComponent(`to:${email}`)}`,
            );
            const html = await response.text();
            link = [...html.matchAll(/href=["']([^"']+)["']/gi)]
              .map((match) => match[1]?.replaceAll("&amp;", "&"))
              .find((value) => value?.includes(fragment));
            return Boolean(link);
          },
          { message: "Test SMTP captured the requested email", timeout: 15_000 },
        )
        .toBe(true);
      if (!link || new URL(link).origin !== new URL(baseURL!).origin)
        throw new Error("Email link outside the test application");
      return link;
    }
    async function register(label: string, verify = true): Promise<Identity> {
      const client = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: { origin: baseURL! },
      });
      clients.push(client);
      const identity = {
        email: `${label}-${id}@phase1.invalid`,
        password: `Bastion-${randomUUID()}-9!`,
        name: `E2E ${label}`,
        api: client,
      };
      const organization =
        label === "admin" ? { organizationName: `E2E ${id}`, organizationSlug: id } : {};
      await api(
        client,
        label === "admin" ? "/api/auth/sign-up-with-organization/email" : "/api/auth/sign-up/email",
        {
          email: identity.email,
          password: identity.password,
          name: identity.name,
          ...organization,
        },
      );
      if (verify) {
        const link = await emailLink(identity.email, "/api/auth/verify-email");
        const response = await client.get(link, { maxRedirects: 0 });
        expect([200, 302, 303]).toContain(response.status());
        await api(client, "/api/auth/sign-in/email", {
          email: identity.email,
          password: identity.password,
        });
      }
      return identity;
    }
    try {
      admin = await register("admin");
      const organizations = await api(admin.api, "/api/auth/organization/list");
      organizationId = organizations.find(
        (organization: { slug: string }) => organization.slug === id,
      )?.id;
      await api(admin.api, "/api/auth/organization/set-active", { organizationId });
      expect(typeof organizationId).toBe("string");
      const employee = await register("employee");
      const analyst = await register("analyst");
      for (const [identity, role] of [
        [employee, "pracownik"],
        [analyst, "analityk"],
      ] as const) {
        await api(admin.api, "/api/auth/organization/add-member-by-email", {
          email: identity.email,
          role,
        });
        await api(identity.api, "/api/auth/organization/set-active", { organizationId });
      }
      await use({
        id,
        organizationId: organizationId!,
        admin,
        employee,
        analyst,
        register,
        emailLink,
        login,
      });
    } finally {
      try {
        if (admin && organizationId)
          await api(admin.api, "/api/auth/organization/delete", { organizationId });
      } finally {
        await Promise.all(clients.map((client) => client.dispose()));
        await mailbox.dispose();
      }
    }
  },
});
export { expect };
