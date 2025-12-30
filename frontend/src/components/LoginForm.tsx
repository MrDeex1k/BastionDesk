import { Lock, Mail, KeyRound, ArrowLeft, Loader2, Fingerprint } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const [step, setStep] = useState<"email" | "password" | "passkey">("email");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateEmail(email)) {
      setIsCheckingEmail(true);

      // MOCK: Force passkey flow for specific email
      if (email === "passkeys@mail.pl") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setStep("passkey");
        setIsCheckingEmail(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/passkey/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.hasPasskeys) {
            setStep("passkey");
          } else {
            setStep("password");
          }
        } else {
          // If API fails, fallback to password
          setStep("password");
        }
      } catch (error) {
        console.error("Error checking passkey availability", error);
        setStep("password");
      } finally {
        setIsCheckingEmail(false);
      }
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

  const passkeyLoginMutation = useMutation({
    mutationFn: async () => {
      // MOCK: Handle specific test user
      if (email === "passkeys@mail.pl") {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { role: 'employee' };
      }

      // 1. Get Challenge
      const response = await fetch('/api/auth/passkey/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error("Błąd inicjalizacji logowania PassKey");
      }

      const options = await response.json();
      console.log("PassKey Challenge:", options);

      // 2. Simulate WebAuthn interaction (since we are in a mock environment/iframe, we can't do real WebAuthn easily)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In a real app:
      // const credential = await navigator.credentials.get({ publicKey: ... });
      // await verifyCredential(credential);

      // 3. Mock Success return
      return { role: 'admin' }; // Mocking admin login for PassKey
    },
    onSuccess: (user) => {
      toast.success("Zalogowano pomyślnie używając PassKey");
      onLoginSuccess(user.role);
    },
    onError: (error) => {
      toast.error("Błąd logowania PassKey");
      console.error(error);
    }
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validatePassword(password)) {
      loginMutation.mutate();
    }
  };

  const handlePasskeyLogin = () => {
    passkeyLoginMutation.mutate();
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
            {step === "passkey" ? (
              <Fingerprint className="size-12 text-purple-400" />
            ) : (
              <Lock className="size-12 text-blue-400" />
            )}
          </div>
          <h2 className="text-3xl mb-2 text-blue-300">
            {step === "passkey" ? "Witaj ponownie" : "Zaloguj się"}
          </h2>
          <p className="text-slate-400">
            {step === "email" && "Wprowadź swój adres e-mail"}
            {step === "password" && "Wprowadź hasło do swojego konta"}
            {step === "passkey" && "Użyj klucza PassKey aby się zalogować"}
          </p>
        </div>

        {step === "email" && (
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
                  disabled={isCheckingEmail}
                />
              </div>
              {emailError && <p className="text-red-500 text-sm">{emailError}</p>}
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
              size="lg"
              disabled={isCheckingEmail}
            >
              {isCheckingEmail ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sprawdzanie...
                </>
              ) : (
                "Dalej"
              )}
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
        )}

        {step === "passkey" && (
          <div className="space-y-6">
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

            <Button
              onClick={handlePasskeyLogin}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
              size="lg"
              disabled={passkeyLoginMutation.isPending}
            >
              {passkeyLoginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uwierzytelnianie...
                </>
              ) : (
                <>
                  <Fingerprint className="mr-2 h-5 w-5" />
                  Zaloguj używając PassKey
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={handleBackToEmail}
              variant="ghost"
              className="w-full text-slate-400 hover:text-blue-400 hover:bg-slate-700/50"
              size="lg"
            >
              <ArrowLeft className="size-4 mr-2" />
              Wróć
            </Button>
          </div>
        )}

        {step === "password" && (
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
