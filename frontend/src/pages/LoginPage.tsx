import { LoginForm } from "../components/LoginForm";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

interface LoginPageProps {
  notice?: string;
}

export function LoginPage({ notice }: LoginPageProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuth();

  const handleLoginSuccess = async () => {
    await auth.refetch();
    await router.invalidate();
  };

  return (
    <LoginForm
      onBack={() => navigate({ to: "/" })}
      onForgotPassword={() => navigate({ to: "/forgot-password" })}
      onLoginSuccess={handleLoginSuccess}
      notice={notice}
    />
  );
}
