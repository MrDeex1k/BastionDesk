import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  ArrowRight,
  Filter,
  X,
  User,
  ShieldAlert,
  FileText,
  Plus
} from "lucide-react";
import { IncidentDetails } from "./IncidentDetails";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "./ui/dialog";
import { IncidentReportForm } from "./IncidentReportForm";

interface Incident {
  id: string;
  dataZgloszenia: string;
  userId: string;
  organizationId: string;
  status: string;
  userDescription: string;
  userScreenshotPath: string | null;
  userScreenshotMetadata: Record<string, unknown> | null;
  userAttachmentPath: string | null;
  userAttachmentMetadata: Record<string, unknown> | null;
  analystId: string | null;
  analystNote: string | null;
  czyRozwiazany: boolean;
  dataRozwiazania: string | null;
  analystReportPath: string | null;
  analystReportMetadata: Record<string, unknown> | null;
  analystReportData: string | null;
  analystStatementPath: string | null;
  analystStatementMetadata: Record<string, unknown> | null;
  analystStatementData: string | null;
  llmCategory: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  analystName: string | null;
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
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("zgłoszony") || lowerStatus.includes("nowe")) return "bg-blue-500/20 text-blue-400 border-blue-500/50";
  if (lowerStatus.includes("trakcie") || lowerStatus.includes("analiza")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  if (lowerStatus.includes("rozwiązany") || lowerStatus.includes("zamknięte") || lowerStatus.includes("raport złożony") || lowerStatus.includes("sprawozdanie złożone")) return "bg-green-500/20 text-green-400 border-green-500/50";
  if (lowerStatus.includes("odrzucone")) return "bg-red-500/20 text-red-400 border-red-500/50";
  return "bg-slate-500/20 text-slate-400 border-slate-500/50";
};

const getStatusIcon = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("zgłoszony") || lowerStatus.includes("nowe")) return <AlertCircle className="h-4 w-4" />;
  if (lowerStatus.includes("trakcie")) return <Clock className="h-4 w-4" />;
  if (lowerStatus.includes("rozwiązany") || lowerStatus.includes("zamknięte") || lowerStatus.includes("złożon")) return <CheckCircle2 className="h-4 w-4" />;
  return <AlertCircle className="h-4 w-4" />;
};

const getLlmCategoryColor = (category: string) => {
  if (category === "Zielony") return "bg-green-500/20 text-green-400 border-green-500/50";
  if (category === "Żółty") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  if (category === "Czerwony") return "bg-red-500/20 text-red-400 border-red-500/50";
  return "bg-purple-500/20 text-purple-400 border-purple-500/50";
};

