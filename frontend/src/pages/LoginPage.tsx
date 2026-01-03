import { LoginForm } from "../components/LoginForm";
import { useNavigate } from "react-router-dom";

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  
  const handleLoginSuccess = () => {
    onLogin();
  };

  return (
    <LoginForm
      onBack={() => navigate("/")}
      onForgotPassword={() => navigate("/forgot-password")}
      onLoginSuccess={handleLoginSuccess}
    />
  );
}
