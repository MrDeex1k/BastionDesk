import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { UserPlus, Mail, KeyRound, User, ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

interface RegisterFormProps {
  onBack: () => void;
  onRegisterSuccess: () => void;
}

export function RegisterForm({ onBack, onRegisterSuccess }: RegisterFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [fullNameError, setFullNameError] = useState("");

  const validateForm = () => {
    let isValid = true;

    if (!email.includes("@")) {
      setEmailError("Adres email musi zawierać znak @");
      isValid = false;
    } else if (!email.trim()) {
      setEmailError("Adres email jest wymagany");
      isValid = false;
    } else {
      setEmailError("");
    }

    if (password.length < 12) {
      setPasswordError("Hasło musi mieć co najmniej 12 znaków");
      isValid = false;
    } else if (!password.trim()) {
      setPasswordError("Hasło jest wymagane");
      isValid = false;
    } else {
      setPasswordError("");
    }

    const nameParts = fullName.trim().split(/\s+/);
    if (nameParts.length < 2) {
      setFullNameError("Proszę podać imię i nazwisko (co najmniej dwa wyrazy)");
      isValid = false;
    } else if (!fullName.trim()) {
      setFullNameError("Imię i nazwisko jest wymagane");
      isValid = false;
    } else {
      setFullNameError("");
    }

    return isValid;
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // --- Mock Sytuacji ---
      // Wymagane dane testowe: Jan Kowalski; jankowalski@gmail.com; asdfghjklzxcvbnm
      if (
        fullName === "Jan Kowalski" && 
        email === "jankowalski@gmail.com" && 
        password === "asdfghjklzxcvbnm"
      ) {
        return true;
      } else {
        throw new Error("Błąd rejestracji (Symulacja: użyj danych testowych)");
      }
    },
    onSuccess: () => {
      console.log("Rejestracja pomyślna (MOCK)");
      onRegisterSuccess();
    },
    onError: (error) => {
      console.log("Błąd rejestracji (MOCK):", error);
      setFullNameError(error.message);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      registerMutation.mutate();
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md bg-gradient-to-br from-slate-800/90 to-slate-700/90 border-cyan-900/50 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-4">
            <UserPlus className="size-12 text-cyan-400" />
          </div>
          <h2 className="text-3xl mb-2 text-cyan-300">
            Dołącz do nas
          </h2>
          <p className="text-slate-400">
            Wypełnij formularz, aby utworzyć konto
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-slate-300">
              Imię i nazwisko
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="fullName"
                type="text"
                placeholder="Jan Kowalski"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={registerMutation.isPending}
              />
            </div>
            {fullNameError && <p className="text-red-500 text-sm">{fullNameError}</p>}
          </div>

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
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={registerMutation.isPending}
              />
            </div>
            {emailError && <p className="text-red-500 text-sm">{emailError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
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
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={registerMutation.isPending}
              />
            </div>
            {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
          </div>

          <Button
            type="submit"
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg shadow-cyan-500/20"
            size="lg"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rejestracja...
              </>
            ) : (
              "Utwórz konto"
            )}
          </Button>

          <Button
            type="button"
            onClick={onBack}
            variant="ghost"
            className="w-full text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50"
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
