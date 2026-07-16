import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { IncidentDetail, IncidentDetailResponse } from "@/ApiModel";
import { apiFetch } from "@/lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { IncidentFileCard } from "./incident-details/IncidentFileCard";
import { UploadFileDialog } from "./incident-details/UploadFileDialog";
import { useIncidentUpload } from "./incident-details/useIncidentUpload";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Image as ImageIcon,
  User,
  ShieldAlert,
  FileDown,
  UserPlus,
  UserMinus,
  Loader2,
  ArrowRight,
  XCircle,
  Save,
  Paperclip,
  CheckSquare,
} from "lucide-react";

interface IncidentDetailsProps {
  incidentId: string;
  onBack: () => void;
  mode?: "employee" | "analyst" | "admin";
}

const getStatusColor = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (
    lowerStatus.includes("zgłoszony") ||
    lowerStatus.includes("nowe") ||
    lowerStatus.includes("raport w trakcie")
  )
    return "bg-blue-500/20 text-blue-400 border-blue-500/50";
  if (lowerStatus.includes("trakcie") || lowerStatus.includes("analiza"))
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  if (
    lowerStatus.includes("rozwiązany") ||
    lowerStatus.includes("zamknięte") ||
    lowerStatus.includes("raport złożony") ||
    lowerStatus.includes("sprawozdanie")
  )
    return "bg-green-500/20 text-green-400 border-green-500/50";
  if (lowerStatus.includes("odrzucone")) return "bg-red-500/20 text-red-400 border-red-500/50";
  return "border-zinc-500/50 bg-zinc-500/20 text-zinc-300";
};

type ActionType = "status" | "upload_report" | "upload_statement";

const getAvailableTransitions = (
  currentStatus: string,
): {
  label: string;
  value: string;
  variant?: string;
  icon: LucideIcon;
  actionType?: ActionType;
}[] => {
  switch (currentStatus) {
    case "Zgłoszony":
      return [
        {
          label: "Odrzuć",
          value: "Odrzucone",
          variant: "destructive",
          icon: XCircle,
          actionType: "status",
        },
      ];
    case "Raport w trakcie":
      return [
        {
          label: "Złóż raport",
          value: "Raport złożony",
          variant: "default",
          icon: ArrowRight,
          actionType: "upload_report",
        },
      ];
    case "Raport złożony":
      return [
        {
          label: "Rozpocznij sprawozdanie",
          value: "Sprawozdanie w trakcie",
          variant: "default",
          icon: ArrowRight,
          actionType: "status",
        },
      ];
    case "Sprawozdanie w trakcie":
      return [
        {
          label: "Zakończ zgłoszenie",
          value: "Sprawozdanie złożone",
          variant: "default",
          icon: CheckCircle2,
          actionType: "upload_statement",
        },
      ];
    default:
      return [];
  }
};

type IncidentTransition = ReturnType<typeof getAvailableTransitions>[number];

interface UseIncidentDetailsActionsArgs {
  incidentId: string;
  mode: NonNullable<IncidentDetailsProps["mode"]>;
  noteContent: string;
  onBack: () => void;
  queryClient: QueryClient;
  setIsUploadDialogOpen: (open: boolean) => void;
  setUploadType: (type: "report" | "statement" | null) => void;
}

