import { ArrowLeft, Fingerprint, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

interface PasskeyStepProps {
  email: string;
  isPending: boolean;
  onLogin: () => void;
  onBackToEmail: () => void;
}

export function PasskeyStep({ email, isPending, onLogin, onBackToEmail }: PasskeyStepProps) {
  return (
    <div className="space-y-6">
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

      <Button
        onClick={onLogin}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
        size="lg"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Uwierzytelnianie…
          </>
        ) : (
          <>
            <Fingerprint className="mr-2 size-5" />
            Zaloguj używając PassKey
          </>
        )}
      </Button>

      <Button
        type="button"
        onClick={onBackToEmail}
        variant="ghost"
        className="w-full text-zinc-400 hover:bg-zinc-700/50 hover:text-blue-400"
        size="lg"
      >
        <ArrowLeft className="mr-2 size-4" />
        Wróć
      </Button>
    </div>
  );
}
