import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthRouteLoader } from "@/components/AuthRouteLoader";
import { requireAuthenticatedRole } from "@/lib/router-guards";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => requireAuthenticatedRole(context.auth),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { auth } = Route.useRouteContext();

  if (auth.isLoading) {
    return <AuthRouteLoader />;
  }

  return <Outlet />;
}
