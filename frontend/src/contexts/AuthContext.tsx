import { createContext, ReactNode, useEffect, useState } from "react";
import { useSession, organization } from "@/lib/auth-client";

/**
 * Typy dla sesji Better-Auth
 */
interface Session {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Rozszerzony typ użytkownika z informacjami o członkostwie w organizacji
 * Better-Auth przechowuje rolę w member.role
 */
type UserRole = "admin" | "analityk" | "pracownik";

interface AuthContextType {
  session: Session | null;
  user: Session["user"] | null;
  isLoading: boolean;
  isPending: boolean;
  error: Error | null;
  role: UserRole | null;
  organizationId: string | null;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Eksportujemy Context, aby hook w osobnym pliku mógł z niego korzystać
export { AuthContext };

/**
 * AuthProvider - Provider dla kontekstu autoryzacji
 * 
 * Opakowuje aplikację i dostarcza informacje o sesji użytkownika
 * wykorzystując Better-Auth useSession hook i pobierając rolę przez organization.getActiveMember()
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { 
    data: session, 
    isPending, 
    error,
    refetch 
  } = useSession();

  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoadingRole, setIsLoadingRole] = useState(false);

  /**
   * Wyciągamy activeOrganizationId z sesji
   * Better-Auth automatycznie przechowuje aktywną organizację w sesji
   */
  const organizationId = session?.session?.activeOrganizationId || null;

  /**
   * Pobieramy rolę użytkownika przez organization.getActiveMember()
   * Better-Auth nie zwraca roli bezpośrednio w sesji, musimy ją pobrać osobno
   */
  useEffect(() => {
    async function fetchRole() {
      if (!session?.user) {
        setRole(null);
        return;
      }

      // Jeśli użytkownik nie ma aktywnej organizacji, sprawdź czy ma jakieś organizacje
      if (!organizationId) {
        try {
          const { data: organizations } = await organization.list();
          if (organizations && organizations.length > 0) {
            // Automatycznie ustaw pierwszą organizację jako aktywną
            await organization.setActive({
              organizationId: organizations[0].id,
            });
            // Refetch session aby pobrać nową activeOrganizationId
            await refetch();
            return;
          }
        } catch (error) {
          console.error("Failed to set active organization:", error);
        }
        setRole(null);
        return;
      }

      setIsLoadingRole(true);
      try {
        const { data } = await organization.getActiveMember();
        
        if (data?.role) {
          const normalizedRole = normalizeRole(data.role);
          setRole(normalizedRole);
        } else {
          setRole(null);
        }
      } catch (err) {
        console.error("Failed to fetch user role:", err);
        setRole(null);
      } finally {
        setIsLoadingRole(false);
      }
    }

    fetchRole();
  }, [session?.user, organizationId]);

  const value: AuthContextType = {
    session: session || null,
    user: session?.user || null,
    isLoading: isPending || isLoadingRole,
    isPending,
    error: error || null,
    role,
    organizationId,
    refetch,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Normalizuje nazwy ról z różnych formatów
 */
function normalizeRole(role: string | string[]): UserRole | null {
  // Jeśli role to tablica, weź pierwszą (Better-Auth może zwracać multiple roles)
  const roleString = Array.isArray(role) ? role[0] : role;
  
  if (!roleString) return null;
  
  const lowerRole = roleString.toLowerCase();
  
  if (lowerRole === "admin" || lowerRole === "administrator") return "admin";
  if (lowerRole === "analityk" || lowerRole === "analyst") return "analityk";
  if (lowerRole === "pracownik" || lowerRole === "employee") return "pracownik";
  
  return null;
}
