import { use } from "react";
import { AuthContext } from "@/contexts/AuthContext";

/**
 * useAuth - Custom hook do dostępu do kontekstu autoryzacji
 *
 * @throws Error jeśli używany poza AuthProvider
 * @returns AuthContextType z informacjami o sesji
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, role, isLoading } = useAuth();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (!user) return <div>Not logged in</div>;
 *
 *   return <div>Welcome {user.name}!</div>;
 * }
 * ```
 */
export function useAuth() {
  const context = use(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
