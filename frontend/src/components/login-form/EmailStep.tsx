import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface EmailStepProps {
  email: string;
  emailError: string;
  isCheckingEmail: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onBack: () => void;
}

export function EmailStep({
  email,
  emailError,
  isCheckingEmail,
  onEmailChange,
  onSubmit,
  onBack,
}: EmailStepProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
            onChange={(event) => onEmailChange(event.target.value)}
            className="border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
            required
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
            <Loader2 className="mr-2 size-4 animate-spin" />
            Sprawdzanie…
          </>
        ) : (
          "Dalej"
        )}
      </Button>

      <Button
        type="button"
        onClick={onBack}
        variant="ghost"
        className="w-full text-zinc-400 hover:bg-zinc-700/50 hover:text-blue-400"
        size="lg"
      >
        <ArrowLeft className="mr-2 size-4" />
        Powrót do strony głównej
      </Button>
    </form>
  );
}
