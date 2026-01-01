import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { KeyRound, LockKeyhole, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Pobierz token z URL query parametrów
    const tokenFromUrl = searchParams.get("token");
    if (!tokenFromUrl) {
      toast.error("Brak tokenu resetowania hasła");
      navigate("/login");
    } else {
      setToken(tokenFromUrl);
    }
  }, [searchParams, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Brak tokenu resetowania hasła");
      return;
    }

    if (password.length < 10) {
      setError("Hasło musi mieć co najmniej 10 znaków");
      return;
    }

    if (password !== confirmPassword) {
      setError("Hasła nie są identyczne");
      return;
    }

    setIsLoading(true);

    try {
      // Wywołanie API Better-Auth do resetowania hasła
      await authClient.resetPassword({
        newPassword: password,
        token: token,
      });
      
      toast.success("Hasło zostało zmienione pomyślnie");
      navigate("/login");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Wystąpił błąd podczas zmiany hasła";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md bg-linear-to-br from-slate-800/90 to-slate-700/90 border-blue-900/50 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <LockKeyhole className="size-12 text-blue-400" />
          </div>
          <h2 className="text-3xl mb-2 text-blue-300">
            Ustaw nowe hasło
          </h2>
          <p className="text-slate-400">
            Wprowadź nowe hasło dla swojego konta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              Nowe hasło
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-300">
              Powtórz nowe hasło
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                required
                disabled={isLoading}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zapisywanie...
              </>
            ) : (
              "Zmień hasło"
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}