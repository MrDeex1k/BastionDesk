import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, User, UserX, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AnalystIncidentList } from "../components/AnalystIncidentList";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { IncidentReportForm } from "../components/IncidentReportForm";

export function AnalystDashboardPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  return (
    <div className="flex flex-col items-center min-h-[60vh] space-y-8 w-full max-w-5xl mx-auto">
      <div className="text-center space-y-4">
        <div className="inline-flex p-4 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2">
          <Activity className="size-12 text-purple-400" />
        </div>
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          Panel Analityka
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl">
          Zarządzaj incydentami bezpieczeństwa w twojej organizacji.
        </p>
      </div>

      <Tabs defaultValue="assigned" className="w-full">
        <div className="flex items-center justify-center gap-4 mb-6">
          <TabsList className="bg-slate-900/50 border border-slate-800 p-1 rounded-lg">
            <TabsTrigger 
              value="assigned" 
              className="px-6 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200"
            >
              <User className="mr-2 h-4 w-4" />
              Przypisane do mnie
            </TabsTrigger>
            <TabsTrigger 
              value="unassigned"
              className="px-6 py-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200"
            >
              <UserX className="mr-2 h-4 w-4" />
              Nieprzypisane
            </TabsTrigger>
          </TabsList>

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
                queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
              }} />
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
