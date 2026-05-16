import { createContext, type ReactNode, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const NO_ROLE: null = null;

interface OrganizationSummary {
  id: string;
}

/**
 * AuthProvider - Provider dla kontekstu autoryzacji
 *
 * Opakowuje aplikację i dostarcza informacje o sesji użytkownika
 * wykorzystując Better-Auth useSession hook i pobierając rolę przez organization.getActiveMember()
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, error, refetch } = useSession();
  const queryClient = useQueryClient();

  /**
   * Wyciągamy activeOrganizationId z sesji
   * Better-Auth automatycznie przechowuje aktywną organizację w sesji
   */
  const organizationId = session?.session?.activeOrganizationId || null;

  const organizationsQuery = useQuery({
    queryKey: ["auth", "organizations", session?.user?.id],
    enabled: Boolean(session?.user) && !organizationId,
    queryFn: async () => {
      const { data } = await organization.list();
      return (data ?? []) as OrganizationSummary[];
    },
    staleTime: 60_000,
  });

  const firstOrganizationId = organizationsQuery.data?.[0]?.id ?? null;
  const shouldActivateOrganization =
    Boolean(session?.user) &&
    !organizationId &&
    Boolean(firstOrganizationId);

  const activateOrganizationMutation = useMutation({
    mutationFn: async (nextOrganizationId: string) =>
      organization.setActive({
        organizationId: nextOrganizationId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["auth", "organizations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["auth", "active-member"],
        }),
        refetch(),
      ]);
    },
  });

  useEffect(() => {
    if (
      !shouldActivateOrganization ||
      !firstOrganizationId ||
      !activateOrganizationMutation.isIdle
    ) {
      return;
    }

    void activateOrganizationMutation.mutateAsync(firstOrganizationId);
  }, [
    activateOrganizationMutation,
    firstOrganizationId,
    shouldActivateOrganization,
  ]);

  const activeMemberQuery = useQuery({
    queryKey: ["auth", "active-member", session?.user?.id, organizationId],
    enabled: Boolean(session?.user) && Boolean(organizationId),
    queryFn: async () => {
      const { data } = await organization.getActiveMember();
      return normalizeRole(data?.role);
    },
    staleTime: 60_000,
  });

  /**
   * Pobieramy rolę użytkownika przez organization.getActiveMember()
   * Better-Auth nie zwraca roli bezpośrednio w sesji, musimy ją pobrać osobno
   */
  const role = organizationId ? (activeMemberQuery.data ?? NO_ROLE) : NO_ROLE;
  const combinedError =
    error ||
    asError(organizationsQuery.error) ||
    asError(activateOrganizationMutation.error) ||
    asError(activeMemberQuery.error);
  const isLoading =
    isPending ||
    organizationsQuery.isLoading ||
    activateOrganizationMutation.isPending ||
    activeMemberQuery.isLoading;

  const value = useMemo<AuthContextType>(
    () => ({
      session: session || null,
      user: session?.user || null,
      isLoading,
      isPending,
      error: combinedError,
      role,
      organizationId,
      refetch,
    }),
    [
      combinedError,
      isLoading,
      isPending,
      organizationId,
      refetch,
      role,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Normalizuje nazwy ról z różnych formatów
 */
function normalizeRole(
  role: string | string[] | null | undefined,
): UserRole | null {
  // Jeśli role to tablica, weź pierwszą (Better-Auth może zwracać multiple roles)
  const roleString = Array.isArray(role) ? role[0] : role;

  if (!roleString) return null;

  const lowerRole = roleString.toLowerCase();

  if (lowerRole === "admin" || lowerRole === "administrator") return "admin";
  if (lowerRole === "analityk" || lowerRole === "analyst") return "analityk";
  if (lowerRole === "pracownik" || lowerRole === "employee") return "pracownik";

  return null;
}

function asError(value: unknown): Error | null {
  return value instanceof Error ? value : null;
}
