import { createFileRoute } from "@tanstack/react-router";
import { WaitingForOrganizationPage } from "@/pages/WaitingForOrganizationPage";
import { AuthRouteLoader } from "@/components/AuthRouteLoader";
import { requireWaitingForOrganization } from "@/lib/router-guards";

export const Route = createFileRoute("/waiting-for-organization")({
  beforeLoad: ({ context }) => requireWaitingForOrganization(context.auth),
  component: WaitingForOrganizationRoute,
});

function WaitingForOrganizationRoute() {
  const { auth } = Route.useRouteContext();

  if (auth.isLoading) {
    return <AuthRouteLoader />;
  }

  return <WaitingForOrganizationPage />;
}
