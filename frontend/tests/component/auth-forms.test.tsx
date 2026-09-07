import { expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import { LoginForm } from "../../src/components/LoginForm";
import { ForgotPasswordForm } from "../../src/components/ForgotPasswordForm";
import { RegisterForm } from "../../src/components/RegisterForm";
import { renderApp } from "../support/render";
import { respond } from "../support/network";

const loginProps = { onBack: () => {}, onForgotPassword: () => {}, onLoginSuccess: async () => {} };
test("AUTH-UI-01 rejected login shows the server error and keeps the email", async () => {
  respond("POST", "/api/auth/passkey/check-availability", () =>
    Response.json({ hasPasskeys: false }),
  );
  respond("POST", "/api/auth/sign-in/email", () =>
    Response.json({ message: "Nieprawidłowe dane logowania" }, { status: 401 }),
  );
  const { user } = renderApp(<LoginForm {...loginProps} />);
  await user.type(await screen.findByLabelText("Adres e-mail"), "employee@example.invalid");
  await user.click(screen.getByRole("button", { name: "Dalej" }));
  await user.type(await screen.findByLabelText("Hasło"), "Wrong-password-9!");
  await user.click(screen.getByRole("button", { name: "Zaloguj się" }));
  expect(await screen.findByText("Nieprawidłowe dane logowania")).toBeVisible();
  expect(screen.getByText("employee@example.invalid")).toBeVisible();
});

test("AUTH-UI-02 unavailable passkey discovery falls back to password", async () => {
  respond("POST", "/api/auth/passkey/check-availability", () => Response.json({}, { status: 503 }));
  const { user } = renderApp(<LoginForm {...loginProps} />);
  await user.type(await screen.findByLabelText("Adres e-mail"), "employee@example.invalid");
  await user.click(screen.getByRole("button", { name: "Dalej" }));
  expect(await screen.findByLabelText("Hasło")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Zmień" }));
  expect(screen.getByLabelText("Adres e-mail")).toHaveValue("employee@example.invalid");
});

test("AUTH-UI-03 password reset uses the current contract and confirms the request", async () => {
  respond("POST", "/api/auth/request-password-reset", async (request) => {
    expect(await request.json()).toEqual({
      email: "employee@example.invalid",
      redirectTo: "http://localhost:4567/reset-password",
    });
    return Response.json({ status: true });
  });
  const { user } = renderApp(<ForgotPasswordForm onBack={() => {}} />);
  await user.type(await screen.findByLabelText("Adres e-mail"), "employee@example.invalid");
  await user.click(screen.getByRole("button", { name: "Wyślij link resetujący" }));
  expect(await screen.findByText(/w ciągu paru minut otrzymasz link/)).toBeVisible();
  expect(screen.getByLabelText("Adres e-mail")).toHaveValue("");
});

test("AUTH-UI-04 reset failure preserves input and supports returning to login", async () => {
  respond("POST", "/api/auth/request-password-reset", () =>
    Response.json({ message: "Spróbuj ponownie później" }, { status: 429 }),
  );
  const back = mock(() => {});
  const { user } = renderApp(<ForgotPasswordForm onBack={back} />);
  await user.type(await screen.findByLabelText("Adres e-mail"), "employee@example.invalid");
  await user.click(screen.getByRole("button", { name: "Wyślij link resetujący" }));
  expect(await screen.findByText("Spróbuj ponownie później")).toBeVisible();
  expect(screen.getByLabelText("Adres e-mail")).toHaveValue("employee@example.invalid");
  await user.click(screen.getByRole("button", { name: "Powrót do logowania" }));
  expect(back).toHaveBeenCalledTimes(1);
});

test("AUTH-UI-05 registration rejects a short password without registering", async () => {
  const { user } = renderApp(<RegisterForm onBack={() => {}} onRegisterSuccess={async () => {}} />);
  await user.type(await screen.findByLabelText("Imię i nazwisko"), "Jan Kowalski");
  await user.type(screen.getByLabelText("Adres e-mail"), "employee@example.invalid");
  await user.type(screen.getByLabelText(/^Hasło/), "short");
  await user.click(screen.getByRole("button", { name: "Utwórz konto" }));
  expect(await screen.findByText(/Hasło musi/)).toBeVisible();
});
