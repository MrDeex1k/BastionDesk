import type { LucideIcon } from "lucide-react";
import { CheckCircle2, FileDown } from "lucide-react";
import type { useAttachmentScan } from "./attachment-scan";
import type { AttachmentScan, ScanResult } from "@/lib/yara";
import type { ApiFileMetadata } from "@/ApiModel";
import { Button } from "../ui/button";

const scanLabels: Record<AttachmentScan["state"], string> = {
  unscanned: "Plik nie był skanowany.",
  pending: "Oczekuje na skan YARA.",
  running: "Skanowanie YARA trwa.",
  clean: "Skan YARA bez dopasowań.",
  matched: "YARA wykryła dopasowanie. Pobieranie zablokowane.",
  failed: "Skan YARA zakończył się błędem. Pobieranie zablokowane.",
  stale: "Wynik YARA wymaga odświeżenia.",
};

interface IncidentFileCardProps {
  title: string;
  path?: string | null;
  metadata?: ApiFileMetadata | null;
  fallbackFilename: string;
  icon: LucideIcon;
  isAssignedToMe: boolean;
  mode: "employee" | "analyst" | "admin";
  onDownload: (filename: string) => void;
  scan?: ReturnType<typeof useAttachmentScan>;
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
  scan,
}: IncidentFileCardProps) {
  const filename = metadata?.originalName || metadata?.filename || fallbackFilename;
  const styles = path
    ? {
        card: "bg-blue-500/5 border-blue-500/20",
        icon: "bg-blue-500/20 text-blue-400",
        filename: "text-green-400",
      }
    : {
        card: "bg-zinc-950/30 border-zinc-800",
        icon: "bg-zinc-800 text-zinc-600",
        filename: "text-zinc-500",
      };

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 ${styles.card}`}>
      <div className={`rounded-full p-2 ${styles.icon}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-300">{title}</p>
        <p className={`text-xs truncate ${styles.filename}`}>{path ? filename : "Brak pliku"}</p>
        {path && scan && <ScanDetails scan={scan} />}
      </div>
      {path && (
        <FileActions
          title={title}
          download={() => onDownload(filename)}
          scan={scan}
          showCheck={!isAssignedToMe && mode !== "admin"}
        />
      )}
    </div>
  );
}

function FileActions({
  title,
  download,
  scan,
  showCheck,
}: {
  title: string;
  download: () => void;
  scan: IncidentFileCardProps["scan"];
  showCheck: boolean;
}) {
  return (
    <>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
          aria-label={`Pobierz ${title}`}
          disabled={scan && !scan.downloadingAllowed}
          onClick={download}
        >
          <FileDown className="mr-1 size-4" />
          Pobierz
        </Button>
        {scan?.request && (
          <Button size="sm" variant="outline" disabled={scan.requesting} onClick={scan.request}>
            {scan.value?.state === "failed" ? "Ponów skan" : "Przeskanuj plik"}
          </Button>
        )}
      </div>
      {showCheck && <CheckCircle2 className="ml-auto size-5 shrink-0 text-green-500" />}
    </>
  );
}

function ScanDetails({ scan }: { scan: NonNullable<IncidentFileCardProps["scan"]> }) {
  const { loading, error, value } = scan;
  return (
    <>
      <p role="status" className="mt-1 text-xs text-zinc-300">
        {loading ? "Sprawdzanie statusu skanu…" : value && scanLabels[value.state]}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
      {value?.latest && (
        <details className="mt-1 text-xs text-zinc-400">
          <summary className="cursor-pointer">Szczegóły skanu YARA</summary>
          <ScanResultDetails result={value.latest} />
          {value.history?.map((entry) => (
            <details className="mt-2" key={entry.ruleVersion}>
              <summary className="cursor-pointer">
                Poprzedni wynik z {formatScanDate(entry.scannedAt)}
              </summary>
              <ScanResultDetails result={entry} />
            </details>
          ))}
        </details>
      )}
    </>
  );
}

function formatScanDate(date: string | null) {
  return date ? new Date(date).toLocaleString("pl-PL") : "–";
}

function ScanResultDetails({ result }: { result: ScanResult }) {
  return (
    <dl className="mt-1 break-all">
      <dt>Źródło</dt>
      <dd>YARA w BastionDesk</dd>
      <dt>SHA-256</dt>
      <dd>{result.sha256}</dd>
      <dt>Wersja reguł</dt>
      <dd>{result.ruleVersion}</dd>
      {result.scannedAt && (
        <>
          <dt>Zakończono</dt>
          <dd>{formatScanDate(result.scannedAt)}</dd>
        </>
      )}
      {result.matches.length > 0 && (
        <>
          <dt>Dopasowane reguły</dt>
          <dd>{result.matches.join(", ")}</dd>
        </>
      )}
    </dl>
  );
}
