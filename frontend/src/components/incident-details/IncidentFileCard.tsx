import type { LucideIcon } from "lucide-react";
import { CheckCircle2, FileDown } from "lucide-react";
import type { ApiFileMetadata } from "@/ApiModel";
import { Button } from "../ui/button";

interface IncidentFileCardProps {
  title: string;
  path?: string | null;
  metadata?: ApiFileMetadata | null;
  fallbackFilename: string;
  icon: LucideIcon;
  isAssignedToMe: boolean;
  mode: "employee" | "analyst" | "admin";
  onDownload: (filename: string) => void;
}

export function IncidentFileCard({
  title,
  path,
  metadata,
  fallbackFilename,
  icon: Icon,
  isAssignedToMe,
  mode,
  onDownload,
}: IncidentFileCardProps) {
  const filename = metadata?.originalName || metadata?.filename || fallbackFilename;
  const hasFile = Boolean(path);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-4 ${
        hasFile ? "bg-blue-500/5 border-blue-500/20" : "bg-zinc-950/30 border-zinc-800"
      }`}
    >
      <div
        className={`rounded-full p-2 ${
          hasFile ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-600"
        }`}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium text-zinc-300">{title}</p>
        <p className={`text-xs truncate ${hasFile ? "text-green-400" : "text-zinc-500"}`}>
          {hasFile ? filename : "Brak pliku"}
        </p>
      </div>
      {hasFile && (
        <Button
          size="sm"
          variant="outline"
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 shrink-0"
          onClick={() => onDownload(filename)}
        >
          <FileDown className="mr-1 size-4" />
          Pobierz
        </Button>
      )}
      {hasFile && !isAssignedToMe && mode !== "admin" && (
        <CheckCircle2 className="ml-auto size-5 shrink-0 text-green-500" />
      )}
    </div>
  );
}
