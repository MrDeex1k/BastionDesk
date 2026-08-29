import { useCallback, useEffect, useEffectEvent, useReducer, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { toast } from "sonner";
import { Settings, Trash2 } from "lucide-react";
import type { PassKey } from "@/ApiModel";
import { authClient } from "../lib/auth-client";
import { validatePassword } from "@/lib/validation";
import { DangerZoneSection } from "./settings-dialog/DangerZoneSection";
import { PassKeysSection } from "./settings-dialog/PassKeysSection";
import { PasswordChangeSection } from "./settings-dialog/PasswordChangeSection";

interface SettingsState {
  confirmPassword: string;
  isLoadingPassKeys: boolean;
  newPassword: string;
  oldPassword: string;
  passKeys: PassKey[];
  pendingAction: "delete" | "password" | null;
}

type SettingsAction =
  | { type: "setConfirmPassword"; value: string }
  | { type: "setIsLoadingPassKeys"; value: boolean }
  | { type: "setNewPassword"; value: string }
  | { type: "setOldPassword"; value: string }
  | { type: "setPassKeys"; value: PassKey[] }
  | { type: "setPendingAction"; value: SettingsState["pendingAction"] }
  | { type: "resetPasswordForm" };

const initialSettingsState: SettingsState = {
  confirmPassword: "",
  isLoadingPassKeys: false,
  newPassword: "",
  oldPassword: "",
  passKeys: [],
  pendingAction: null,
};

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "setConfirmPassword":
      return { ...state, confirmPassword: action.value };
    case "setIsLoadingPassKeys":
      return { ...state, isLoadingPassKeys: action.value };
    case "setNewPassword":
      return { ...state, newPassword: action.value };
    case "setOldPassword":
      return { ...state, oldPassword: action.value };
    case "setPassKeys":
      return { ...state, passKeys: action.value };
    case "setPendingAction":
      return { ...state, pendingAction: action.value };
    case "resetPasswordForm":
      return {
        ...state,
        confirmPassword: "",
        newPassword: "",
        oldPassword: "",
      };
    default:
      return state;
  }
}

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);

  const fetchPassKeys = useCallback(async () => {
    dispatch({ type: "setIsLoadingPassKeys", value: true });
    try {
      const { data } = await authClient.passkey.listUserPasskeys();
      dispatch({ type: "setPassKeys", value: data || [] });
    } catch {
      toast.error("Nie udało się pobrać listy kluczy");
    } finally {
      dispatch({ type: "setIsLoadingPassKeys", value: false });
    }
  }, []);

  const loadPassKeys = useEffectEvent(() => {
    void fetchPassKeys();
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    queueMicrotask(() => {
      loadPassKeys();
    });
  }, [isOpen]);

  const handleAddPassKey = useCallback(async () => {
    dispatch({ type: "setIsLoadingPassKeys", value: true });
    try {
      const newKeyName = `Klucz ${new Date().toLocaleDateString(
        "pl-PL",
      )} ${new Date().toLocaleTimeString("pl-PL")}`;

      const { error } = await authClient.passkey.addPasskey({
        name: newKeyName,
      });

      if (error) {
        toast.error("Nie udało się dodać klucza PassKey");
      } else {
        toast.success("Klucz PassKey został dodany");
        await fetchPassKeys();
      }
    } catch {
      toast.error("Wystąpił błąd podczas dodawania klucza");
    } finally {
      dispatch({ type: "setIsLoadingPassKeys", value: false });
    }
  }, [fetchPassKeys]);

  const handleDeletePassKey = useCallback(
    async (id: string) => {
      if (!confirm("Czy na pewno chcesz usunąć ten klucz?")) return;

      dispatch({ type: "setIsLoadingPassKeys", value: true });
      try {
        const { error } = await authClient.passkey.deletePasskey({ id });

        if (error) {
          toast.error("Nie udało się usunąć klucza");
        } else {
          toast.success("Klucz PassKey został usunięty");
          await fetchPassKeys();
        }
      } catch {
        toast.error("Wystąpił błąd podczas usuwania klucza");
      } finally {
        dispatch({ type: "setIsLoadingPassKeys", value: false });
      }
    },
    [fetchPassKeys],
  );

  const handleChangePassword = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const passwordError = validatePassword(state.newPassword);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }

      if (state.newPassword !== state.confirmPassword) {
        toast.error("Nowe hasła nie są identyczne");
        return;
      }

      dispatch({ type: "setPendingAction", value: "password" });
      try {
        const { error } = await authClient.changePassword({
          currentPassword: state.oldPassword,
          newPassword: state.newPassword,
          revokeOtherSessions: true,
        });

        if (error) {
          toast.error(error.message || "Nie udało się zmienić hasła");
          return;
        }

        toast.success("Hasło zostało zmienione pomyślnie");
        dispatch({ type: "resetPasswordForm" });
      } catch {
        toast.error("Nie udało się zmienić hasła");
      } finally {
        dispatch({ type: "setPendingAction", value: null });
      }
    },
    [state.confirmPassword, state.newPassword, state.oldPassword],
  );

  const handleDeleteAccount = useCallback(async () => {
    if (
      !window.confirm("Czy na pewno chcesz usunąć swoje konto? Ta operacja jest nieodwracalna.")
    ) {
      return;
    }

    dispatch({ type: "setPendingAction", value: "delete" });
    try {
      const { error } = await authClient.deleteUser({
        callbackURL: window.location.origin,
      });

      if (error) {
        toast.error(error.message || "Nie udało się usunąć konta");
        return;
      }

      toast.success("Konto zostało usunięte");
      setIsOpen(false);
      window.location.href = "/";
    } catch {
      toast.error("Nie udało się usunąć konta");
    } finally {
      dispatch({ type: "setPendingAction", value: null });
    }
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400 hover:bg-white/5 hover:text-white"
          />
        }
      >
        <Settings className="size-5" />
        <span className="sr-only">Ustawienia</span>
      </DialogTrigger>
      <DialogContent className="border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl shadow-black/50 sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Settings className="size-5 text-blue-400" />
            Ustawienia konta
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Zarządzaj bezpieczeństwem i preferencjami swojego konta.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="security" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2 border border-zinc-700 bg-zinc-900">
            <TabsTrigger
              value="security"
              className="text-white/85 data-active:bg-blue-600 data-active:text-white"
            >
              <ShieldIcon className="mr-2 size-4" />
              Bezpieczeństwo
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="text-white/85 data-active:bg-red-600 data-active:text-white"
            >
              <Trash2 className="mr-2 size-4" />
              Usunięcie konta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="space-y-4 mt-4">
            <PassKeysSection
              passKeys={state.passKeys}
              isLoadingPassKeys={state.isLoadingPassKeys}
              onAddPassKey={handleAddPassKey}
              onDeletePassKey={handleDeletePassKey}
            />
            <PasswordChangeSection
              oldPassword={state.oldPassword}
              newPassword={state.newPassword}
              confirmPassword={state.confirmPassword}
              isLoading={state.pendingAction === "password"}
              onOldPasswordChange={(value) => dispatch({ type: "setOldPassword", value })}
              onNewPasswordChange={(value) => dispatch({ type: "setNewPassword", value })}
              onConfirmPasswordChange={(value) => dispatch({ type: "setConfirmPassword", value })}
              onSubmit={handleChangePassword}
            />
          </TabsContent>

          <TabsContent value="danger" className="mt-4">
            <DangerZoneSection
              isLoading={state.pendingAction === "delete"}
              onDeleteAccount={handleDeleteAccount}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}
