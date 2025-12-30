import { useState } from "react";
import { Users, List, PlusCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { IncidentReportForm } from "../components/IncidentReportForm";
import { MyIncidentsList } from "../components/MyIncidentsList";

export function EmployeeDashboardPage() {
  const [view, setView] = useState<"report" | "list">("report");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-500">
      <div 
        className="text-center space-y-4 cursor-pointer group"
        onClick={() => setView("report")}
        title="Wróć do formularza zgłoszeniowego"
      >
        <div className="inline-flex p-4 rounded-full bg-blue-500/10 border border-blue-500/20 mb-2 group-hover:bg-blue-500/20 group-hover:border-blue-500/40 transition-colors">
          <Users className="size-12 text-blue-400 group-hover:text-blue-300 transition-colors" />
        </div>
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 group-hover:from-blue-300 group-hover:to-cyan-300 transition-all">
          Panel Pracownika
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Zgłaszaj incydenty i śledź status swoich zgłoszeń w czasie rzeczywistym.
        </p>
      </div>

      <div className="w-full max-w-2xl flex justify-center pb-6">
        <Button
          onClick={() => setView(view === "report" ? "list" : "report")}
          size="lg"
          className="w-full md:w-auto min-w-[250px] bg-slate-800/80 hover:bg-slate-700 text-blue-400 border border-blue-500/50 hover:border-blue-400 shadow-[0_0_15px_-3px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_-5px_rgba(59,130,246,0.4)] transition-all duration-300 font-semibold tracking-wide backdrop-blur-sm"
        >
          {view === "report" ? (
            <>
              <List className="mr-2 h-4 w-4" />
              Pokaż moje zgłoszenia
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 h-4 w-4" />
              Zgłoś nowy incydent
            </>
          )}
        </Button>
      </div>

      <div className="w-full flex justify-center">
        {view === "report" ? (
          <IncidentReportForm onSuccess={() => {
            // Optional: Switch to list view on success or just stay on form
            // For now, let's keep it on form as user might want to report another one
            // or just see the success message.
          }} />
        ) : (
          <MyIncidentsList />
        )}
      </div>
    </div>
  );
}
