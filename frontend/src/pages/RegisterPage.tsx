import { RegisterForm } from "../components/RegisterForm";
import { useNavigate } from "react-router-dom";

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <RegisterForm
      onBack={() => navigate("/")}
      onRegisterSuccess={() => navigate("/waiting-for-organization")}
    />
  );
}
