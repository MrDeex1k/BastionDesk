import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { Label } from "./ui/label";import type { LucideIcon } from "lucide-react";import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";
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
  CheckSquare
} from "lucide-react";

interface IncidentDetailsProps {
  incidentId: string;
  onBack: () => void;
  mode?: 'employee' | 'analyst' | 'admin';
}

// Typowanie zgodne z odpowiedzią API (singular paths)
interface IncidentDetail {
  id: string;
  dataZgloszenia: string;
  userId: string;
  organizationId: string;
  status: string;
  userDescription: string;
  userScreenshotPath?: string | null;
  userScreenshotMetadata?: {
    originalName?: string;
    filename?: string;
    size?: number;
    mimeType?: string;
    uploadedAt?: string;
  } | null;
  userAttachmentPath?: string | null;
  userAttachmentMetadata?: {
    originalName?: string;
    filename?: string;
    size?: number;
    mimeType?: string;
    uploadedAt?: string;
  } | null;
  analystId: string | null;
  analystNote: string | null;
  czyRozwiazany: boolean;
  dataRozwiazania?: string | null;
  analystReportPath?: string;
  analystReportMetadata?: {
    path?: string;
    bucket: string;
    filename: string;
    mimeType: string;
    size: number;
    originalName?: string;
    uploadedAt?: string;
  };
  analystReportData?: string;
  analystStatementPath?: string;
  analystStatementMetadata?: {
    bucket: string;
    filename: string;
    mimeType: string;
    size: number;
  };
  analystStatementData?: string;
  llmCategory?: string;
  userName?: string;
  analystName?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface IncidentDetailResponse {
  success: boolean;
  data: IncidentDetail;
}

const getStatusColor = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("zgłoszony") || lowerStatus.includes("nowe") || lowerStatus.includes("raport w trakcie")) return "bg-blue-500/20 text-blue-400 border-blue-500/50";
  if (lowerStatus.includes("trakcie") || lowerStatus.includes("analiza")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  if (lowerStatus.includes("rozwiązany") || lowerStatus.includes("zamknięte") || lowerStatus.includes("raport złożony") || lowerStatus.includes("sprawozdanie")) return "bg-green-500/20 text-green-400 border-green-500/50";
  if (lowerStatus.includes("odrzucone")) return "bg-red-500/20 text-red-400 border-red-500/50";
  return "bg-slate-500/20 text-slate-400 border-slate-500/50";
};

type ActionType = 'status' | 'upload_report' | 'upload_statement';

const getAvailableTransitions = (currentStatus: string): { label: string, value: string, variant?: string, icon: LucideIcon, actionType?: ActionType }[] => {
  switch (currentStatus) {
    case "Zgłoszony":
      return [
        { label: "Odrzuć", value: "Odrzucone", variant: "destructive", icon: XCircle, actionType: 'status' }
      ];
    case "Raport w trakcie":
      return [
        { label: "Złóż raport", value: "Raport złożony", variant: "default", icon: ArrowRight, actionType: 'upload_report' }
      ];
    case "Raport złożony":
      return [
        { label: "Rozpocznij sprawozdanie", value: "Sprawozdanie w trakcie", variant: "default", icon: ArrowRight, actionType: 'status' }
      ];
    case "Sprawozdanie w trakcie":
      return [
        { label: "Zakończ zgłoszenie", value: "Sprawozdanie złożone", variant: "default", icon: CheckCircle2, actionType: 'upload_statement' }
      ];
    default:
      return [];
  }
};

