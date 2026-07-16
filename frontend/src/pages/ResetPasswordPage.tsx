import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { KeyRound, LockKeyhole, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isNavigating, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      toast.error("Brak tokenu resetowania hasła");
      void navigate("/login");
    }
  }, [token, navigate]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (newPassword: string) =>
      authClient.resetPassword({
        newPassword,
        token: token ?? "",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["auth"],
      });
      toast.success("Hasło zostało zmienione pomyślnie");
      startTransition(() => {
        void navigate("/login");
      });
    },
    onError: (err: unknown) => {
      const errorMessage =
        err instanceof Error ? err.message : "Wystąpił błąd podczas zmiany hasła";
      toast.error(errorMessage);
      setError(errorMessage);
    },
  });

  const isSubmitting = resetPasswordMutation.isPending || isNavigating;

  const handleSubmit = (e: React.FormEvent) => {
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

    resetPasswordMutation.mutate(password);
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-blue-900/50 bg-linear-to-br from-zinc-900/95 to-zinc-800/95 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <LockKeyhole className="size-12 text-blue-400" />
          </div>
          <h2 className="text-3xl mb-2 text-blue-300">Ustaw nowe hasło</h2>
          <p className="text-zinc-400">Wprowadź nowe hasło dla swojego konta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">
              Nowe hasło
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-zinc-700 bg-zinc-950/60 pl-10 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-zinc-300">
              Powtórz nowe hasło
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-zinc-700 bg-zinc-950/60 pl-10 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
                required
                disabled={isSubmitting}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Zapisywanie…
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
