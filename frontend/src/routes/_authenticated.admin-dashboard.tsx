import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardPage } from "@/pages/AdminDashboardPage";
import { requireRole } from "@/lib/router-guards";

export const Route = createFileRoute("/_authenticated/admin-dashboard")({
  beforeLoad: ({ context }) => requireRole(context.auth, "admin"),
  component: AdminDashboardPage,
});
