import { CreateOrganizationForm } from "../components/CreateOrganizationForm";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export function CreateOrganizationPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuth();

  const handleRegisterSuccess = async () => {
    await auth.refetch();
    await router.invalidate();
  };

  return (
    <CreateOrganizationForm
      onBack={() => navigate({ to: "/" })}
      onRegisterSuccess={handleRegisterSuccess}
    />
  );
}
