import { memo } from "react";
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Paperclip,
  ShieldAlert,
  User,
} from "lucide-react";
import { Badge } from "../ui/badge";

interface IncidentSummaryItemProps {
  analystId?: string | null;
  analystName?: string | null;
  className?: string;
  czyRozwiazany?: boolean;
  dataZgloszenia: string;
  id: string;
  llmCategory?: string | null;
  onSelect: (id: string) => void;
  showAnalyst?: boolean;
  showAttachments?: boolean;
  showResolved?: boolean;
  showUser?: boolean;
  status: string;
  userAttachmentPath?: string | null;
  userDescription: string;
  userId: string;
  userName?: string | null;
  userScreenshotPath?: string | null;
}

const getStatusColor = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (
    lowerStatus.includes("zgłoszony") ||
    lowerStatus.includes("nowe") ||
    lowerStatus.includes("raport w trakcie")
  ) {
    return "bg-blue-500/20 text-blue-400 border-blue-500/50";
  }
  if (lowerStatus.includes("trakcie") || lowerStatus.includes("analiza")) {
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  }
  if (
    lowerStatus.includes("rozwiązany") ||
    lowerStatus.includes("zamknięte") ||
    lowerStatus.includes("raport złożony") ||
    lowerStatus.includes("sprawozdanie")
  ) {
    return "bg-green-500/20 text-green-400 border-green-500/50";
  }
  if (lowerStatus.includes("odrzucone")) {
    return "bg-red-500/20 text-red-400 border-red-500/50";
  }
  return "border-zinc-500/50 bg-zinc-500/20 text-zinc-300";
};

const getStatusIcon = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("zgłoszony") || lowerStatus.includes("nowe")) {
    return <AlertCircle className="size-4" />;
  }
  if (lowerStatus.includes("trakcie")) {
    return <Clock className="size-4" />;
  }
  if (
    lowerStatus.includes("rozwiązany") ||
    lowerStatus.includes("zamknięte") ||
    lowerStatus.includes("złożon")
  ) {
    return <CheckCircle2 className="size-4" />;
  }
  return <AlertCircle className="size-4" />;
};

const getLlmCategoryColor = (category: string) => {
  const lowerCategory = category.toLowerCase();
  if (lowerCategory === "czerwony") {
    return "bg-red-500/20 text-red-400 border-red-500/50";
  }
  if (lowerCategory === "żółty") {
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  }
  if (lowerCategory === "zielony") {
    return "bg-green-500/20 text-green-400 border-green-500/50";
  }
  return "border-zinc-500/50 bg-zinc-500/20 text-zinc-300";
};

const formatIncidentDate = (date: string) =>
  new Date(date).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const IncidentSummaryItem = memo(function IncidentSummaryItem({
  analystId,
  analystName,
  className = "",
  czyRozwiazany,
  dataZgloszenia,
  id,
  llmCategory,
  onSelect,
  showAnalyst = false,
  showAttachments = false,
  showResolved = false,
  showUser = false,
  status,
  userAttachmentPath,
  userDescription,
  userId,
  userName,
  userScreenshotPath,
}: IncidentSummaryItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`group relative w-full cursor-pointer rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-left transition-[background-color,border-color] duration-200 hover:border-blue-500/50 hover:bg-zinc-900/80 ${className}`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`${getStatusColor(status)} gap-1`}>
            {getStatusIcon(status)}
            {status}
          </Badge>
          {showResolved && czyRozwiazany && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Rozwiązany</Badge>
          )}
          {llmCategory && (
            <Badge variant="outline" className={`${getLlmCategoryColor(llmCategory)} gap-1`}>
              <BrainCircuit className="size-3" />
              {llmCategory}
            </Badge>
          )}
          {showUser && (
            <span className="ml-1 flex items-center gap-1 text-sm text-zinc-400">
              <User className="size-3" />
              {userName || userId.slice(0, 12)}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500">{formatIncidentDate(dataZgloszenia)}</span>
      </div>

      <p className="mb-3 line-clamp-2 pr-6 text-sm text-zinc-300">{userDescription}</p>

      {(showAnalyst || showAttachments) && (
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          {showAnalyst && (
            <>
              <div className="flex items-center gap-1">
                <User className="size-3" />
                <span>{userName || userId.slice(0, 12)}</span>
              </div>
              {analystName && (
                <div className="flex items-center gap-1">
                  <ShieldAlert className="size-3 text-blue-400" />
                  <span className="text-blue-400">{analystName}</span>
                </div>
              )}
              {!analystId && (
                <Badge
                  variant="outline"
                  className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs"
                >
                  Nieprzypisany
                </Badge>
              )}
            </>
          )}
          {showAttachments && userScreenshotPath && (
            <span className="flex items-center gap-1 text-zinc-400">
              <ImageIcon className="size-3" />
              Zrzut ekranu
            </span>
          )}
          {showAttachments && userAttachmentPath && (
            <span className="flex items-center gap-1 text-zinc-400">
              <Paperclip className="size-3" />
              Załącznik
            </span>
          )}
        </div>
      )}

      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
        <ArrowRight className="size-5" />
      </div>
    </button>
  );
});
