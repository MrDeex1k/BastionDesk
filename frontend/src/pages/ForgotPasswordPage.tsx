import { ForgotPasswordForm } from "../components/ForgotPasswordForm";
import { useNavigate } from "react-router-dom";

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  return <ForgotPasswordForm onBack={() => navigate("/login")} />;
}
