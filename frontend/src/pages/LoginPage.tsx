import { LoginForm } from "../components/LoginForm";
import { useNavigate } from "react-router-dom";

interface LoginPageProps {
  onLogin: (role: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  
  const handleLoginSuccess = (role: string) => {
    onLogin(role);
  };

  return (
    <LoginForm
      onBack={() => navigate("/")}
      onForgotPassword={() => navigate("/forgot-password")}
      onLoginSuccess={handleLoginSuccess}
    />
  );
}