function useIncidentDetailsActions({
  incidentId,
  mode,
  noteContent,
  onBack,
  queryClient,
  setIsUploadDialogOpen,
  setUploadType,
}: UseIncidentDetailsActionsArgs) {
  const assignMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        mode === "admin"
          ? `/api/admin/incidents/${incidentId}/assign`
          : `/api/analyst/incidents/${incidentId}/assign`;

      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to assign incident");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Incydent został przypisany do Ciebie");
      void queryClient.invalidateQueries({
        queryKey: ["incident", incidentId],
        exact: false,
      });
      void queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Nie udało się przypisać incydentu");
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        mode === "admin"
          ? `/api/admin/incidents/${incidentId}/unassign`
          : `/api/analyst/incidents/${incidentId}/unassign`;

      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to unassign incident");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Incydent został oddany do puli");
      queryClient.setQueryData(
        ["incident", incidentId],
        (old: IncidentDetailResponse | undefined) => ({
          ...old,
          data: {
            ...old?.data,
            analystId: null,
            analystName: undefined,
            status: "Zgłoszony",
          } as IncidentDetail,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
      onBack();
    },
    onError: () => {
      toast.error("Nie udało się oddać incydentu");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const response = await apiFetch(`/api/analyst/incidents/${incidentId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: (_data: unknown, variables) => {
      toast.success(`Status zmieniony na: ${variables}`);
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      void queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Nie udało się zmienić statusu");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/api/analyst/incidents/${incidentId}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Failed to resolve incident");

      return response.json();
    },
    onSuccess: () => {
      toast.success("Incydent oznaczony jako rozwiązany");
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      void queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Nie udało się oznaczyć incydentu jako rozwiązany");
    },
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/api/analyst/incidents/${incidentId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteContent }),
      });

      if (!response.ok) throw new Error("Failed to update notes");

      return response.json();
    },
    onSuccess: () => {
      toast.success("Notatka została zapisana");
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    },
    onError: () => {
      toast.error("Nie udało się zapisać notatki");
    },
  });

  const downloadFile = useCallback(
    async (type: "reports" | "statements" | "screenshots" | "attachments", filename: string) => {
      try {
        let url = "";
        if (mode === "admin") {
          url = `/api/admin/incidents/${incidentId}/files/${type}/${encodeURIComponent(filename)}`;
        } else if (mode === "analyst") {
          url = `/api/analyst/incidents/${incidentId}/files/${type}/${encodeURIComponent(filename)}`;
        } else {
          url = `/api/incidents/${incidentId}/files/${type}/${encodeURIComponent(filename)}`;
        }

        const response = await apiFetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to download file: ${errorText}`);
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(anchor);
        toast.success("Plik został pobrany");
      } catch {
        toast.error("Nie udało się pobrać pliku");
      }
    },
    [incidentId, mode],
  );

  const handleTransitionClick = useCallback(
    (transition: IncidentTransition) => {
      if (transition.actionType === "upload_report") {
        setUploadType("report");
        setIsUploadDialogOpen(true);
      } else if (transition.actionType === "upload_statement") {
        setUploadType("statement");
        setIsUploadDialogOpen(true);
      } else {
        statusMutation.mutate(transition.value);
      }
    },
    [setIsUploadDialogOpen, setUploadType, statusMutation],
  );

  return {
    assignMutation,
    unassignMutation,
    statusMutation,
    resolveMutation,
    notesMutation,
    downloadFile,
    handleTransitionClick,
  };
}