export function IncidentDetails({ incidentId, onBack, mode = 'employee' }: IncidentDetailsProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentAnalystId = user?.id || null;
  const [noteContent, setNoteContent] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'report' | 'statement' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["incident", incidentId, mode],
    queryFn: async () => {
      // --- REAL SERVER IMPLEMENTATION ---
      let endpoint = '';
      if (mode === 'analyst') endpoint = `/api/analyst/incidents/${incidentId}`;
      else if (mode === 'admin') endpoint = `/api/admin/incidents/${incidentId}`;
      else endpoint = `/api/incidents/${incidentId}`; // employee
      
      const response = await fetch(endpoint, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Failed to fetch incident details");
      return response.json() as Promise<IncidentDetailResponse>;
    }
  });

  // Initialize note content from data
  if (data?.data?.analystNote && noteContent === "") {
    setNoteContent(data.data.analystNote);
  }

  const assignMutation = useMutation({
    mutationFn: async () => {
      const endpoint = mode === 'admin' 
        ? `/api/admin/incidents/${incidentId}/assign` 
        : `/api/analyst/incidents/${incidentId}/assign`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Failed to assign incident");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Incydent został przypisany do Ciebie");
      queryClient.invalidateQueries({ queryKey: ["incident", incidentId], exact: false });
      queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Nie udało się przypisać incydentu");
    }
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      const endpoint = mode === 'admin' 
        ? `/api/admin/incidents/${incidentId}/unassign` 
        : `/api/analyst/incidents/${incidentId}/unassign`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Failed to unassign incident");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Incydent został oddany do puli");
      queryClient.setQueryData(["incident", incidentId], (old: IncidentDetailResponse | undefined) => ({
        ...old,
        data: {
          ...old?.data,
          analystId: null,
          analystName: undefined,
          status: "Zgłoszony"
        } as IncidentDetail
      }));
      queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
      onBack();
    },
    onError: () => {
      toast.error("Nie udało się oddać incydentu");
    }
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const response = await fetch(`/api/analyst/incidents/${incidentId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: (_data: unknown, variables) => {
      const newStatus = variables;
      toast.success(`Status zmieniony na: ${newStatus}`);
      queryClient.setQueryData(["incident", incidentId], (old: IncidentDetailResponse | undefined) => ({
        ...old,
        data: {
          ...old?.data,
          status: newStatus
        } as IncidentDetail
      }));
      queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Nie udało się zmienić statusu");
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/analyst/incidents/${incidentId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error("Failed to resolve incident");
      
      return response.json();
    },
    onSuccess: (responseData: { success: boolean; data: { dataRozwiazania: string } }) => {
      toast.success("Incydent oznaczony jako rozwiązany");
      queryClient.setQueryData(["incident", incidentId], (old: IncidentDetailResponse | undefined) => ({
        ...old,
        data: {
          ...old?.data,
          czyRozwiazany: true,
          dataRozwiazania: responseData.data.dataRozwiazania
        } as IncidentDetail
      }));
      queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Nie udało się oznaczyć incydentu jako rozwiązany");
    }
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/analyst/incidents/${incidentId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteContent }),
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error("Failed to update notes");
      
      return response.json();
    },
    onSuccess: () => {
      toast.success("Notatka została zapisana");
      queryClient.setQueryData(["incident", incidentId], (old: IncidentDetailResponse | undefined) => ({
        ...old,
        data: {
          ...old?.data,
          analystNote: noteContent
        } as IncidentDetail
      }));
    },
    onError: () => {
      toast.error("Nie udało się zapisać notatki");
    }
  });

  const downloadFile = async (type: 'reports' | 'statements' | 'screenshots' | 'attachments', filename: string) => {
    try {
      console.log('[FRONTEND] Downloading file:', { type, filename, incident: incident, mode });
      
      // Wybierz odpowiedni endpoint w zależności od trybu
      let url = '';
      if (mode === 'admin') {
        url = `/api/admin/incidents/${incidentId}/files/${type}/${encodeURIComponent(filename)}`;
      } else if (mode === 'analyst') {
        url = `/api/analyst/incidents/${incidentId}/files/${type}/${encodeURIComponent(filename)}`;
      } else {
        // employee mode
        url = `/api/incidents/${incidentId}/files/${type}/${encodeURIComponent(filename)}`;
      }
      
      console.log('[FRONTEND] URL:', url);
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[FRONTEND] Download failed:', response.status, errorText);
        throw new Error('Failed to download file');
      }
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
      toast.success('Plik został pobrany');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Nie udało się pobrać pliku');
    }
  };

  const uploadFileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !uploadType) return;

      // Funkcja konwersji pliku do base64
      const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const base64String = reader.result as string;
            // Usuń prefix "data:*/*;base64,"
            const base64Data = base64String.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = (error) => reject(error);
        });
      };

      const base64Data = await fileToBase64(selectedFile);
      const bodyKey = uploadType === 'report' ? 'reportData' : 'statementData';
      const apiEndpoint = uploadType === 'report' ? 'reports' : 'statements';
      const requestBody = {
        [bodyKey]: {
          filename: selectedFile.name,
          data: base64Data,
          mimeType: selectedFile.type
        }
      };
      
      const response = await fetch(`/api/analyst/incidents/${incidentId}/${apiEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error(`Failed to upload ${uploadType}`);
      
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(data?.message || (data?.data?.status === "Raport złożony" ? "Raport został przesłany" : "Sprawozdanie zostało przesłane"));
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadType(null);

      queryClient.setQueryData(["incident", incidentId], (old: IncidentDetailResponse | undefined) => {
        const newData = { ...old?.data } as IncidentDetail;
        
        if (data?.data) {
          // Aktualizacja na podstawie odpowiedzi z serwera/mocka
          Object.assign(newData, data.data);
        }

        return { ...old, data: newData };
      });
      queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Wystąpił błąd podczas wysyłania pliku");
    }
  });

  const handleTransitionClick = (transition: { label: string, value: string, variant?: string, icon: LucideIcon, actionType?: ActionType }) => {
    if (transition.actionType === 'upload_report') {
      setUploadType('report');
      setIsUploadDialogOpen(true);
    } else if (transition.actionType === 'upload_statement') {
      setUploadType('statement');
      setIsUploadDialogOpen(true);
    } else {
      statusMutation.mutate(transition.value);
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full h-full bg-slate-900/50 border-slate-800 shadow-xl">
        <CardHeader>
           <Skeleton className="h-8 w-1/3 bg-slate-800" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full bg-slate-800" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-12 w-full bg-slate-800" />
            <Skeleton className="h-12 w-full bg-slate-800" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.data) {
    return (
      <Card className="w-full bg-slate-900/50 border-slate-800 shadow-xl p-8 text-center">
        <div className="flex flex-col items-center gap-4 text-red-400">
          <ShieldAlert className="h-12 w-12" />
          <h3 className="text-xl font-semibold">Błąd pobierania danych</h3>
          <p className="text-slate-400">Nie udało się załadować szczegółów incydentu.</p>
          <Button onClick={onBack} variant="outline" className="mt-4 border-slate-700 text-slate-300">
            Wróć do listy
          </Button>
        </div>
      </Card>
    );
  }

  const incident = data.data;
  const isAssignedToMe = incident.analystId === currentAnalystId;
  const nextTransitions = getAvailableTransitions(incident.status);

  return (
    <>
      <Card className="w-full bg-slate-900/50 border-slate-800 shadow-xl animate-in slide-in-from-right-4 duration-300">
        <CardHeader className="border-b border-slate-800/50 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onBack}
              className="text-slate-400 hover:text-white hover:bg-slate-800 -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Powrót
            </Button>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl text-slate-100 flex items-center gap-3">
                Incydent #{incident.id.slice(0, 8)}
                {incident.czyRozwiazany && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/50 ml-2">
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Rozwiązany
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-slate-500 mt-1 flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {new Date(incident.dataZgloszenia).toLocaleString("pl-PL")}
                {incident.userName && (
                   <>
                    <span className="mx-1">•</span>
                    <User className="h-3 w-3" />
                    {incident.userName}
                   </>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <Badge className={`${getStatusColor(incident.status)} px-4 py-1.5 text-sm`}>
                {incident.status}
              </Badge>
              
              {/* Sekcja dla Admina */}
              {mode === 'admin' && incident.analystId && (
                 <Button 
                   size="sm" 
                   variant="outline"
                   className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                   onClick={() => unassignMutation.mutate()}
                   disabled={unassignMutation.isPending}
                 >
                   {unassignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserMinus className="h-4 w-4 mr-2" />}
                   Oddaj do puli
                 </Button>
              )}

              {mode === 'analyst' && isAssignedToMe && (
                <Button 
                   size="sm" 
                   className={`
                     ${incident.czyRozwiazany 
                       ? "bg-green-900/20 text-green-400 border-green-900/50 hover:bg-green-900/30" 
                       : "bg-green-600 hover:bg-green-700 text-white"}
                   `}
                   variant={incident.czyRozwiazany ? "outline" : "default"}
                   onClick={() => !incident.czyRozwiazany && resolveMutation.mutate()}
                   disabled={resolveMutation.isPending || incident.czyRozwiazany}
                >
                   {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckSquare className="h-4 w-4 mr-2" />}
                   {incident.czyRozwiazany ? "Rozwiązano" : "Oznacz jako rozwiązane"}
                </Button>
              )}
              
              {mode === 'analyst' && (
                <>
                  {!incident.analystId && (
                    <Button 
                      size="sm" 
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => assignMutation.mutate()}
                      disabled={assignMutation.isPending}
                    >
                      {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                      Przypisz do mnie
                    </Button>
                  )}

                  {!incident.analystId && nextTransitions.map((transition) => (
                    <Button
                      key={transition.value}
                      size="sm"
                      variant={(transition.variant as "default" | "destructive" | "outline" | "secondary" | "ghost" | "link") || "outline"}
                      className={transition.variant === 'destructive' ? "bg-red-900/20 text-red-400 border-red-900/50 hover:bg-red-900/40" : ""}
                      onClick={() => handleTransitionClick(transition)}
                      disabled={statusMutation.isPending}
                    >
                      {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <transition.icon className="h-4 w-4 mr-2" />}
                      {transition.label}
                    </Button>
                  ))}
                  
                  {isAssignedToMe && (
                    <>
                      {nextTransitions.map((transition) => (
                        <Button
                          key={transition.value}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => handleTransitionClick(transition)}
                          disabled={statusMutation.isPending}
                        >
                           {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <transition.icon className="h-4 w-4 mr-2" />}
                          {transition.label}
                        </Button>
                      ))}

                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => unassignMutation.mutate()}
                        disabled={unassignMutation.isPending}
                      >
                        {unassignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserMinus className="h-4 w-4 mr-2" />}
                        Oddaj do puli
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-8">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Opis zgłoszenia</h3>
            <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800 text-slate-200 leading-relaxed">
              {incident.userDescription}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg border flex items-center gap-3 ${incident.userScreenshotPath ? 'bg-blue-500/5 border-blue-500/20' : 'bg-slate-950/30 border-slate-800'}`}>
              <div className={`p-2 rounded-full ${incident.userScreenshotPath ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-600'}`}>
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-sm font-medium text-slate-300">Zrzut ekranu</p>
                <p className={`text-xs truncate ${incident.userScreenshotPath ? 'text-green-400' : 'text-slate-500'}`}>
                  {incident.userScreenshotPath ? (incident.userScreenshotMetadata?.originalName || incident.userScreenshotMetadata?.filename || "Dostępny plik") : "Brak pliku"}
                </p>
              </div>
              {incident.userScreenshotPath && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 shrink-0"
                  onClick={() => {
                    const filename = incident.userScreenshotMetadata?.originalName || incident.userScreenshotMetadata?.filename || 'screenshot';
                    downloadFile('screenshots', filename);
                  }}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  Pobierz
                </Button>
              )}
              {incident.userScreenshotPath && !isAssignedToMe && mode !== 'admin' && <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto shrink-0" />}
            </div>

            <div className={`p-4 rounded-lg border flex items-center gap-3 ${incident.userAttachmentPath ? 'bg-blue-500/5 border-blue-500/20' : 'bg-slate-950/30 border-slate-800'}`}>
              <div className={`p-2 rounded-full ${incident.userAttachmentPath ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-600'}`}>
                <Paperclip className="h-5 w-5" />
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-sm font-medium text-slate-300">Załącznik</p>
                <p className={`text-xs truncate ${incident.userAttachmentPath ? 'text-green-400' : 'text-slate-500'}`}>
                  {incident.userAttachmentPath ? (incident.userAttachmentMetadata?.originalName || incident.userAttachmentMetadata?.filename || "Dostępny plik") : "Brak pliku"}
                </p>
              </div>
              {incident.userAttachmentPath && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 shrink-0"
                  onClick={() => {
                    const filename = incident.userAttachmentMetadata?.originalName || incident.userAttachmentMetadata?.filename || 'attachment';
                    downloadFile('attachments', filename);
                  }}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  Pobierz
                </Button>
              )}
              {incident.userAttachmentPath && !isAssignedToMe && mode !== 'admin' && <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto shrink-0" />}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800/50">
             <h3 className="text-sm font-medium text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <User className="h-4 w-4" /> Obsługa incydentu
             </h3>
             
             {incident.analystName && (
               <div className="text-sm text-slate-400 mb-2">
                 Analityk prowadzący: <span className="text-slate-200 font-medium">{incident.analystName}</span>
               </div>
             )}

             {isAssignedToMe && mode === 'analyst' ? (
               <div className="space-y-3">
                 <Textarea 
                   placeholder="Wprowadź notatki analityka..." 
                   value={noteContent}
                   onChange={(e) => setNoteContent(e.target.value)}
                   className="bg-blue-950/20 border-blue-900/30 text-slate-300 min-h-[120px] focus:ring-blue-500/50"
                 />
                 <Button 
                   size="sm" 
                   onClick={() => notesMutation.mutate()} 
                   disabled={notesMutation.isPending || noteContent === incident.analystNote}
                   className="bg-blue-600 hover:bg-blue-700 text-white"
                 >
                   {notesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                   Zapisz notatkę
                 </Button>
               </div>
             ) : incident.analystNote ? (
               <div className="p-4 rounded-lg bg-blue-950/20 border border-blue-900/30 text-slate-300 italic whitespace-pre-wrap">
                 {incident.analystNote}
               </div>
             ) : null}

             {incident.analystReportPath && (
               <div className="flex items-center gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/20 mt-4">
                 <div className="p-2 rounded-full bg-green-500/20 text-green-400">
                   <FileDown className="h-4 w-4" />
                 </div>
                 <div className="flex-1">
                   <p className="text-sm font-medium text-green-400">Dostępny raport końcowy</p>
                   <p className="text-xs text-slate-500">{incident.analystReportMetadata?.filename || 'Raport'}</p>
                 </div>
                 <Button 
                   size="sm" 
                   variant="outline" 
                   className="border-green-500/30 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                   onClick={() => downloadFile('reports', incident.analystReportMetadata?.filename || 'report')}
                 >
                   Pobierz
                 </Button>
               </div>
             )}

             {incident.analystStatementPath && (
               <div className="flex items-center gap-3 p-3 rounded-md bg-purple-500/10 border border-purple-500/20 mt-2">
                 <div className="p-2 rounded-full bg-purple-500/20 text-purple-400">
                   <FileDown className="h-4 w-4" />
                 </div>
                 <div className="flex-1">
                   <p className="text-sm font-medium text-purple-400">Dostępne sprawozdanie końcowe</p>
                   <p className="text-xs text-slate-500">{incident.analystStatementMetadata?.filename || 'Sprawozdanie'}</p>
                 </div>
                 <Button 
                   size="sm" 
                   variant="outline" 
                   className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300"
                   onClick={() => downloadFile('statements', incident.analystStatementMetadata?.filename || 'statement')}
                 >
                   Pobierz
                 </Button>
               </div>
             )}
          </div>

          {incident.createdAt && (
            <div className="text-xs text-slate-600 font-mono pt-4 text-right">
              Utworzono: {new Date(incident.createdAt).toLocaleString("pl-PL")}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle>
              {uploadType === 'report' ? 'Prześlij raport analityka' : 'Prześlij sprawozdanie końcowe'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {uploadType === 'report' 
                ? 'Wybierz plik raportu PDF, aby zakończyć etap analizy.' 
                : 'Wybierz plik sprawozdania (DOCX/PDF), aby zakończyć zgłoszenie.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid w-full max-w-sm items-center gap-1.5 py-4">
            <Label htmlFor="file-upload">Plik</Label>
            <Input 
              id="file-upload" 
              type="file" 
              className="bg-slate-950 border-slate-800 text-slate-300 file:text-slate-200 file:bg-slate-800 file:border-0 file:mr-4 file:py-2 file:px-4 file:rounded-md hover:file:bg-slate-700 cursor-pointer" 
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile && (
              <p className="text-xs text-slate-500 mt-2">
                Wybrano: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Anuluj
            </Button>
            <Button 
              onClick={() => uploadFileMutation.mutate()} 
              disabled={!selectedFile || uploadFileMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {uploadFileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploadType === 'report' ? 'Wyślij raport' : 'Wyślij sprawozdanie'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}