import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList
} from "recharts";
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Users,
  Shield,
  Calendar,
  Activity,
  Loader2
} from "lucide-react";

interface StatsResponse {
  success: boolean;
  data: {
    totalIncidents: number;
    resolvedIncidents: number;
    resolvedPercentage: number;
    avgResolutionTime: {
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
      totalSeconds: number;
    };
    statusBreakdown: Array<{ status: string; count: number }>;
    categoryBreakdown: Array<{ category: string; count: number }>;
  };
}

interface MetricsResponse {
  success: boolean;
  data: {
    period: {
      days: number;
      startDate: string;
    };
    timeSeries: {
      incidentsCreated: Array<{ date: string; count: number }>;
      incidentsResolved: Array<{ date: string; count: number }>;
      avgResolutionTimeHours: Array<{ date: string; avg_time_hours: number }>;
    };
    topUsers: Array<{ userId: string; userName: string; count: number }>;
    topAnalysts: Array<{ analystId: string; analystName: string; resolved: number }>;
  };
}

const STATUS_COLORS: Record<string, string> = {
  "Zgłoszony": "#3b82f6",
  "Raport w trakcie": "#eab308",
  "Raport złożony": "#22c55e",
  "Sprawozdanie w trakcie": "#f59e0b",
  "Sprawozdanie złożone": "#10b981",
  "Odrzucone": "#ef4444"
};

const CATEGORY_COLORS: Record<string, string> = {
  "Zielony": "#22c55e",
  "Żółty": "#eab308",
  "Czerwony": "#ef4444"
};

export function AdminAnalytics() {
  const [period, setPeriod] = useState<number>(30);

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["adminStats"],
    queryFn: async () => {
      const response = await fetch("/api/admin/analytics/stats", {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error("Failed to fetch stats");
      
      return response.json() as Promise<StatsResponse>;
    }
  });

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ["adminMetrics", period],
    queryFn: async () => {
      const response = await fetch(`/api/admin/analytics/metrics?period=${period}`, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error("Failed to fetch metrics");
      
      return response.json() as Promise<MetricsResponse>;
    }
  });

  const formatResolutionTime = (avgTime: { days: number; hours: number; minutes: number } | number) => {
    if (typeof avgTime === 'number') {
      return "0m";
    }
    if (avgTime.days > 0) {
      return `${avgTime.days}d ${avgTime.hours}h`;
    } else if (avgTime.hours > 0) {
      return `${avgTime.hours}h ${avgTime.minutes}m`;
    } else {
      return `${avgTime.minutes}m`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-slate-400">Wszystkie incydenty</CardTitle>
            <Activity className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-slate-200">
              {statsLoading ? "..." : statsData?.data.totalIncidents}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              W całej organizacji
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-slate-400">Rozwiązane</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-slate-200">
              {statsLoading ? "..." : statsData?.data.resolvedIncidents}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {statsLoading ? "" : `${statsData?.data.resolvedPercentage}% wszystkich`}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-slate-400">Średni czas rozwiązania</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-slate-200">
              {statsLoading ? "..." : formatResolutionTime(statsData?.data.avgResolutionTime ?? 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Dla rozwiązanych incydentów
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-slate-400">Wskaźnik rozwiązań</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-slate-200">
              {statsLoading ? "..." : `${statsData?.data.resolvedPercentage}%`}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Incydentów zakończonych
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Period Selector */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" />
              Metryki czasowe
            </CardTitle>
            <Select value={period.toString()} onValueChange={(val) => setPeriod(Number(val))}>
              <SelectTrigger className="w-[180px] bg-slate-900 border-slate-700 text-slate-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                <SelectItem value="7" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Ostatnie 7 dni</SelectItem>
                <SelectItem value="30" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Ostatnie 30 dni</SelectItem>
                <SelectItem value="90" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Ostatnie 90 dni</SelectItem>
                <SelectItem value="365" className="text-slate-200 focus:bg-blue-500/20 focus:text-white">Ostatni rok</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full min-w-0">
            {metricsLoading ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                <LineChart data={metricsData?.data.timeSeries.incidentsCreated.map((item, idx) => ({
                  date: new Date(item.date).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' }),
                  created: item.count,
                  resolved: metricsData?.data.timeSeries.incidentsResolved[idx]?.count || 0
                })) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#e2e8f0'
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ color: '#94a3b8' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="created" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Utworzone"
                    dot={{ fill: '#3b82f6' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="resolved" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    name="Rozwiązane"
                    dot={{ fill: '#22c55e' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-400" />
              Rozkład statusów
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full min-w-0">
              {statsLoading ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                  <BarChart 
                    data={statsData?.data.statusBreakdown || []}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      type="number"
                      stroke="#64748b"
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis 
                      type="category"
                      dataKey="status" 
                      stroke="#64748b"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      width={150}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#e2e8f0'
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" fill="#e2e8f0" fontSize={12} />
                      {statsData?.data?.statusBreakdown?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || "#64748b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-400" />
              Kategorie LLM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full min-w-0">
              {statsLoading ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                  <PieChart>
                    <Pie
                      data={statsData?.data.categoryBreakdown || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="category"
                    >
                      {statsData?.data?.categoryBreakdown?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || "#64748b"} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#e2e8f0'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Users and Analysts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Users */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              Najbardziej aktywni użytkownicy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metricsLoading ? (
                 <div className="flex items-center justify-center h-32 text-slate-500">
                   <Loader2 className="h-6 w-6 animate-spin" />
                 </div>
              ) : (
                metricsData?.data.topUsers.map((user, idx) => (
                  <div key={user.userId} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-slate-200 text-sm">{user.userName}</p>
                        <p className="text-slate-500 text-xs">{user.userId}</p>
                      </div>
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                      {user.count} zgłoszeń
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Analysts */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-400" />
              Najskuteczniejsi analitycy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
               {metricsLoading ? (
                 <div className="flex items-center justify-center h-32 text-slate-500">
                   <Loader2 className="h-6 w-6 animate-spin" />
                 </div>
              ) : (
                metricsData?.data.topAnalysts.map((analyst, idx) => (
                  <div key={analyst.analystId} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-slate-200 text-sm">{analyst.analystName}</p>
                        <p className="text-slate-500 text-xs">{analyst.analystId}</p>
                      </div>
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                      {analyst.resolved} rozwiązanych
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}