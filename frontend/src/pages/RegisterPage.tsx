import { RegisterForm } from "../components/RegisterForm";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export function RegisterPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuth();

  const handleRegisterSuccess = async () => {
    await auth.refetch();
    await router.invalidate();
  };

  return (
    <RegisterForm onBack={() => navigate({ to: "/" })} onRegisterSuccess={handleRegisterSuccess} />
  );
}
