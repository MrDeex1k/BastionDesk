import { useCallback, useEffect, useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  OrganizationMember,
  OrganizationMembersResponse,
} from "@/ApiModel";
import { apiFetch, readJsonError } from "@/lib/api";
import { AddMemberCard } from "./admin-organization/AddMemberCard";
import { DeleteMemberDialog } from "./admin-organization/DeleteMemberDialog";
import { MembersListCard } from "./admin-organization/MembersListCard";

interface AdminOrganizationManagementState {
  email: string;
  role: string;
  memberToDelete: OrganizationMember | null;
}

type AdminOrganizationManagementAction =
  | { type: "set-email"; value: string }
  | { type: "set-role"; value: string }
  | { type: "set-member-to-delete"; value: OrganizationMember | null };

const initialAdminOrganizationManagementState: AdminOrganizationManagementState =
  {
    email: "",
    role: "pracownik",
    memberToDelete: null,
  };

const organizationMembersQueryKey = ["organizationMembers"] as const;

async function fetchOrganizationMembers() {
  const response = await apiFetch(
    "/api/auth/organization/list-members?limit=100&sortBy=createdAt&sortDirection=desc",
  );

  if (!response.ok) {
    throw new Error(await readJsonError(response, "MEMBERS_FETCH_FAILED"));
  }

  const data = (await response.json()) as OrganizationMembersResponse;
  return Array.isArray(data.members) ? data.members : [];
}

function adminOrganizationManagementReducer(
  state: AdminOrganizationManagementState,
  action: AdminOrganizationManagementAction,
): AdminOrganizationManagementState {
  switch (action.type) {
    case "set-email":
      return { ...state, email: action.value };
    case "set-role":
      return { ...state, role: action.value };
    case "set-member-to-delete":
      return { ...state, memberToDelete: action.value };
    default:
      return state;
  }
}

export function AdminOrganizationManagement() {
  const [state, dispatch] = useReducer(
    adminOrganizationManagementReducer,
    initialAdminOrganizationManagementState,
  );
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: organizationMembersQueryKey,
    queryFn: fetchOrganizationMembers,
    staleTime: 30_000,
  });

  const handleRefreshMembers = useCallback(() => {
    void membersQuery.refetch();
  }, [membersQuery]);

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        "/api/auth/organization/add-member-by-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: state.email, role: state.role }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw data;
      }

      return data;
    },
    onSuccess: async () => {
      toast.success(`Użytkownik ${state.email} został dodany do organizacji`);
      dispatch({ type: "set-email", value: "" });
      await queryClient.invalidateQueries({
        queryKey: organizationMembersQueryKey,
      });
    },
    onError: (error: unknown) => {
      const apiError =
        error && typeof error === "object" && "error" in error
          ? (error as { error?: { code?: string; message?: string } }).error
          : undefined;

      if (apiError?.code === "USER_NOT_FOUND") {
        toast.error(
          "Użytkownik o podanym adresie email nie istnieje w systemie",
        );
      } else if (apiError?.code === "ALREADY_MEMBER") {
        toast.error("Użytkownik jest już członkiem tej organizacji");
      } else {
        toast.error(
          apiError?.message || "Wystąpił błąd podczas dodawania użytkownika",
        );
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
    }) => {
      const response = await apiFetch(
        "/api/auth/organization/update-member-role",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId, role }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readJsonError(response, "Nie udało się zmienić roli"),
        );
      }
    },
    onSuccess: async () => {
      toast.success("Rola została zaktualizowana");
      await queryClient.invalidateQueries({
        queryKey: organizationMembersQueryKey,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await apiFetch("/api/auth/organization/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIdOrEmail: memberId }),
      });

      if (!response.ok) {
        throw new Error(
          await readJsonError(response, "Nie udało się usunąć członka"),
        );
      }
    },
    onSuccess: async () => {
      toast.success("Członek został usunięty z organizacji");
      dispatch({ type: "set-member-to-delete", value: null });
      await queryClient.invalidateQueries({
        queryKey: organizationMembersQueryKey,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (membersQuery.isError) {
      toast.error("Nie udało się pobrać listy członków");
    }
  }, [membersQuery.isError]);

  const handleAddDirectly = useCallback(() => {
    if (!state.email) {
      toast.error("Wprowadź adres email");
      return;
    }

    addMemberMutation.mutate();
  }, [addMemberMutation, state.email]);

  const handleUpdateRole = useCallback(
    (memberId: string, newRole: string) => {
      updateRoleMutation.mutate({ memberId, role: newRole });
    },
    [updateRoleMutation],
  );

  const handleRemoveMember = useCallback(() => {
    if (!state.memberToDelete) return;

    removeMemberMutation.mutate(state.memberToDelete.id);
  }, [removeMemberMutation, state.memberToDelete]);

  const handleCopyUserId = useCallback((userId: string) => {
    navigator.clipboard.writeText(userId);
    toast.success("Skopiowano ID użytkownika");
  }, []);

  const handleDeleteMember = useCallback((member: OrganizationMember) => {
    dispatch({ type: "set-member-to-delete", value: member });
  }, []);

  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      dispatch({ type: "set-member-to-delete", value: null });
    }
  }, []);

  return (
    <div className="space-y-8">
      <AddMemberCard
        email={state.email}
        role={state.role}
        isLoadingAdd={addMemberMutation.isPending}
        onEmailChange={(value) => dispatch({ type: "set-email", value })}
        onRoleChange={(value) => dispatch({ type: "set-role", value })}
        onAdd={handleAddDirectly}
      />
      <MembersListCard
        members={membersQuery.data ?? []}
        isLoadingMembers={membersQuery.isLoading || membersQuery.isFetching}
        onRefresh={handleRefreshMembers}
        onCopyUserId={handleCopyUserId}
        onUpdateRole={handleUpdateRole}
        onDeleteMember={handleDeleteMember}
      />
      <DeleteMemberDialog
        memberToDelete={state.memberToDelete}
        onOpenChange={handleDeleteDialogOpenChange}
        onConfirm={handleRemoveMember}
      />
    </div>
  );
}
