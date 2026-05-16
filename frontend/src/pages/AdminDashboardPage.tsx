import { ShieldCheck, Building2, Activity } from "lucide-react";
import { AdminIncidentList } from "../components/AdminIncidentList";
import { AdminAnalytics } from "../components/AdminAnalytics";
import { AdminOrganizationManagement } from "../components/AdminOrganizationManagement";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";

export function AdminDashboardPage() {
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
        <Tabs defaultValue="stats" className="w-full gap-8">
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
            {/* Analytics Section */}
            <div>
              <AdminAnalytics />
            </div>

            {/* Incidents List */}
            <div>
              <AdminIncidentList />
            </div>
          </TabsContent>

          <TabsContent value="organization" className="space-y-8">
            <AdminOrganizationManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
