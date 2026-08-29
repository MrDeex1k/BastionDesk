import type { AuthContextType } from "@/contexts/AuthContext";

export type DashboardPath = "/admin-dashboard" | "/analyst-dashboard" | "/employee-dashboard";

export function dashboardPathForRole(role: AuthContextType["role"]): DashboardPath | null {
  switch (role) {
    case "admin":
      return "/admin-dashboard";
    case "analityk":
      return "/analyst-dashboard";
    case "pracownik":
      return "/employee-dashboard";
    default:
      return null;
  }
}