export function AdminIncidentList() {
  const [page, setPage] = useState(1);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userIdFilter, setUserIdFilter] = useState<string>("");
  const [analystFilter, setAnalystFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const LIMIT = 10;

  const { data, isLoading, isError } = useQuery<IncidentsResponse>({
    queryKey: ["adminIncidents", page, statusFilter, userIdFilter, analystFilter, sortBy, sortOrder],
    queryFn: async () => {
      // --- REAL SERVER IMPLEMENTATION ---
      /*
      const params = new URLSearchParams({
        page: page.toString(),
        limit: LIMIT.toString(),
        sortBy,
        sortOrder
      });
      
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (userIdFilter) params.append("userId", userIdFilter);
      if (analystFilter !== "all") {
        params.append("analystId", analystFilter === "unassigned" ? "null" : analystFilter);
      }

      const response = await fetch(`/api/admin/incidents?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch incidents");
      }
      return response.json() as Promise<IncidentsResponse>;
      */

      // --- MOCK IMPLEMENTATION ---
      // Generowanie mockowych danych
      const allStatuses = ["Zgłoszony", "Raport w trakcie", "Raport złożony", "Sprawozdanie w trakcie", "Sprawozdanie złożone", "Odrzucone"];
      const mockUsers = [
        { id: "user_employee123", name: "Jan Kowalski" },
        { id: "user_employee456", name: "Anna Nowak" },
        { id: "user_employee789", name: "Piotr Wiśniewski" }
      ];
      const mockAnalysts = [
        { id: "user_analyst001", name: "Tomasz Analityk" },
        { id: "user_analyst002", name: "Katarzyna Bezpieczeństwo" },
        { id: null, name: null }
      ];
      const llmCategories = ["Zielony", "Żółty", "Czerwony", null];

      // Generowanie większej puli danych (symulacja wszystkich incydentów w organizacji)
      const totalIncidents = 45;
      const allMockData: Incident[] = Array.from({ length: totalIncidents }).map((_, i) => {
        const statusIndex = i % allStatuses.length;
        const status = allStatuses[statusIndex];
        const user = mockUsers[i % mockUsers.length];
        const analyst = mockAnalysts[i % mockAnalysts.length];
        const hasScreenshot = i % 3 === 0;
        const hasAttachment = i % 4 === 0;
        const isResolved = status === "Sprawozdanie złożone";
        const hasReport = status === "Raport złożony" || status === "Sprawozdanie w trakcie" || status === "Sprawozdanie złożone";
        const timestamp = Date.now() - i * 3600000 * 12;
        const incidentId = `0192d1f8-5c8e-7b1a-${String(i).padStart(4, '0')}-${String(i * 123).padStart(12, '0')}`;

        return {
          id: incidentId,
          dataZgloszenia: new Date(timestamp).toISOString(),
          userId: user.id,
          organizationId: "org_xyz789",
          status,
          userDescription: `Zgłoszenie ${i + 1}: ${status === "Odrzucone" ? "Błędne zgłoszenie - brak wystarczających informacji" : "Problem z systemem wymagający analizy - aplikacja zawiesza się przy określonych operacjach"}`,
          userScreenshotPath: hasScreenshot ? `incidents/${incidentId}/screenshots/${timestamp}_error_screen.png` : null,
          userScreenshotMetadata: hasScreenshot ? {
            bucket: "bastiondesk-bucket",
            filename: "error_screen.png",
            mimeType: "image/png",
            size: 245760,
            originalName: "error_screen.png",
            uploadedAt: new Date(timestamp).toISOString()
          } : null,
          userAttachmentPath: hasAttachment ? `incidents/${incidentId}/attachments/${timestamp + 1000}_system_logs.txt` : null,
          userAttachmentMetadata: hasAttachment ? {
            bucket: "bastiondesk-bucket",
            filename: "system_logs.txt",
            mimeType: "text/plain",
            size: 45000,
            originalName: "system_logs.txt",
            uploadedAt: new Date(timestamp + 1000).toISOString()
          } : null,
          analystId: analyst.id,
          analystNote: analyst.id ? "Analiza w toku. Problem wydaje się związany z konfiguracją. Sprawdzam logi i przygotowuję rekomendacje." : null,
          czyRozwiazany: isResolved,
          dataRozwiazania: isResolved ? new Date(timestamp + 3600000 * 24).toISOString() : null,
          analystReportPath: hasReport ? `incidents/${incidentId}/reports/analysis_report.pdf` : null,
          analystReportMetadata: hasReport ? {
            bucket: "bastiondesk-bucket",
            filename: "analysis_report.pdf",
            mimeType: "application/pdf",
            size: 298000,
            originalName: "analysis_report.pdf",
            uploadedAt: new Date(timestamp + 3600000 * 12).toISOString()
          } : null,
          analystReportData: hasReport ? new Date(timestamp + 3600000 * 12).toISOString() : null,
          analystStatementPath: isResolved ? `incidents/${incidentId}/statements/final_statement.docx` : null,
          analystStatementMetadata: isResolved ? {
            bucket: "bastiondesk-bucket",
            filename: "final_statement.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 189440,
            originalName: "final_statement.docx",
            uploadedAt: new Date(timestamp + 3600000 * 20).toISOString()
          } : null,
          analystStatementData: isResolved ? new Date(timestamp + 3600000 * 20).toISOString() : null,
          llmCategory: llmCategories[i % llmCategories.length],
          createdAt: new Date(timestamp).toISOString(),
          updatedAt: new Date(timestamp + 3600000 * 6).toISOString(),
          userName: user.name,
          analystName: analyst.name
        };
      });

      // Filtrowanie
      let filteredData = allMockData;
      
      if (statusFilter !== "all") {
        filteredData = filteredData.filter(inc => inc.status === statusFilter);
      }
      
      if (userIdFilter.trim()) {
        filteredData = filteredData.filter(inc => 
          inc.userId.toLowerCase().includes(userIdFilter.toLowerCase()) ||
          inc.userName?.toLowerCase().includes(userIdFilter.toLowerCase())
        );
      }
      
      if (analystFilter !== "all") {
        if (analystFilter === "unassigned") {
          filteredData = filteredData.filter(inc => inc.analystId === null);
        } else {
          filteredData = filteredData.filter(inc => inc.analystId === analystFilter);
        }
      }

      // Sortowanie
      filteredData.sort((a, b) => {
        const aVal: unknown = a[sortBy as keyof Incident];
        const bVal: unknown = b[sortBy as keyof Incident];
        
        // Obsługa null values
        if (aVal === null || aVal === undefined) return sortOrder === "asc" ? 1 : -1;
        if (bVal === null || bVal === undefined) return sortOrder === "asc" ? -1 : 1;
        
        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortOrder === "asc" 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        }
        
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortOrder === "asc" ? (aVal - bVal) : (bVal - aVal);
        }
        
        return 0;
      });

      const total = filteredData.length;
      const totalPages = Math.ceil(total / LIMIT);
      const startIndex = (page - 1) * LIMIT;
      const paginatedData = filteredData.slice(startIndex, startIndex + LIMIT);

      return {
        success: true,
        data: paginatedData,
        pagination: {
          page,
          limit: LIMIT,
          total,
          totalPages
        }
      } as IncidentsResponse;
    },
    placeholderData: (previousData) => previousData,
  });

  const handleClearFilters = () => {
    setStatusFilter("all");
    setUserIdFilter("");
    setAnalystFilter("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const hasActiveFilters = statusFilter !== "all" || userIdFilter !== "" || analystFilter !== "all" || sortBy !== "createdAt" || sortOrder !== "desc";

  // Jeśli wybrano incydent, pokaż szczegóły
  if (selectedIncidentId) {
    return <IncidentDetails incidentId={selectedIncidentId} onBack={() => setSelectedIncidentId(null)} mode="admin" />;
  }

  return (
    <Card className="w-full bg-slate-900/50 border-slate-800 shadow-xl flex flex-col h-[700px] animate-in fade-in duration-300">
      <CardHeader className="border-b border-slate-800/50">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl text-slate-200 flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-green-400" />
              Wszystkie incydenty w organizacji
              {isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-400" />}
            </CardTitle>
            {data && (
              <p className="text-sm text-slate-500 mt-1">
                Wyświetlono {data.data.length} z {data.pagination.total} incydentów
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20">
                  <Plus className="h-4 w-4 mr-2" />
                  Zgłoś incydent
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-950 border-slate-800 text-slate-200 max-w-2xl">
                <DialogTitle className="sr-only">Zgłoś incydent</DialogTitle>
                <DialogDescription className="sr-only">
                  Formularz zgłaszania nowego incydentu bezpieczeństwa.
                </DialogDescription>
                <IncidentReportForm onSuccess={() => {
                  setIsCreateDialogOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["adminIncidents"] });
                }} />
              </DialogContent>
            </Dialog>

            <Button
              variant={showFilters ? "default" : "outline"}
              size="default"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700 text-slate-300"}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtry
              {hasActiveFilters && <span className="ml-2 px-1.5 py-0.5 bg-blue-500 rounded-full text-xs">●</span>}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Filter */}
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                    <SelectItem value="all" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Wszystkie</SelectItem>
                    <SelectItem value="Zgłoszony" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Zgłoszony</SelectItem>
                    <SelectItem value="Raport w trakcie" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Raport w trakcie</SelectItem>
                    <SelectItem value="Raport złożony" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Raport złożony</SelectItem>
                    <SelectItem value="Sprawozdanie w trakcie" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Sprawozdanie w trakcie</SelectItem>
                    <SelectItem value="Sprawozdanie złożone" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Sprawozdanie złożone</SelectItem>
                    <SelectItem value="Odrzucone" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Odrzucone</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Analyst Filter */}
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs">Analityk</Label>
                <Select value={analystFilter} onValueChange={(val) => { setAnalystFilter(val); setPage(1); }}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                    <SelectItem value="all" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Wszyscy</SelectItem>
                    <SelectItem value="unassigned" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Nieprzypisane</SelectItem>
                    <SelectItem value="user_analyst001" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Tomasz Analityk</SelectItem>
                    <SelectItem value="user_analyst002" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Katarzyna Bezpieczeństwo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs">Sortuj po</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                    <SelectItem value="createdAt" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Data utworzenia</SelectItem>
                    <SelectItem value="updatedAt" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Data aktualizacji</SelectItem>
                    <SelectItem value="status" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Status</SelectItem>
                    <SelectItem value="dataZgloszenia" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Data zgłoszenia</SelectItem>
                    <SelectItem value="userId" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Użytkownik</SelectItem>
                    <SelectItem value="analystId" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Analityk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order */}
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs">Kolejność</Label>
                <Select value={sortOrder} onValueChange={(val) => setSortOrder(val as "asc" | "desc")}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                    <SelectItem value="desc" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Malejąco</SelectItem>
                    <SelectItem value="asc" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Rosnąco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* User ID Search */}
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Szukaj użytkownika (ID lub nazwa)</Label>
              <Input
                placeholder="Wpisz ID użytkownika lub nazwę..."
                value={userIdFilter}
                onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
                className="bg-slate-900 border-slate-700 text-slate-300"
              />
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-4 w-4 mr-2" />
                Wyczyść filtry
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6">
          {isError ? (
            <div className="text-center text-red-400 py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4" />
              <p>Wystąpił błąd podczas pobierania incydentów.</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4 pt-4">
              {data?.data.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => setSelectedIncidentId(incident.id)}
                  className="group cursor-pointer p-4 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition-all duration-200 relative"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`${getStatusColor(incident.status)} gap-1`}>
                        {getStatusIcon(incident.status)}
                        {incident.status}
                      </Badge>
                      {incident.czyRozwiazany && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                          Rozwiązany
                        </Badge>
                      )}
                      {incident.llmCategory && (
                        <Badge className={getLlmCategoryColor(incident.llmCategory)}>
                          {incident.llmCategory}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(incident.dataZgloszenia).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>

                  <p className="text-slate-300 text-sm line-clamp-2 pr-6 mb-3">
                    {incident.userDescription}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{incident.userName || incident.userId.slice(0, 12)}</span>
                    </div>
                    {incident.analystName && (
                      <div className="flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3 text-blue-400" />
                        <span className="text-blue-400">{incident.analystName}</span>
                      </div>
                    )}
                    {!incident.analystId && (
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                        Nieprzypisany
                      </Badge>
                    )}
                  </div>

                  {/* Hover indicator */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              ))}
              {!isLoading && data?.data.length === 0 && (
                <div className="text-center text-slate-500 py-12">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Brak incydentów spełniających kryteria.</p>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFilters}
                      className="mt-4 text-blue-400 hover:text-blue-300"
                    >
                      Wyczyść filtry
                    </Button>
                  )}
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