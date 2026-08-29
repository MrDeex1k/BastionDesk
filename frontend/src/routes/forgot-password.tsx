import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { redirectUserWithRole } from "@/lib/router-guards";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: ({ context }) => redirectUserWithRole(context.auth),
  component: ForgotPasswordPage,
});
