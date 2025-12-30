import { CreateOrganizationForm } from "../components/CreateOrganizationForm";
import { useNavigate } from "react-router-dom";

export function CreateOrganizationPage() {
  const navigate = useNavigate();

  return (
    <CreateOrganizationForm
      onBack={() => navigate("/")}
      onRegisterSuccess={() => navigate("/waiting-for-organization")}
    />
  );
}
