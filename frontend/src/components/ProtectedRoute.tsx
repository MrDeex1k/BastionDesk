import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * Dozwolone role w systemie
 */
type UserRole = "admin" | "analityk" | "pracownik";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  /**
   * Ścieżka do przekierowania jeśli użytkownik nie jest zalogowany
   * @default "/login"
   */
  redirectTo?: string;
}

/**
 * ProtectedRoute - Komponent ochrony tras wymagających autoryzacji
 * 
 * Sprawdza czy użytkownik jest zalogowany i czy ma odpowiednią rolę.
 * Jeśli nie - przekierowuje do strony logowania lub głównej.
 * 
 * @example
 * ```tsx
 * <Route 
 *   path="/admin-dashboard" 
 *   element={
 *     <ProtectedRoute allowedRoles={["admin"]}>
 *       <AdminDashboardPage />
 *     </ProtectedRoute>
 *   } 
 * />
 * ```
 */
export function ProtectedRoute({ 
  children, 
  allowedRoles, 
  redirectTo = "/login" 
}: ProtectedRouteProps) {
  const { session, role, isLoading } = useAuth();

  // Pokazuj loader podczas ładowania sesji
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-12 animate-spin text-cyan-400" />
          <p className="text-slate-400 text-sm">Ładowanie...</p>
        </div>
      </div>
    );
  }

  // Jeśli użytkownik nie jest zalogowany - przekieruj do logowania
  if (!session) {
    return <Navigate to={redirectTo} replace />;
  }

  // Jeśli użytkownik ma rolę ale nie ma dostępu do tej trasy - przekieruj na główną
  if (role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  // Jeśli użytkownik nie ma roli (np. czeka na organizację) - także zablokuj dostęp
  if (!role) {
    return <Navigate to="/waiting-for-organization" replace />;
  }

  // Użytkownik ma odpowiednią rolę - pokaż zawartość
  return <>{children}</>;
}
