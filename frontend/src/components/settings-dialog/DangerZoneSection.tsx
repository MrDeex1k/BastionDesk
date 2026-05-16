import { Loader2, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface DangerZoneSectionProps {
  isLoading: boolean;
  onDeleteAccount: () => void;
}

export function DangerZoneSection({
  isLoading,
  onDeleteAccount,
}: DangerZoneSectionProps) {
  return (
    <Card className="border-red-900/50 bg-red-950/20 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-red-400">
          <Trash2 className="size-5" />
          Usuwanie konta
        </CardTitle>
        <CardDescription className="text-red-300/60">
          Ta operacja jest nieodwracalna. Wszystkie Twoje dane zostaną trwale
          usunięte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-lg border border-red-900/40 bg-red-950/40 p-4 text-sm text-red-200 shadow-inner">
          <p>Co zostanie usunięte:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-red-200/80">
            <li>Twoje dane profilowe</li>
            <li>Historia Twoich zgłoszeń (anonimizacja)</li>
            <li>Wszystkie ustawienia personalne</li>
          </ul>
        </div>
        <Button
          variant="destructive"
          className="w-full bg-red-600 hover:bg-red-700 text-white"
          onClick={onDeleteAccount}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 size-4" />
          )}
          Usuń konto trwale
        </Button>
      </CardContent>
    </Card>
  );
}
