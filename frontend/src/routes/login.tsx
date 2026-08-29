import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/pages/LoginPage";
import { redirectUserWithRole } from "@/lib/router-guards";

interface LoginSearch {
  resetError?: "missing-token";
}

export const Route = createFileRoute("/login")({
  validateSearch: (search): LoginSearch => ({
    resetError: search.resetError === "missing-token" ? "missing-token" : undefined,
  }),
  beforeLoad: ({ context }) => redirectUserWithRole(context.auth),
  component: LoginRoute,
});

function LoginRoute() {
  const { resetError } = Route.useSearch();

  return (
    <LoginPage
      notice={
        resetError === "missing-token"
          ? "Link do resetowania hasła jest niekompletny. Poproś o nowy link."
          : undefined
      }
    />
  );
}
