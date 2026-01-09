import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Clock, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2, ArrowRight, BrainCircuit } from "lucide-react";
import { IncidentDetails } from "./IncidentDetails";

interface Incident {
  id: string;
  dataZgloszenia: string;
  userId: string;
  organizationId: string;
  status: string;
  userDescription: string;
  userScreenshotPath: string | null;
  userScreenshotMetadata: {
    bucket: string;
    filename: string;
    mimeType: string;
    size: number;
    originalName: string;
    uploadedAt: string;
  } | null;
  userAttachmentPath: string | null;
  userAttachmentMetadata: {
    bucket: string;
    filename: string;
    mimeType: string;
    size: number;
    originalName: string;
    uploadedAt: string;
  } | null;
  analystId: string | null;
  analystNote: string | null;
  czyRozwiazany: boolean;
  dataRozwiazania: string | null;
  analystReportPath: string | null;
  analystReportMetadata: {
    bucket: string;
    filename: string;
    mimeType: string;
    size: number;
    originalName: string;
    uploadedAt: string;
  } | null;
  analystReportData: string | null;
  analystStatementPath: string | null;
  analystStatementMetadata: {
    bucket: string;
    filename: string;
    mimeType: string;
    size: number;
    originalName: string;
    uploadedAt: string;
  } | null;
  analystStatementData: string | null;
  llmCategory: string | null;
  createdAt: string;
  updatedAt: string;
  // inne pola opcjonalne...
}

interface IncidentsResponse {
  success: boolean;
  data: Incident[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const getStatusColor = (status: string) => {
  // Mapowanie statusów z API na kolory
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("zgłoszony") || lowerStatus.includes("nowe")) return "bg-blue-500/20 text-blue-400 border-blue-500/50";
  if (lowerStatus.includes("trakcie")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  if (lowerStatus.includes("rozwiązany") || lowerStatus.includes("zamknięte")) return "bg-green-500/20 text-green-400 border-green-500/50";
  return "bg-slate-500/20 text-slate-400 border-slate-500/50";
};

const getStatusIcon = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("zgłoszony") || lowerStatus.includes("nowe")) return <AlertCircle className="h-4 w-4" />;
  if (lowerStatus.includes("trakcie")) return <Clock className="h-4 w-4" />;
  if (lowerStatus.includes("rozwiązany") || lowerStatus.includes("zamknięte")) return <CheckCircle2 className="h-4 w-4" />;
  return <AlertCircle className="h-4 w-4" />;
};

const getLLMCategoryColor = (category: string) => {
  const lowerCategory = category.toLowerCase();
  if (lowerCategory === 'czerwony') return "bg-red-500/20 text-red-400 border-red-500/50";
  if (lowerCategory === 'żółty') return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  if (lowerCategory === 'zielony') return "bg-green-500/20 text-green-400 border-green-500/50";
  return "bg-slate-500/20 text-slate-400 border-slate-500/50";
};

export function MyIncidentsList() {
  const [page, setPage] = useState(1);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const LIMIT = 5;

  const { data, isLoading, isError } = useQuery<IncidentsResponse>({
    queryKey: ["myIncidents", page],
    queryFn: async () => {
      const response = await fetch(`/api/incidents/my?page=${page}&limit=${LIMIT}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      
      return response.json() as Promise<IncidentsResponse>;
    },
    placeholderData: (previousData) => previousData, 
  });

  // Jeśli wybrano zgłoszenie, pokaż szczegóły
  if (selectedIncidentId) {
    return <IncidentDetails incidentId={selectedIncidentId} onBack={() => setSelectedIncidentId(null)} mode="employee" />;
  }

  return (
    <Card className="w-full max-w-2xl bg-slate-900/50 border-slate-800 shadow-xl flex flex-col h-[600px] animate-in fade-in duration-300">
      <CardHeader>
        <CardTitle className="text-2xl text-slate-200 flex justify-between items-center">
          Twoje Zgłoszenia
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-400" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6">
          {isError ? (
            <div className="text-center text-red-400 py-8">
              Wystąpił błąd podczas pobierania zgłoszeń.
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {data?.data.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => setSelectedIncidentId(incident.id)}
                  className="group cursor-pointer p-4 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition-all duration-200 relative"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`${getStatusColor(incident.status)} gap-1`}>
                        {getStatusIcon(incident.status)}
                        {incident.status}
                      </Badge>

                      {incident.llmCategory && (
                        <Badge variant="outline" className={`${getLLMCategoryColor(incident.llmCategory)} gap-1`}>
                          <BrainCircuit className="h-3 w-3" />
                          {incident.llmCategory}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(incident.dataZgloszenia).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm line-clamp-2 pr-6">
                    {incident.userDescription}
                  </p>
                  
                  {/* Hover indicator */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              ))}
              {!isLoading && data?.data.length === 0 && (
                <div className="text-center text-slate-500 py-8">
                  Brak zgłoszeń do wyświetlenia.
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      {data && data.pagination.totalPages > 1 && (
        <CardFooter className="flex justify-between border-t border-slate-800 p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((old) => Math.max(old - 1, 1))}
            disabled={page === 1 || isLoading}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Poprzednia
          </Button>
          <span className="text-sm text-slate-500">
            Strona {page} z {data.pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((old) => (data?.pagination.totalPages && old < data.pagination.totalPages ? old + 1 : old))}
            disabled={page === data.pagination.totalPages || isLoading}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            Następna
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}