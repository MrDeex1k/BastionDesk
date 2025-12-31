import { Mail, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const validateEmail = (value: string) => {
    if (!value.includes("@")) {
      setEmailError("Adres email musi zawierać znak @");
      return false;
    }
    setEmailError("");
    return true;
  };

  const forgotPasswordMutation = useMutation({
    mutationFn: async () => {
      // Symulacja wysyłania żądania resetu hasła
      // Tutaj będzie rzeczywista logika z Supabase
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Symulacja losowego błędu (10% szans)
      if (Math.random() < 0.1) {
        throw new Error("Network error");
      }

      return true;
    },
    onSuccess: () => {
      setMessage({
        type: "success",
        text: "Jeśli e-mail jest poprawny, w ciągu paru minut otrzymasz link do resetu hasła!",
      });
      setEmail("");
    },
    onError: () => {
      setMessage({
        type: "error",
        text: "Nie udało się wysłać żądania resetu. Spróbuj ponownie za kilka minut!",
      });
    }
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
      <Card className="w-full max-w-md bg-linear-to-br from-slate-800/90 to-slate-700/90 border-blue-900/50 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-4">
            <KeyRound className="size-12 text-purple-400" />
          </div>
          <h2 className="text-3xl mb-2 text-purple-300">
            Resetuj hasło
          </h2>
          <p className="text-slate-400">
            Podaj swój adres e-mail, aby otrzymać link do resetu hasła
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              Adres e-mail
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="twoj@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                required
                disabled={forgotPasswordMutation.isPending}
              />
            </div>
            {emailError && (
              <p className="text-red-400 text-sm">{emailError}</p>
            )}
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wysyłanie...
              </>
            ) : (
              "Wyślij link resetujący"
            )}
          </Button>

          <Button
            type="button"
            onClick={onBack}
            variant="ghost"
            className="w-full text-slate-400 hover:text-purple-400 hover:bg-slate-700/50"
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
