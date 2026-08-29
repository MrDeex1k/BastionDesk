import { Mail, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, readJsonError } from "@/lib/api";
import { validateEmail as getEmailError } from "@/lib/validation";

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  const validateEmail = (value: string) => {
    const error = getEmailError(value);
    setEmailError(error);
    return !error;
  };

  const forgotPasswordMutation = useMutation({
    mutationFn: async () => {
      // Wywołanie aktualnego endpointu Better Auth do resetu hasła.
      const response = await apiFetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, "Błąd wysyłania żądania resetu"));
      }

      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
      setMessage({
        type: "success",
        text: "Jeśli e-mail jest poprawny, w ciągu paru minut otrzymasz link do resetu hasła!",
      });
      setEmail("");
    },
    onError: (error: Error) => {
      setMessage({
        type: "error",
        text:
          error.message || "Nie udało się wysłać żądania resetu. Spróbuj ponownie za kilka minut!",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const isEmailValid = validateEmail(email);

    if (!isEmailValid) {
      return;
    }

    forgotPasswordMutation.mutate();
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-blue-900/50 bg-linear-to-br from-zinc-800/90 to-zinc-700/90 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-4">
            <KeyRound className="size-12 text-purple-400" />
          </div>
          <h2 className="mb-2 text-3xl text-purple-300">Resetuj hasło</h2>
          <p className="text-zinc-400">
            Podaj swój adres e-mail, aby otrzymać link do resetu hasła
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-purple-500 focus:ring-purple-500/20"
                required
                disabled={forgotPasswordMutation.isPending}
              />
            </div>
            {emailError && <p className="text-red-400 text-sm">{emailError}</p>}
          </div>

          {message && (
            <div
              className={`p-4 rounded-lg border ${
                message.type === "success"
                  ? "bg-green-500/10 border-green-500/30 text-green-300"
                  : "bg-red-500/10 border-red-500/30 text-red-300"
              }`}
            >
              <p className="text-sm">{message.text}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
            size="lg"
            disabled={forgotPasswordMutation.isPending}
          >
            {forgotPasswordMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Wysyłanie…
              </>
            ) : (
              "Wyślij link resetujący"
            )}
          </Button>

          <Button
            type="button"
            onClick={onBack}
            variant="ghost"
            className="w-full text-zinc-400 hover:bg-zinc-700/50 hover:text-purple-400"
            size="lg"
            disabled={forgotPasswordMutation.isPending}
          >
            <ArrowLeft className="size-4 mr-2" />
            Powrót do logowania
          </Button>
        </form>
      </Card>
    </div>
  );
}
