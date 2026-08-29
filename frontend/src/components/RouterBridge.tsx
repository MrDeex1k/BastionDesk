import { RouterProvider } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";

export function RouterBridge() {
  const auth = useAuth();
  const [isInitialAuthReady, setIsInitialAuthReady] = useState(() => !auth.isLoading);

  useEffect(() => {
    if (!auth.isLoading) {
      setIsInitialAuthReady(true);
    }
  }, [auth.isLoading]);

  useEffect(() => {
    if (!isInitialAuthReady || auth.isLoading) {
      return;
    }

    void router.invalidate();
  }, [
    auth.isLoading,
    auth.organizationId,
    auth.role,
    auth.session?.session.id,
    isInitialAuthReady,
  ]);

  if (!isInitialAuthReady) {
    return <InitialAuthLoader />;
  }

  return <RouterProvider router={router} context={{ auth, queryClient }} />;
}

function InitialAuthLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-zinc-950 via-blue-950 to-zinc-900">
      <div className="flex flex-col items-center gap-4 text-zinc-400">
        <Loader2 className="size-12 animate-spin text-cyan-400" />
        <p className="text-sm">Ładowanie…</p>
      </div>
    </div>
  );
}