export function IncidentDetails({ incidentId, onBack, mode = "employee" }: IncidentDetailsProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentAnalystId = user?.id || null;
  const [noteDraft, setNoteDraft] = useState<{
    incidentId: string | null;
    value: string;
  }>({
    incidentId: null,
    value: "",
  });
  const {
    isUploadDialogOpen,
    selectedFile,
    setIsUploadDialogOpen,
    setSelectedFile,
    setUploadType,
    uploadFileMutation,
    uploadType,
  } = useIncidentUpload({ incidentId, queryClient });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["incident", incidentId, mode],
    queryFn: async () => {
      // --- REAL SERVER IMPLEMENTATION ---
      const endpoint =
        mode === "analyst"
          ? `/api/analyst/incidents/${incidentId}`
          : mode === "admin"
            ? `/api/admin/incidents/${incidentId}`
            : `/api/incidents/${incidentId}`;

      const response = await apiFetch(endpoint);
      if (!response.ok) throw new Error("Failed to fetch incident details");
      return response.json() as Promise<IncidentDetailResponse>;
    },
  });
  const incident = data?.data;
  const incidentAnalystNote = incident?.analystNote;
  const incidentIdValue = incident?.id;
  const incidentStatus = incident?.status;
  const submittedAtLabel = useMemo(
    () => formatLocalizedDateTime(incident?.dataZgloszenia),
    [incident?.dataZgloszenia],
  );
  const createdAtLabel = useMemo(
    () => formatLocalizedDateTime(incident?.createdAt),
    [incident?.createdAt],
  );
  const noteContent = useMemo(
    () =>
      incidentIdValue && noteDraft.incidentId === incidentIdValue
        ? noteDraft.value
        : (incidentAnalystNote ?? ""),
    [incidentAnalystNote, incidentIdValue, noteDraft.incidentId, noteDraft.value],
  );
  const isAssignedToMe = incident?.analystId === currentAnalystId;
  const nextTransitions = useMemo(
    () => (incidentStatus ? getAvailableTransitions(incidentStatus) : []),
    [incidentStatus],
  );
  const {
    assignMutation,
    unassignMutation,
    statusMutation,
    resolveMutation,
    notesMutation,
    downloadFile,
    handleTransitionClick,
  } = useIncidentDetailsActions({
    incidentId,
    mode,
    noteContent,
    onBack,
    queryClient,
    setIsUploadDialogOpen,
    setUploadType,
  });
  const handleNoteChange = useCallback(
    (value: string) => {
      if (!incident?.id) {
        return;
      }

      setNoteDraft({ incidentId: incident.id, value });
    },
    [incident],
  );
  const handleSaveNote = useCallback(() => {
    notesMutation.mutate();
  }, [notesMutation]);

  if (isLoading) {
    return (
      <Card className="h-full w-full border-zinc-800 bg-zinc-900/50 shadow-xl">
        <CardHeader>
          <Skeleton className="h-8 w-1/3 bg-zinc-800" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full bg-zinc-800" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-12 w-full bg-zinc-800" />
            <Skeleton className="h-12 w-full bg-zinc-800" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !incident) {
    return (
      <Card className="w-full border-zinc-800 bg-zinc-900/50 p-8 text-center shadow-xl">
        <div className="flex flex-col items-center gap-4 text-red-400">
          <ShieldAlert className="size-12" />
          <h3 className="text-xl font-semibold">Błąd pobierania danych</h3>
          <p className="text-zinc-400">Nie udało się załadować szczegółów incydentu.</p>
          <Button onClick={onBack} variant="outline" className="mt-4 border-zinc-700 text-zinc-300">
            Wróć do listy
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full border-zinc-800 bg-zinc-900/50 shadow-xl animate-in slide-in-from-right-4 duration-300">
        <IncidentHeader
          assignPending={assignMutation.isPending}
          incident={incident}
          isAssignedToMe={isAssignedToMe}
          mode={mode}
          nextTransitions={nextTransitions}
          onAssign={() => assignMutation.mutate()}
          onBack={onBack}
          onResolve={() => resolveMutation.mutate()}
          onTransition={handleTransitionClick}
          onUnassign={() => unassignMutation.mutate()}
          resolvePending={resolveMutation.isPending}
          statusPending={statusMutation.isPending}
          submittedAtLabel={submittedAtLabel}
          unassignPending={unassignMutation.isPending}
        />

        <CardContent className="pt-6 space-y-8">
          <div className="space-y-3">
            <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
              Opis zgłoszenia
            </h3>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 leading-relaxed text-zinc-100">
              {incident.userDescription}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IncidentFileCard
              title="Zrzut ekranu"
              path={incident.userScreenshotPath}
              metadata={incident.userScreenshotMetadata}
              fallbackFilename="screenshot"
              icon={ImageIcon}
              isAssignedToMe={isAssignedToMe}
              mode={mode}
              onDownload={(filename) => downloadFile("screenshots", filename)}
            />
            <IncidentFileCard
              title="Załącznik"
              path={incident.userAttachmentPath}
              metadata={incident.userAttachmentMetadata}
              fallbackFilename="attachment"
              icon={Paperclip}
              isAssignedToMe={isAssignedToMe}
              mode={mode}
              onDownload={(filename) => downloadFile("attachments", filename)}
            />
          </div>

          <IncidentServiceSection
            incident={incident}
            isAssignedToMe={isAssignedToMe}
            mode={mode}
            noteContent={noteContent}
            notesPending={notesMutation.isPending}
            onDownload={downloadFile}
            onNoteChange={handleNoteChange}
            onSaveNote={handleSaveNote}
          />

          {createdAtLabel && (
            <div className="pt-4 text-right font-mono text-xs text-zinc-500">
              Utworzono: {createdAtLabel}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadFileDialog
        open={isUploadDialogOpen}
        uploadType={uploadType}
        selectedFile={selectedFile}
        isUploading={uploadFileMutation.isPending}
        onOpenChange={setIsUploadDialogOpen}
        onFileChange={setSelectedFile}
        onUpload={() => uploadFileMutation.mutate()}
      />
    </>
  );
}

interface IncidentHeaderProps {
  assignPending: boolean;
  incident: IncidentDetail;
  isAssignedToMe: boolean;
  mode: NonNullable<IncidentDetailsProps["mode"]>;
  nextTransitions: IncidentTransition[];
  onAssign: () => void;
  onBack: () => void;
  onResolve: () => void;
  onTransition: (transition: IncidentTransition) => void;
  onUnassign: () => void;
  resolvePending: boolean;
  statusPending: boolean;
  submittedAtLabel: string;
  unassignPending: boolean;
}

function IncidentHeader({
  assignPending,
  incident,
  isAssignedToMe,
  mode,
  nextTransitions,
  onAssign,
  onBack,
  onResolve,
  onTransition,
  onUnassign,
  resolvePending,
  statusPending,
  submittedAtLabel,
  unassignPending,
}: IncidentHeaderProps) {
  return (
    <CardHeader className="border-b border-zinc-800/50 pb-4">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft className="mr-1 size-4" />
          Powrót
        </Button>
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-3 text-2xl text-zinc-100">
            Incydent #{incident.id.slice(0, 8)}
            {incident.czyRozwiazany && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/50 ml-2">
                <CheckSquare className="mr-1 size-3" />
                Rozwiązany
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="mt-1 flex items-center gap-2 text-zinc-500">
            <Calendar className="size-3" />
            {submittedAtLabel}
            {incident.userName && (
              <>
                <span className="mx-1">•</span>
                <User className="size-3" />
                {incident.userName}
              </>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <Badge className={`${getStatusColor(incident.status)} px-4 py-1.5 text-sm`}>
            {incident.status}
          </Badge>

          {mode === "admin" && incident.analystId && (
            <UnassignButton isPending={unassignPending} onClick={onUnassign} />
          )}

          {mode === "analyst" && isAssignedToMe && (
            <Button
              size="sm"
              className={
                incident.czyRozwiazany
                  ? "border-green-900/50 bg-green-900/20 text-green-400 hover:bg-green-900/30"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }
              variant={incident.czyRozwiazany ? "outline" : "default"}
              onClick={() => !incident.czyRozwiazany && onResolve()}
              disabled={resolvePending || incident.czyRozwiazany}
            >
              {resolvePending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckSquare className="mr-2 size-4" />
              )}
              {incident.czyRozwiazany ? "Rozwiązano" : "Oznacz jako rozwiązane"}
            </Button>
          )}

          {mode === "analyst" && (
            <>
              {!incident.analystId && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={onAssign}
                  disabled={assignPending}
                >
                  {assignPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 size-4" />
                  )}
                  Przypisz do mnie
                </Button>
              )}

              {(!incident.analystId || isAssignedToMe) &&
                nextTransitions.map((transition) => (
                  <TransitionButton
                    key={transition.value}
                    isAssignedToMe={isAssignedToMe}
                    isPending={statusPending}
                    onClick={() => onTransition(transition)}
                    transition={transition}
                  />
                ))}

              {isAssignedToMe && (
                <UnassignButton isPending={unassignPending} onClick={onUnassign} />
              )}
            </>
          )}
        </div>
      </div>
    </CardHeader>
  );
}

function formatLocalizedDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("pl-PL");
}

function UnassignButton({ isPending, onClick }: { isPending: boolean; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
      onClick={onClick}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <UserMinus className="mr-2 size-4" />
      )}
      Oddaj do puli
    </Button>
  );
}

