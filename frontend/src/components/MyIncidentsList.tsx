import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { IncidentsResponse } from "@/ApiModel";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { IncidentDetails } from "./IncidentDetails";
import { IncidentSummaryItem } from "./incident-list/IncidentSummaryItem";

export function MyIncidentsList() {
  const [page, setPage] = useState(1);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const LIMIT = 5;

  const { data, isPending, isFetching, isError, isPlaceholderData } = useQuery<IncidentsResponse>({
    queryKey: ["myIncidents", { page, limit: LIMIT }],
    queryFn: async () => {
      const response = await apiFetch(
        `/api/incidents/my?page=${page}&limit=${LIMIT}`,
      );
      
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      
      return response.json() as Promise<IncidentsResponse>;
    },
    placeholderData: keepPreviousData,
  });

  // Jeśli wybrano zgłoszenie, pokaż szczegóły
  if (selectedIncidentId) {
    return <IncidentDetails incidentId={selectedIncidentId} onBack={() => setSelectedIncidentId(null)} mode="employee" />;
  }

  return (
    <Card className="flex h-[600px] w-full max-w-2xl flex-col border-zinc-800 bg-zinc-900/50 shadow-xl animate-in fade-in duration-300">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-2xl text-zinc-100">
          Twoje Zgłoszenia
          {isFetching && <Loader2 className="size-5 animate-spin text-blue-400" />}
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
                <IncidentSummaryItem
                  key={incident.id}
                  dataZgloszenia={incident.dataZgloszenia}
                  id={incident.id}
                  llmCategory={incident.llmCategory}
                  onSelect={setSelectedIncidentId}
                  status={incident.status}
                  userDescription={incident.userDescription}
                  userId={incident.userId}
                />
              ))}
              {!isPending && data?.data.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Brak zgłoszeń do wyświetlenia.
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      {data && data.pagination.totalPages > 1 && (
        <CardFooter className="flex justify-between border-t border-zinc-800 p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((old) => Math.max(old - 1, 1))}
            disabled={page === 1 || isFetching}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <ChevronLeft className="mr-1 size-4" />
            Poprzednia
          </Button>
          <span className="text-sm text-zinc-500">
            Strona {page} z {data.pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((old) => (data?.pagination.totalPages && old < data.pagination.totalPages ? old + 1 : old))}
            disabled={page === data.pagination.totalPages || isPlaceholderData}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Następna
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
