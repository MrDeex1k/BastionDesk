import { expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { IncidentReportForm } from "../../src/components/IncidentReportForm";
import { renderApp } from "../support/render";
import { network, respond, unexpectedRequests } from "../support/network";

test("INC-UI-01 requires a meaningful description before submitting", async () => {
  const { user } = renderApp(<IncidentReportForm onSuccess={() => {}} />);
  await user.click(await screen.findByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }));
  expect(screen.getByText("Opis jest wymagany.")).toBeVisible();
  await user.type(screen.getByLabelText(/Opis problemu/), "krótki");
  await user.click(screen.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }));
  expect(screen.getByText("Opis jest za krótki. Minimum 10 znaków.")).toBeVisible();
  expect(network).not.toHaveBeenCalled();
});

test("INC-UI-02 submits description and attachment, then clears the form", async () => {
  const submitted = mock(async (request: Request) => {
    const body = await request.formData();
    expect(body.get("userDescription")).toBe("Podejrzany email zawiera link do logowania.");
    const file = body.get("attachment") as File;
    expect(file.name).toBe("evidence.txt");
    expect(await file.text()).toBe("evidence");
    return Response.json({ success: true, data: { id: "incident-a" } }, { status: 201 });
  });
  respond("POST", "/api/incidents", submitted);
  const success = mock(() => {});
  const { user } = renderApp(<IncidentReportForm onSuccess={success} />);
  await user.type(
    await screen.findByLabelText(/Opis problemu/),
    "Podejrzany email zawiera link do logowania.",
  );
  await user.upload(
    screen.getByLabelText(/Załącznik/),
    new File(["evidence"], "evidence.txt", { type: "text/plain" }),
  );
  await user.click(screen.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }));
  expect(await screen.findByText("Sukces!")).toBeVisible();
  expect(screen.getByLabelText(/Opis problemu/)).toHaveValue("");
  expect(success).toHaveBeenCalledTimes(1);
  expect(submitted).toHaveBeenCalledTimes(1);
  expect(unexpectedRequests()).toEqual([]);
});

test("INC-UI-03 preserves the description after server rejection and allows retry", async () => {
  respond("POST", "/api/incidents", () =>
    Response.json({ error: { message: "Plik przekracza limit" } }, { status: 400 }),
  );
  const { user } = renderApp(<IncidentReportForm onSuccess={() => {}} />);
  await user.type(await screen.findByLabelText(/Opis problemu/), "Podejrzany plik w wiadomości.");
  await user.click(screen.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" }));
  expect(await screen.findByText("Plik przekracza limit")).toBeVisible();
  expect(screen.getByLabelText(/Opis problemu/)).toHaveValue("Podejrzany plik w wiadomości.");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "WYŚLIJ ZGŁOSZENIE" })).toBeEnabled(),
  );
});
