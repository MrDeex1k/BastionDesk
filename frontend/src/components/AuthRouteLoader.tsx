import { Loader2 } from "lucide-react";

export function AuthRouteLoader() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="size-12 animate-spin text-cyan-400" />
        <p className="text-sm text-zinc-400">Ładowanie…</p>
      </div>
    </div>
  );
}
