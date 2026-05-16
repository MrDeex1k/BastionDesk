import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import type { PassKey } from "@/ApiModel";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface PassKeysSectionProps {
  passKeys: PassKey[];
  isLoadingPassKeys: boolean;
  onAddPassKey: () => void;
  onDeletePassKey: (id: string) => void;
}

const passKeyDateFormatter = new Intl.DateTimeFormat("pl-PL");

const formatPassKeyDate = (value: string | Date) =>
  passKeyDateFormatter.format(new Date(value));

export function PassKeysSection({
  passKeys,
  isLoadingPassKeys,
  onAddPassKey,
  onDeletePassKey,
}: PassKeysSectionProps) {
  return (
    <Card className="border-zinc-700 bg-zinc-900 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
              <Fingerprint className="size-5 text-violet-400" />
              PassKeys
            </CardTitle>
            <CardDescription className="mt-1 text-zinc-400">
              Zarządzaj kluczami sprzętowymi i biometrią.
            </CardDescription>
          </div>
          <Button
            onClick={onAddPassKey}
            disabled={isLoadingPassKeys}
            size="sm"
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {isLoadingPassKeys ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-2 size-4" />
                Dodaj klucz
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {passKeys.length > 0 ? (
            passKeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-violet-500/10 p-2">
                    <Fingerprint className="size-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {pk.name}
                    </p>
                    <p className="text-xs text-zinc-500" suppressHydrationWarning>
                      Dodano: {formatPassKeyDate(pk.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-200/90 hover:bg-red-950/30 hover:text-white"
                  onClick={() => onDeletePassKey(pk.id)}
                  disabled={isLoadingPassKeys}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/50 py-6 text-center text-zinc-500">
              {isLoadingPassKeys ? (
                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              ) : (
                <>
                  <Fingerprint className="mx-auto mb-2 size-8 opacity-50" />
                  <p>Brak skonfigurowanych kluczy PassKey</p>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
