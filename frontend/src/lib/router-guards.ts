import { redirect } from "@tanstack/react-router";
import type { AuthContextType } from "@/contexts/AuthContext";
import { dashboardPathForRole } from "@/lib/auth-routing";

type UserRole = NonNullable<AuthContextType["role"]>;

export function redirectUserWithRole(auth: AuthContextType) {
  if (auth.isLoading) {
    return;
  }

  const dashboard = dashboardPathForRole(auth.role);

  if (dashboard) {
    throw redirect({ to: dashboard, replace: true });
  }
}

export function redirectRegisteredUser(auth: AuthContextType) {
  if (auth.isLoading || !auth.session) {
    return;
  }

  const dashboard = dashboardPathForRole(auth.role);

  if (dashboard) {
    throw redirect({ to: dashboard, replace: true });
  }

  throw redirect({ to: "/waiting-for-organization", replace: true });
}

export function requireAuthenticatedRole(auth: AuthContextType) {
  if (auth.isLoading) {
    return;
  }

  if (!auth.session) {
    throw redirect({ to: "/login", replace: true });
  }

  if (!auth.role) {
    throw redirect({ to: "/waiting-for-organization", replace: true });
  }
}

export function requireRole(auth: AuthContextType, expectedRole: UserRole) {
  if (auth.isLoading) {
    return;
  }

  if (!auth.session) {
    throw redirect({ to: "/login", replace: true });
  }

  const dashboard = dashboardPathForRole(auth.role);

  if (!dashboard) {
    throw redirect({ to: "/waiting-for-organization", replace: true });
  }

  if (auth.role !== expectedRole) {
    throw redirect({ to: dashboard, replace: true });
  }
}

export function requireWaitingForOrganization(auth: AuthContextType) {
  if (auth.isLoading) {
    return;
  }

  if (!auth.session) {
    throw redirect({ to: "/login", replace: true });
  }

  const dashboard = dashboardPathForRole(auth.role);

  if (dashboard) {
    throw redirect({ to: dashboard, replace: true });
  }
}
