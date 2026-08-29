import { createFileRoute } from "@tanstack/react-router";
import { AnalystDashboardPage } from "@/pages/AnalystDashboardPage";
import { requireRole } from "@/lib/router-guards";

export const Route = createFileRoute("/_authenticated/analyst-dashboard")({
  beforeLoad: ({ context }) => requireRole(context.auth, "analityk"),
  component: AnalystDashboardPage,
});
