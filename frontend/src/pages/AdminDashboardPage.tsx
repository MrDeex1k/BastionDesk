import { lazy, Suspense, useState } from "react";
import { ShieldCheck, Building2, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const AdminIncidentList = lazy(() =>
  import("../components/AdminIncidentList").then((module) => ({
    default: module.AdminIncidentList,
  })),
);
const AdminAnalytics = lazy(() =>
  import("../components/AdminAnalytics").then((module) => ({
    default: module.AdminAnalytics,
  })),
);
const AdminOrganizationManagement = lazy(() =>
  import("../components/AdminOrganizationManagement").then((module) => ({
    default: module.AdminOrganizationManagement,
  })),
);

export function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState("stats");

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <div className="flex items-center justify-center">
          <div className="rounded-full border border-green-500/20 bg-green-500/10 p-6">
            <ShieldCheck className="size-16 text-green-400" />
          </div>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100">
          Panel Administratorski
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-zinc-400">
          Zarządzanie bezpieczeństwem i strukturą organizacji
        </p>
      </div>

      <div className="w-full max-w-7xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-8">
          <div className="flex justify-center">
            <TabsList className="grid w-full max-w-md grid-cols-2 border border-zinc-800 bg-zinc-950/80">
              <TabsTrigger
                value="stats"
                className="text-white/85 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <Activity className="mr-2 size-4" />
                Statystyki i Incydenty
              </TabsTrigger>
              <TabsTrigger
                value="organization"
                className="text-white/85 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
              >
                <Building2 className="mr-2 size-4" />
                Zarządzanie Organizacją
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stats" className="space-y-8">
            <Suspense fallback={<AdminSectionLoader />}>
              <div>
                <AdminAnalytics />
              </div>

              <div>
                <AdminIncidentList />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="organization" className="space-y-8">
            <Suspense fallback={<AdminSectionLoader />}>
              <AdminOrganizationManagement />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AdminSectionLoader() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/50">
      <div className="text-sm text-zinc-400">Ładowanie sekcji…</div>
    </div>
  );
}