function TransitionButton({
  isAssignedToMe,
  isPending,
  onClick,
  transition,
}: {
  isAssignedToMe: boolean;
  isPending: boolean;
  onClick: () => void;
  transition: IncidentTransition;
}) {
  const variant = isAssignedToMe
    ? "default"
    : ((transition.variant as
        | "default"
        | "destructive"
        | "outline"
        | "secondary"
        | "ghost"
        | "link") ?? "outline");

  return (
    <Button
      size="sm"
      variant={variant}
      className={
        isAssignedToMe
          ? "bg-blue-600 hover:bg-blue-700 text-white"
          : transition.variant === "destructive"
            ? "bg-red-900/20 text-red-400 border-red-900/50 hover:bg-red-900/40"
            : ""
      }
      onClick={onClick}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <transition.icon className="mr-2 size-4" />
      )}
      {transition.label}
    </Button>
  );
}

interface IncidentServiceSectionProps {
  incident: IncidentDetail;
  isAssignedToMe: boolean;
  mode: NonNullable<IncidentDetailsProps["mode"]>;
  noteContent: string;
  notesPending: boolean;
  onDownload: (
    type: "reports" | "statements" | "screenshots" | "attachments",
    filename: string,
  ) => void;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
}

function IncidentServiceSection({
  incident,
  isAssignedToMe,
  mode,
  noteContent,
  notesPending,
  onDownload,
  onNoteChange,
  onSaveNote,
}: IncidentServiceSectionProps) {
  return (
    <div className="space-y-4 border-t border-zinc-800/50 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-blue-400">
        <User className="size-4" /> Obsługa incydentu
      </h3>

      {incident.analystName && (
        <div className="mb-2 text-sm text-zinc-400">
          Analityk prowadzący:{" "}
          <span className="font-medium text-zinc-100">{incident.analystName}</span>
        </div>
      )}

      {isAssignedToMe && mode === "analyst" ? (
        <div className="space-y-3">
          <Textarea
            placeholder="Wprowadź notatki analityka..."
            value={noteContent}
            onChange={(event) => onNoteChange(event.target.value)}
            className="min-h-[120px] border-blue-900/30 bg-blue-950/20 text-white focus:ring-blue-500/50"
          />
          <Button
            size="sm"
            onClick={onSaveNote}
            disabled={notesPending || noteContent === incident.analystNote}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {notesPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Zapisz notatkę
          </Button>
        </div>
      ) : incident.analystNote ? (
        <div className="rounded-lg border border-blue-900/30 bg-blue-950/20 p-4 text-white italic whitespace-pre-wrap">
          {incident.analystNote}
        </div>
      ) : null}

      <AnalystFileDownload
        color="green"
        isVisible={Boolean(incident.analystReportPath)}
        label="Dostępny raport końcowy"
        filename={incident.analystReportMetadata?.filename || "Raport"}
        onDownload={() =>
          onDownload("reports", incident.analystReportMetadata?.filename || "report")
        }
      />
      <AnalystFileDownload
        color="purple"
        isVisible={Boolean(incident.analystStatementPath)}
        label="Dostępne sprawozdanie końcowe"
        filename={incident.analystStatementMetadata?.filename || "Sprawozdanie"}
        onDownload={() =>
          onDownload("statements", incident.analystStatementMetadata?.filename || "statement")
        }
      />
    </div>
  );
}

function AnalystFileDownload({
  color,
  filename,
  isVisible,
  label,
  onDownload,
}: {
  color: "green" | "purple";
  filename: string;
  isVisible: boolean;
  label: string;
  onDownload: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  const classes =
    color === "green"
      ? {
          border: "border-green-500/20",
          button: "border-green-500/30 text-green-400 hover:bg-green-500/20 hover:text-green-300",
          icon: "bg-green-500/20 text-green-400",
          label: "text-green-400",
          wrapper: "bg-green-500/10",
        }
      : {
          border: "border-purple-500/20",
          button:
            "border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300",
          icon: "bg-purple-500/20 text-purple-400",
          label: "text-purple-400",
          wrapper: "bg-purple-500/10",
        };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border mt-4 ${classes.wrapper} ${classes.border}`}
    >
      <div className={`p-2 rounded-full ${classes.icon}`}>
        <FileDown className="size-4" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${classes.label}`}>{label}</p>
        <p className="text-xs text-zinc-500">{filename}</p>
      </div>
      <Button size="sm" variant="outline" className={classes.button} onClick={onDownload}>
        Pobierz
      </Button>
    </div>
  );
}
