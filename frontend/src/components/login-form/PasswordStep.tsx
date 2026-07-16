import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface PasswordStepProps {
  email: string;
  password: string;
  passwordError: string;
  isPending: boolean;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onBackToEmail: () => void;
  onForgotPassword: () => void;
}

export function PasswordStep({
  email,
  password,
  passwordError,
  isPending,
  onPasswordChange,
  onSubmit,
  onBackToEmail,
  onForgotPassword,
}: PasswordStepProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label className="text-zinc-300">Adres e-mail</Label>
        <div className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900/30 px-3 py-2">
          <span className="text-sm text-zinc-300">{email}</span>
          <button
            type="button"
            onClick={onBackToEmail}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Zmień
          </button>
        </div>
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
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
            required
            disabled={isPending}
          />
        </div>
        {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-blue-400 hover:text-blue-300 transition-colors"
          onClick={onForgotPassword}
        >
          Zapomniałeś hasła?
        </button>
      </div>

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
        size="lg"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Logowanie…
          </>
        ) : (
          "Zaloguj się"
        )}
      </Button>

      <Button
        type="button"
        onClick={onBackToEmail}
        variant="ghost"
        className="w-full text-zinc-400 hover:bg-zinc-700/50 hover:text-blue-400"
        size="lg"
        disabled={isPending}
      >
        <ArrowLeft className="mr-2 size-4" />
        Wróć
      </Button>
    </form>
  );
}
