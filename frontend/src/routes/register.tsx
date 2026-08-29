import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "@/pages/RegisterPage";
import { redirectRegisteredUser } from "@/lib/router-guards";

export const Route = createFileRoute("/register")({
  beforeLoad: ({ context }) => redirectRegisteredUser(context.auth),
  component: RegisterPage,
});
