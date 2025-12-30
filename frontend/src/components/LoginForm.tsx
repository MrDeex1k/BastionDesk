import { Lock, Mail, KeyRound, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

interface LoginFormProps {
  onBack: () => void;
  onForgotPassword: () => void;
  onLoginSuccess: (role: string) => void;
}

export function LoginForm({ onBack, onForgotPassword, onLoginSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");

  const validateEmail = (value: string) => {
    if (!value.includes("@")) {
      setEmailError("Adres email musi zawierać znak @");
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (value: string) => {
    if (value.length < 8) {
      setPasswordError("Hasło musi mieć co najmniej 8 znaków");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateEmail(email)) {
      setStep("password");
    }
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // --- Mock Users ---
      const mockUsers = [
        { email: 'admin@mail.pl', password: 'asdfghjkl', role: 'admin' },
        { email: 'analityk@mail.pl', password: 'asdfghjkl', role: 'analyst' },
        { email: 'pracownik@mail.pl', password: 'asdfghjkl', role: 'employee' }
      ];

      const user = mockUsers.find(u => u.email === email && u.password === password);

      if (!user) {
        throw new Error("Nieprawidłowy adres email lub hasło");
      }

      return user;
    },
    onSuccess: (user) => {
      console.log("Zalogowano pomyślnie (MOCK):", user);
      onLoginSuccess(user.role);
    },
    onError: (error) => {
      console.log("Błąd logowania (MOCK):", error);
      setPasswordError(error.message);
    }
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validatePassword(password)) {
      loginMutation.mutate();
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setPassword("");
    setPasswordError("");
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md bg-gradient-to-br from-slate-800/90 to-slate-700/90 border-blue-900/50 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <Lock className="size-12 text-blue-400" />
          </div>
          <h2 className="text-3xl mb-2 text-blue-300">
            Zaloguj się
          </h2>
          <p className="text-slate-400">
            {step === "email" 
              ? "Wprowadź swój adres e-mail"
              : "Wprowadź hasło do swojego konta"
            }
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
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
                  className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                  required
                  autoFocus
                />
              </div>
              {emailError && <p className="text-red-500 text-sm">{emailError}</p>}
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
              size="lg"
            >
              Dalej
            </Button>

            <Button
              type="button"
              onClick={onBack}
              variant="ghost"
              className="w-full text-slate-400 hover:text-blue-400 hover:bg-slate-700/50"
              size="lg"
            >
              <ArrowLeft className="size-4 mr-2" />
              Powrót do strony głównej
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-300">
                Adres e-mail
              </Label>
              <div className="flex items-center justify-between bg-slate-900/30 border border-slate-700 rounded-md px-3 py-2">
                <span className="text-slate-300 text-sm">{email}</span>
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  Zmień
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-slate-300"
              >
                Hasło
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                  required
                  autoFocus
                  disabled={loginMutation.isPending}
                />
              </div>
              {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
            </div>

            <div className="flex items-center justify-between text-sm">
              <a
                href="#"
                className="text-blue-400 hover:text-blue-300 transition-colors"
                onClick={onForgotPassword}
              >
                Zapomniałeś hasła?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
              size="lg"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logowanie...
                </>
              ) : (
                "Zaloguj się"
              )}
            </Button>

            <Button
              type="button"
              onClick={handleBackToEmail}
              variant="ghost"
              className="w-full text-slate-400 hover:text-blue-400 hover:bg-slate-700/50"
              size="lg"
              disabled={loginMutation.isPending}
            >
              <ArrowLeft className="size-4 mr-2" />
              Wróć
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}