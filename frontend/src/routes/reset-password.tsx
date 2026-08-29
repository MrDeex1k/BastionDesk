import { createFileRoute, redirect } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { redirectUserWithRole } from "@/lib/router-guards";

interface ResetPasswordSearch {
  token?: string;
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    redirectUserWithRole(context.auth);

    if (!search.token) {
      throw redirect({
        to: "/login",
        search: { resetError: "missing-token" },
        replace: true,
      });
    }

    return { resetToken: search.token };
  },
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { resetToken } = Route.useRouteContext();

  return <ResetPasswordPage token={resetToken} />;
}
