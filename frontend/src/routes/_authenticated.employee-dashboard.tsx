import { createFileRoute } from "@tanstack/react-router";
import { EmployeeDashboardPage } from "@/pages/EmployeeDashboardPage";
import { requireRole } from "@/lib/router-guards";

export const Route = createFileRoute("/_authenticated/employee-dashboard")({
  beforeLoad: ({ context }) => requireRole(context.auth, "pracownik"),
  component: EmployeeDashboardPage,
});
