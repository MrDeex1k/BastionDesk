import { useReducer } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { UserPlus, Mail, KeyRound, User, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signUp } from "@/lib/auth-client";
import { validateEmail, validateFullName, validatePassword } from "@/lib/validation";

interface RegisterFormProps {
  onBack: () => void;
  onRegisterSuccess: () => Promise<void>;
}

interface RegisterFormState {
  email: string;
  password: string;
  fullName: string;
  emailError: string;
  passwordError: string;
  fullNameError: string;
}

type RegisterFormAction =
  | {
      type: "set-field";
      field: "email" | "password" | "fullName";
      value: string;
    }
  | {
      type: "set-errors";
      errors: Pick<RegisterFormState, "emailError" | "passwordError" | "fullNameError">;
    }
  | {
      type: "reset";
    };

const initialRegisterFormState: RegisterFormState = {
  email: "",
  password: "",
  fullName: "",
  emailError: "",
  passwordError: "",
  fullNameError: "",
};

function registerFormReducer(
  state: RegisterFormState,
  action: RegisterFormAction,
): RegisterFormState {
  switch (action.type) {
    case "set-field":
      return {
        ...state,
        [action.field]: action.value,
      };
    case "set-errors":
      return {
        ...state,
        ...action.errors,
      };
    case "reset":
      return initialRegisterFormState;
    default:
      return state;
  }
}

export function RegisterForm({ onBack, onRegisterSuccess }: RegisterFormProps) {
  const [state, dispatch] = useReducer(registerFormReducer, initialRegisterFormState);
  const queryClient = useQueryClient();

  const validateForm = () => {
    const nextEmailError = validateEmail(state.email);
    const nextPasswordError = validatePassword(state.password);
    const nextFullNameError = validateFullName(state.fullName);

    dispatch({
      type: "set-errors",
      errors: {
        emailError: nextEmailError,
        passwordError: nextPasswordError,
        fullNameError: nextFullNameError,
      },
    });

    return !nextEmailError && !nextPasswordError && !nextFullNameError;
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await signUp.email({
        email: state.email,
        password: state.password,
        name: state.fullName,
      });

      if (error) {
        throw new Error(error.message || "Błąd rejestracji");
      }

      return data;
    },
    onSuccess: async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: ["auth"] });
        dispatch({ type: "reset" });
        await onRegisterSuccess();
        toast.success("Rejestracja zakończona pomyślnie!");
      } catch {
        toast.warning(
          "Konto utworzono, ale nie udało się odświeżyć widoku. Przeładowuję aplikację…",
        );
        window.location.assign("/");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
      dispatch({
        type: "set-errors",
        errors: {
          emailError: "",
          passwordError: "",
          fullNameError: error.message,
        },
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      registerMutation.mutate();
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-cyan-900/50 bg-linear-to-br from-zinc-800/90 to-zinc-700/90 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-4">
            <UserPlus className="size-12 text-cyan-400" />
          </div>
          <h2 className="mb-2 text-3xl text-cyan-300">Dołącz do nas</h2>
          <p className="text-zinc-400">Wypełnij formularz, aby utworzyć konto</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-zinc-300">
              Imię i nazwisko
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
              <Input
                id="fullName"
                type="text"
                placeholder="Jan Kowalski"
                value={state.fullName}
                onChange={(e) =>
                  dispatch({
                    type: "set-field",
                    field: "fullName",
                    value: e.target.value,
                  })
                }
                className="border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={registerMutation.isPending}
              />
            </div>
            {state.fullNameError && <p className="text-sm text-red-500">{state.fullNameError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">
              Adres e-mail
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
              <Input
                id="email"
                type="email"
                placeholder="twoj@email.com"
                value={state.email}
                onChange={(e) =>
                  dispatch({
                    type: "set-field",
                    field: "email",
                    value: e.target.value,
                  })
                }
                className="border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={registerMutation.isPending}
              />
            </div>
            {state.emailError && <p className="text-sm text-red-500">{state.emailError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">
              Hasło
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={state.password}
                onChange={(e) =>
                  dispatch({
                    type: "set-field",
                    field: "password",
                    value: e.target.value,
                  })
                }
                className="border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={registerMutation.isPending}
              />
            </div>
            {state.passwordError && <p className="text-sm text-red-500">{state.passwordError}</p>}
          </div>

          <Button
            type="submit"
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg shadow-cyan-500/20"
            size="lg"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Rejestracja…
              </>
            ) : (
              "Utwórz konto"
            )}
          </Button>

          <Button
            type="button"
            onClick={onBack}
            variant="ghost"
            className="w-full text-zinc-400 hover:bg-zinc-700/50 hover:text-cyan-400"
            size="lg"
            disabled={registerMutation.isPending}
          >
            <ArrowLeft className="size-4 mr-2" />
            Powrót do strony głównej
          </Button>
        </form>
      </Card>
    </div>
  );
}
