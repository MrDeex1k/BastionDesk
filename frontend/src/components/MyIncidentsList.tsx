import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Clock, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2, ArrowRight } from "lucide-react";
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

export function MyIncidentsList() {
  const [page, setPage] = useState(1);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const LIMIT = 5; 

  const { data, isLoading, isError } = useQuery({
    queryKey: ["myIncidents", page],
    queryFn: async () => {
      // --- REAL SERVER IMPLEMENTATION ---
      /*
      const response = await fetch(`/api/incidents/my?page=${page}&limit=${LIMIT}`);
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json() as Promise<IncidentsResponse>;
      */

      // --- MOCK IMPLEMENTATION ---
      // await new Promise((resolve) => setTimeout(resolve, 800)); // Symulacja opóźnienia

      // Generowanie mockowych danych w zależności od strony
      const mockData: Incident[] = Array.from({ length: LIMIT }).map((_, i) => {
        const hasScreenshot = i % 2 === 0;
        const hasAttachment = i % 3 === 0;
        const isInProgress = i % 3 === 1;
        const isResolved = i % 3 === 2;
        
        return {
          id: `mock-${page}-${i}`,
          dataZgloszenia: new Date(Date.now() - i * 86400000).toISOString(),
          userId: "user_abc123",
          organizationId: "org_xyz789",
          status: i % 3 === 0 ? "Zgłoszony" : i % 3 === 1 ? "W trakcie realizacji" : "Rozwiązany",
          userDescription: `Przykładowe zgłoszenie numer ${((page - 1) * LIMIT) + i + 1}. Aplikacja działa wolno lub występuje inny problem techniczny.`,
          userScreenshotPath: hasScreenshot ? `incidents/mock-${page}-${i}/screenshots/1704067200000_error.png` : null,
          userScreenshotMetadata: hasScreenshot ? {
            bucket: "bastiondesk-bucket",
            filename: "error.png",
            mimeType: "image/png",
            size: 189440,
            originalName: "error.png",
            uploadedAt: new Date(Date.now() - i * 86400000).toISOString()
          } : null,
          userAttachmentPath: hasAttachment ? `incidents/mock-${page}-${i}/attachments/1704067201000_logs.txt` : null,
          userAttachmentMetadata: hasAttachment ? {
            bucket: "bastiondesk-bucket",
            filename: "logs.txt",
            mimeType: "text/plain",
            size: 25600,
            originalName: "logs.txt",
            uploadedAt: new Date(Date.now() - i * 86400000).toISOString()
          } : null,
          analystId: isInProgress || isResolved ? "user_analyst456" : null,
          analystNote: isInProgress || isResolved ? "Zgłoszenie w trakcie analizy" : null,
          czyRozwiazany: isResolved,
          dataRozwiazania: isResolved ? new Date(Date.now() - i * 43200000).toISOString() : null,
          analystReportPath: isResolved ? `incidents/mock-${page}-${i}/reports/analysis.pdf` : null,
          analystReportMetadata: isResolved ? {
            bucket: "bastiondesk-bucket",
            filename: "analysis.pdf",
            mimeType: "application/pdf",
            size: 245760,
            originalName: "analysis.pdf",
            uploadedAt: new Date(Date.now() - i * 43200000).toISOString()
          } : null,
          analystReportData: isResolved ? new Date(Date.now() - i * 43200000).toISOString() : null,
          analystStatementPath: isResolved ? `incidents/mock-${page}-${i}/statements/final.docx` : null,
          analystStatementMetadata: isResolved ? {
            bucket: "bastiondesk-bucket",
            filename: "final.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 189440,
            originalName: "final.docx",
            uploadedAt: new Date(Date.now() - i * 43200000).toISOString()
          } : null,
          analystStatementData: isResolved ? new Date(Date.now() - i * 43200000).toISOString() : null,
          llmCategory: i % 4 === 0 ? "Malware" : i % 4 === 1 ? "Phishing" : i % 4 === 2 ? "Unauthorized Access" : null,
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
          updatedAt: new Date().toISOString()
        };
      });

      return {
        success: true,
        data: mockData,
        pagination: {
          page: page,
          limit: LIMIT,
          total: 12, // Zakładamy że jest 12 zgłoszeń łącznie
          totalPages: Math.ceil(12 / LIMIT)
        }
      } as IncidentsResponse;
    },
    placeholderData: keepPreviousData, 
  }) as { data: IncidentsResponse | undefined; isLoading: boolean; isError: boolean };

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
              {data?.data.map((incident: any) => (
                <div
                  key={incident.id}
                  onClick={() => setSelectedIncidentId(incident.id)}
                  className="group cursor-pointer p-4 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition-all duration-200 relative"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${getStatusColor(incident.status)} gap-1`}>
                        {getStatusIcon(incident.status)}
                        {incident.status}
                      </Badge>
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