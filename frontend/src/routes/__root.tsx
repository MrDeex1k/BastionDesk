import {
  createRootRouteWithContext,
  Outlet,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { useCallback } from "react";
import type { AuthContextType } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { signOut } from "@/lib/auth-client";
import { dashboardPathForRole } from "@/lib/auth-routing";

export interface RouterContext {
  auth: AuthContextType;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});

function RootLayout() {
  const { auth, queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();

  const navigateToDashboard = useCallback(() => {
    const dashboard = dashboardPathForRole(auth.role);

    if (dashboard) {
      void navigate({ to: dashboard });
    }
  }, [auth.role, navigate]);

  const handleLogout = useCallback(async () => {
    await signOut();
    queryClient.clear();
    await auth.refetch();
    await router.invalidate();
    toast.success("Wylogowano pomyślnie");
    void navigate({ to: "/" });
  }, [auth, navigate, queryClient, router]);

  const handleLogoClick = useCallback(() => {
    if (auth.session) {
      navigateToDashboard();
      return;
    }

    void navigate({ to: "/" });
  }, [auth.session, navigate, navigateToDashboard]);

  const handleLoginClick = useCallback(() => {
    void navigate({ to: "/login" });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-zinc-950 via-blue-950 to-zinc-900 text-white">
      <Header
        onLogoClick={handleLogoClick}
        userRole={auth.role}
        onLoginClick={handleLoginClick}
        onLogout={handleLogout}
        onDashboardClick={navigateToDashboard}
      />

      <main className="container mx-auto flex-1 px-4 py-16">
        <Outlet />
      </main>

      <Footer />
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

function RoutePending() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-6 py-4 text-zinc-300 shadow-xl">
        Ładowanie…
      </div>
    </div>
  );
}

function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="max-w-lg rounded-2xl border border-red-900/60 bg-zinc-950/80 px-6 py-5 text-center shadow-xl">
        <h2 className="text-lg font-semibold text-red-300">Nie udało się otworzyć strony</h2>
        <p className="mt-2 text-sm text-zinc-400">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Spróbuj ponownie
        </button>
      </div>
    </div>
  );
}
