import { lazy, Suspense, useState } from "react";
import { Users, List, PlusCircle } from "lucide-react";
import { Button } from "../components/ui/button";

const IncidentReportForm = lazy(() =>
  import("../components/IncidentReportForm").then((module) => ({
    default: module.IncidentReportForm,
  })),
);
const MyIncidentsList = lazy(() =>
  import("../components/MyIncidentsList").then((module) => ({
    default: module.MyIncidentsList,
  })),
);

export function EmployeeDashboardPage() {
  const [view, setView] = useState<"report" | "list">("report");

  return (
    <div className="animate-in fade-in mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-8 duration-500">
      <div className="text-center">
        <div className="mb-2 inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 p-4">
          <Users className="size-12 text-blue-400" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100">Panel Pracownika</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-zinc-400">
          Zgłaszaj incydenty i śledź status swoich zgłoszeń w czasie rzeczywistym.
        </p>
      </div>

      <div className="flex w-full max-w-2xl justify-center pb-6">
        <Button
          onClick={() => setView(view === "report" ? "list" : "report")}
          size="lg"
          className="min-w-[250px] w-full border border-blue-500/50 bg-zinc-900/80 font-semibold tracking-wide text-blue-300 shadow-[0_0_15px_-3px_rgba(59,130,246,0.2)] backdrop-blur-sm transition-[background-color,border-color] duration-300 hover:border-blue-400 hover:bg-zinc-800 md:w-auto"
        >
          {view === "report" ? (
            <>
              <List className="mr-2 size-4" />
              Pokaż moje zgłoszenia
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 size-4" />
              Zgłoś nowy incydent
            </>
          )}
        </Button>
      </div>

      <div className="w-full flex justify-center">
        <Suspense fallback={<DashboardSectionLoader />}>
          {view === "report" ? <IncidentReportForm onSuccess={() => {}} /> : <MyIncidentsList />}
        </Suspense>
      </div>
    </div>
  );
}

function DashboardSectionLoader() {
  return (
    <div className="flex min-h-[320px] w-full max-w-2xl items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-400">
      Ładowanie widoku…
    </div>
  );
}
