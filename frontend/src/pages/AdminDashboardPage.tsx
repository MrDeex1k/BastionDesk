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
    <div className="flex flex-col items-center space-y-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="p-6 rounded-full bg-green-500/10 border border-green-500/20">
            <ShieldCheck className="size-16 text-green-400" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-linear-to-r from-green-400 to-blue-400">
          Panel Administratorski
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Zarządzanie bezpieczeństwem i strukturą organizacji
        </p>
      </div>

      <div className="w-full max-w-7xl">
        <Tabs defaultValue="stats" className="w-full space-y-8">
          <div className="flex justify-center">
            <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-900 border border-slate-800">
              <TabsTrigger 
                value="stats"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400"
              >
                <Activity className="h-4 w-4 mr-2" />
                Statystyki i Incydenty
              </TabsTrigger>
              <TabsTrigger 
                value="organization"
                className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400"
              >
                <Building2 className="h-4 w-4 mr-2" />
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
