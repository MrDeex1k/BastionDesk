import { ShieldCheck } from "lucide-react";
import { AdminIncidentList } from "../components/AdminIncidentList";
import { AdminAnalytics } from "../components/AdminAnalytics";

export function AdminDashboardPage() {
  return (
    <div className="flex flex-col items-center space-y-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="p-6 rounded-full bg-green-500/10 border border-green-500/20">
            <ShieldCheck className="size-16 text-green-400" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-400">
          Panel Administratorski
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Zarządzanie wszystkimi incydentami bezpieczeństwa w organizacji
        </p>
      </div>

      <div className="w-full max-w-7xl space-y-8">
        {/* Analytics Section */}
        <div>
          <AdminAnalytics />
        </div>

        {/* Incidents List */}
        <div>
          <AdminIncidentList />
        </div>
      </div>
    </div>
  );
}