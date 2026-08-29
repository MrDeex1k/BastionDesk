import { ForgotPasswordForm } from "../components/ForgotPasswordForm";
import { useNavigate } from "@tanstack/react-router";

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  return <ForgotPasswordForm onBack={() => navigate({ to: "/login" })} />;
}
