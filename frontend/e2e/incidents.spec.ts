import { readFile } from "node:fs/promises";
import { test, expect, login } from "./fixtures";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
test("INC-E2E-01 employee report → analyst notes and documents → employee download → admin", async ({
  page,
  context,
  scenario,
}) => {
  const description = `Podejrzany załącznik w poczcie ${scenario.id}`;
  await login(page, scenario.employee);
  await expect(page.getByRole("heading", { name: "Panel Pracownika" })).toBeVisible();
  await page.getByLabel(/Opis problemu/).fill("krótki");
  await page.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }).click();
  await expect(page.getByText(/Minimum 10 znaków/)).toBeVisible();
  await page.getByLabel(/Opis problemu/).fill(description);
  await page.getByLabel(/Załącznik/).setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(description),
  });
  await page.getByLabel(/Zrzut ekranu/).setInputFiles({
    name: "screen.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS2kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }).click();
  await expect(page.getByText("Sukces!", { exact: true })).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/incidents/my");
        const body = await response.json();
        return body.data?.find(
          (incident: { userDescription: string }) => incident.userDescription === description,
        )?.llmCategory;
      },
      { timeout: 20000 },
    )
    .toBe("Żółty");
  await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
  await page.getByRole("button").filter({ hasText: description }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Przypisz do mnie" })).toHaveCount(0);
  await context.clearCookies();
  await login(page, scenario.analyst);
  await page.getByRole("tab", { name: "Nieprzypisane", exact: true }).click();
  await page.getByRole("button").filter({ hasText: description }).click();
  await page.getByRole("button", { name: "Przypisz do mnie" }).click();
  await expect(page.getByText("Raport w trakcie", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Notatki analityka" })
    .fill("Potwierdzono próbę phishingu.");
  await page.getByRole("button", { name: /Zapisz notat/ }).click();
  await expect(page.getByText("Notatka została zapisana", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Zapisz notat/ })).toBeDisabled();
  await page.reload();
  await page.getByRole("button").filter({ hasText: description }).click();
  await expect(page.getByRole("textbox", { name: "Notatki analityka" })).toHaveValue(
    "Potwierdzono próbę phishingu.",
  );
  await page.getByRole("button", { name: "Złóż raport", exact: true }).click();
  await page
    .getByLabel("Plik", { exact: true })
    .setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Wyślij raport", exact: true }).click();
  await expect(page.getByText("Raport złożony", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rozpocznij sprawozdanie" }).click();
  await page.getByRole("button", { name: "Zakończ zgłoszenie", exact: true }).click();
  await page
    .getByLabel("Plik", { exact: true })
    .setInputFiles({ name: "statement.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Wyślij sprawozdanie", exact: true }).click();
  await expect(page.getByText("Sprawozdanie złożone", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Oznacz jako rozwiązane" }).click();
  await expect(page.getByRole("button", { name: "Rozwiązano", exact: true })).toBeDisabled();
  await context.clearCookies();
  await login(page, scenario.employee);
  await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
  await page.getByRole("button").filter({ hasText: description }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Pobierz report/ }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("report.pdf");
  expect(await readFile((await download.path())!)).toEqual(pdf);
  await context.clearCookies();
  await login(page, scenario.admin);
  await expect(page.getByRole("heading", { name: "Panel Administratorski" })).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
});

test("INC-E2E-02 unavailable LLM keeps the incident accessible", async ({ page, scenario }) => {
  const description = `[LLM_UNAVAILABLE] Zgłoszenie podczas awarii ${scenario.id}`;
  await login(page, scenario.employee);
  await page.getByLabel(/Opis problemu/).fill(description);
  await page.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }).click();
  await expect(page.getByText("Sukces!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pokaż moje zgłoszenia" }).click();
  await page.getByRole("button").filter({ hasText: description }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
});
