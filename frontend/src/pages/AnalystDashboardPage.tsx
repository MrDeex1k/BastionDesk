import { lazy, Suspense, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, User, UserX, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AnalystIncidentList } from "../components/AnalystIncidentList";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";

const IncidentReportForm = lazy(() =>
  import("../components/IncidentReportForm").then((module) => ({
    default: module.IncidentReportForm,
  })),
);

export function AnalystDashboardPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const handleIncidentCreated = useCallback(() => {
    setIsCreateDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
  }, [queryClient]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-center gap-8">
      <div className="text-center">
        <div className="mb-2 inline-flex rounded-full border border-violet-500/20 bg-violet-500/10 p-4">
          <Activity className="size-12 text-purple-400" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100">Panel Analityka</h1>
        <p className="mt-3 max-w-2xl text-lg text-zinc-400">
          Zarządzaj incydentami bezpieczeństwa w twojej organizacji.
        </p>
      </div>

      <Tabs defaultValue="assigned" className="w-full">
        <div className="mb-6 flex items-center justify-center gap-4">
          <TabsList className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-1">
            <TabsTrigger
              value="assigned"
              className="px-6 py-2 text-white/85 hover:text-white data-active:bg-blue-600 data-active:text-white"
            >
              <User className="mr-2 size-4" />
              Przypisane do mnie
            </TabsTrigger>
            <TabsTrigger
              value="unassigned"
              className="px-6 py-2 text-white/85 hover:text-white data-active:bg-violet-600 data-active:text-white"
            >
              <UserX className="mr-2 size-4" />
              Nieprzypisane
            </TabsTrigger>
          </TabsList>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger
              render={
                <Button className="bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-700" />
              }
            >
              <Plus className="mr-2 size-4" />
              Zgłoś incydent
            </DialogTrigger>
            <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-zinc-200">
              <DialogTitle className="sr-only">Zgłoś incydent</DialogTitle>
              <DialogDescription className="sr-only">
                Formularz zgłaszania nowego incydentu bezpieczeństwa.
              </DialogDescription>
              <Suspense fallback={<DialogLoader />}>
                <IncidentReportForm onSuccess={handleIncidentCreated} />
              </Suspense>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="assigned" className="mt-0 w-full flex justify-center">
          <AnalystIncidentList type="assigned" />
        </TabsContent>

        <TabsContent value="unassigned" className="mt-0 w-full flex justify-center">
          <AnalystIncidentList type="unassigned" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DialogLoader() {
  return (
    <div className="flex min-h-[220px] items-center justify-center text-zinc-400">
      Ładowanie formularza…
    </div>
  );
}
