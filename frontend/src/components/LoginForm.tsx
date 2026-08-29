import { CircleAlert, Fingerprint, Lock } from "lucide-react";
import { useReducer } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import {
  validateEmail as getEmailError,
  validatePassword as getPasswordError,
} from "@/lib/validation";
import { Card } from "./ui/card";
import { EmailStep } from "./login-form/EmailStep";
import { PasskeyStep } from "./login-form/PasskeyStep";
import { PasswordStep } from "./login-form/PasswordStep";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

interface LoginFormProps {
  onBack: () => void;
  onForgotPassword: () => void;
  onLoginSuccess: () => Promise<void>;
  notice?: string;
}

type LoginStep = "email" | "password" | "passkey";

interface LoginFormState {
  email: string;
  password: string;
  emailError: string;
  passwordError: string;
  step: LoginStep;
  isCheckingEmail: boolean;
}

type LoginFormAction =
  | {
      type: "set-field";
      field: "email" | "password";
      value: string;
    }
  | {
      type: "set-error";
      field: "emailError" | "passwordError";
      value: string;
    }
  | {
      type: "set-step";
      value: LoginStep;
    }
  | {
      type: "set-is-checking-email";
      value: boolean;
    }
  | {
      type: "reset-password-step";
    };

const initialLoginFormState: LoginFormState = {
  email: "",
  password: "",
  emailError: "",
  passwordError: "",
  step: "email",
  isCheckingEmail: false,
};

function loginFormReducer(state: LoginFormState, action: LoginFormAction): LoginFormState {
  switch (action.type) {
    case "set-field":
      return {
        ...state,
        [action.field]: action.value,
      };
    case "set-error":
      return {
        ...state,
        [action.field]: action.value,
      };
    case "set-step":
      return {
        ...state,
        step: action.value,
      };
    case "set-is-checking-email":
      return {
        ...state,
        isCheckingEmail: action.value,
      };
    case "reset-password-step":
      return {
        ...state,
        step: "email",
        password: "",
        passwordError: "",
      };
    default:
      return state;
  }
}

function getAuthErrorMessage(authError: unknown, fallbackMessage: string) {
  if (!authError || typeof authError !== "object") {
    return fallbackMessage;
  }

  const message = "message" in authError ? authError.message : undefined;

  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  if (
    message &&
    typeof message === "object" &&
    "message" in message &&
    typeof message.message === "string" &&
    message.message.trim().length > 0
  ) {
    return message.message;
  }

  return fallbackMessage;
}

export function LoginForm({ notice, onBack, onForgotPassword, onLoginSuccess }: LoginFormProps) {
  const [state, dispatch] = useReducer(loginFormReducer, initialLoginFormState);
  const queryClient = useQueryClient();

  const validateEmail = (value: string) => {
    const error = getEmailError(value);
    dispatch({ type: "set-error", field: "emailError", value: error });
    return !error;
  };

  const validatePassword = (value: string) => {
    const error = getPasswordError(value, 8);
    dispatch({ type: "set-error", field: "passwordError", value: error });
    return !error;
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateEmail(state.email)) {
      return;
    }

    dispatch({ type: "set-is-checking-email", value: true });

    try {
      const response = await apiFetch("/api/auth/passkey/check-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.email }),
      });

      if (response.ok) {
        const data = await response.json();
        dispatch({
          type: "set-step",
          value: data.hasPasskeys ? "passkey" : "password",
        });
      } else {
        dispatch({ type: "set-step", value: "password" });
      }
    } catch {
      dispatch({ type: "set-step", value: "password" });
    } finally {
      dispatch({ type: "set-is-checking-email", value: false });
    }
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await signIn.email({
        email: state.email,
        password: state.password,
        callbackURL: "/",
      });

      if (error) {
        throw new Error(getAuthErrorMessage(error, "Nieprawidłowy adres email lub hasło"));
      }

      return data;
    },
    onSuccess: async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: ["auth"] });
        await onLoginSuccess();
        toast.success("Zalogowano pomyślnie!");
      } catch {
        toast.warning("Zalogowano, ale nie udało się odświeżyć widoku. Przeładowuję aplikację…");
        window.location.assign("/");
      }
    },
    onError: (error: Error) => {
      dispatch({
        type: "set-error",
        field: "passwordError",
        value: error.message,
      });
      toast.error("Błąd logowania");
    },
  });

  const passkeyLoginMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await signIn.passkey();

      if (error) {
        throw new Error(getAuthErrorMessage(error, "Błąd logowania PassKey"));
      }

      return data;
    },
    onSuccess: async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: ["auth"] });
        await onLoginSuccess();
        toast.success("Zalogowano pomyślnie używając PassKey");
      } catch {
        toast.warning("Zalogowano, ale nie udało się odświeżyć widoku. Przeładowuję aplikację…");
        window.location.assign("/");
      }
    },
    onError: (error: Error) => {
      toast.error(`Błąd logowania PassKey: ${error.message}`);
    },
  });

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (validatePassword(state.password)) {
      loginMutation.mutate();
    }
  };

  const handleBackToEmail = () => {
    dispatch({ type: "reset-password-step" });
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-blue-900/50 bg-linear-to-br from-zinc-800/90 to-zinc-700/90 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            {state.step === "passkey" ? (
              <Fingerprint className="size-12 text-purple-400" />
            ) : (
              <Lock className="size-12 text-blue-400" />
            )}
          </div>
          <h2 className="text-3xl mb-2 text-blue-300">
            {state.step === "passkey" ? "Witaj ponownie" : "Zaloguj się"}
          </h2>
          <p className="text-zinc-400">
            {state.step === "email" && "Wprowadź swój adres e-mail"}
            {state.step === "password" && "Wprowadź hasło do swojego konta"}
            {state.step === "passkey" && "Użyj klucza PassKey aby się zalogować"}
          </p>
        </div>

        {notice && (
          <Alert variant="destructive" className="mb-6 border-red-900/60 bg-red-950/30">
            <CircleAlert />
            <AlertTitle>Nieprawidłowy link resetowania hasła</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {state.step === "email" && (
          <EmailStep
            email={state.email}
            emailError={state.emailError}
            isCheckingEmail={state.isCheckingEmail}
            onEmailChange={(value) => dispatch({ type: "set-field", field: "email", value })}
            onSubmit={handleEmailSubmit}
            onBack={onBack}
          />
        )}
        {state.step === "passkey" && (
          <PasskeyStep
            email={state.email}
            isPending={passkeyLoginMutation.isPending}
            onLogin={() => passkeyLoginMutation.mutate()}
            onBackToEmail={handleBackToEmail}
          />
        )}
        {state.step === "password" && (
          <PasswordStep
            email={state.email}
            password={state.password}
            passwordError={state.passwordError}
            isPending={loginMutation.isPending}
            onPasswordChange={(value) => dispatch({ type: "set-field", field: "password", value })}
            onSubmit={handlePasswordSubmit}
            onBackToEmail={handleBackToEmail}
            onForgotPassword={onForgotPassword}
          />
        )}
      </Card>
    </div>
  );
}
