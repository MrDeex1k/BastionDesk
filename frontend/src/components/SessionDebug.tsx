import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * SessionDebug - Komponent deweloperski do sprawdzania stanu sesji
 * 
 * Wyświetla informacje o:
 * - Stanie ładowania sesji
 * - Zalogowanym użytkowniku
 * - Aktywnej organizacji
 * - Roli użytkownika
 * 
 * Użycie: Dodaj <SessionDebug /> w dowolnym miejscu aplikacji
 */
export function SessionDebug() {
  const { session, user, isLoading, role, organizationId, error } = useAuth();

  if (isLoading) {
    return (
      <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-xl">
        <div className="flex items-center gap-2 text-slate-300">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">Ładowanie sesji...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-900/20 border border-red-700 rounded-lg p-4 shadow-xl max-w-md">
        <div className="text-red-400 text-sm">
          <div className="font-bold mb-1">Błąd sesji:</div>
          <div>{error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-xl max-w-md">
      <div className="text-sm space-y-2">
        <div className="font-bold text-cyan-400 border-b border-slate-700 pb-2">
          Session Debug
        </div>
        
        {session ? (
          <>
            <div className="space-y-1">
              <div className="text-slate-400">
                <span className="font-semibold">User:</span>{" "}
                <span className="text-white">{user?.name || "N/A"}</span>
              </div>
              <div className="text-slate-400">
                <span className="font-semibold">Email:</span>{" "}
                <span className="text-white">{user?.email || "N/A"}</span>
              </div>
              <div className="text-slate-400">
                <span className="font-semibold">Role:</span>{" "}
                <span className="text-white">{role || "Not set"}</span>
              </div>
              <div className="text-slate-400">
                <span className="font-semibold">Org ID:</span>{" "}
                <span className="text-white text-xs">
                  {organizationId || "No organization"}
                </span>
              </div>
              <div className="text-slate-400">
                <span className="font-semibold">Session ID:</span>{" "}
                <span className="text-white text-xs">
                  {session.session.id.substring(0, 16)}...
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-slate-400">
            ❌ Brak aktywnej sesji (nie zalogowany)
          </div>
        )}
      </div>
    </div>
  );
}
