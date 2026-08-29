import { createFileRoute } from "@tanstack/react-router";
import { CreateOrganizationPage } from "@/pages/CreateOrganizationPage";
import { redirectUserWithRole } from "@/lib/router-guards";

export const Route = createFileRoute("/create-organization")({
  beforeLoad: ({ context }) => redirectUserWithRole(context.auth),
  component: CreateOrganizationPage,
});
