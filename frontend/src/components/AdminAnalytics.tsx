import { lazy, Suspense, type ReactNode, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock, Loader2, Shield, TrendingUp, Users } from "lucide-react";
import type { MetricsResponse, StatsResponse } from "@/ApiModel";
import { apiFetch } from "@/lib/api";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const AnalyticsCharts = lazy(() => import("./admin-analytics/AnalyticsCharts"));

const formatResolutionTime = (
  avgTime: { days: number; hours: number; minutes: number } | number,
) => {
  if (typeof avgTime === "number") {
    return "0m";
  }
  if (avgTime.days > 0) {
    return `${avgTime.days}d ${avgTime.hours}h`;
  }
  if (avgTime.hours > 0) {
    return `${avgTime.hours}h ${avgTime.minutes}m`;
  }
  return `${avgTime.minutes}m`;
};

export function AdminAnalytics() {
  const [period, setPeriod] = useState<number>(30);

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["adminStats"],
    queryFn: async () => {
      const response = await apiFetch("/api/admin/analytics/stats");

      if (!response.ok) throw new Error("Failed to fetch stats");

      return response.json() as Promise<StatsResponse>;
    },
  });

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ["adminMetrics", period],
    queryFn: async () => {
      const response = await apiFetch(`/api/admin/analytics/metrics?period=${period}`);

      if (!response.ok) throw new Error("Failed to fetch metrics");

      return response.json() as Promise<MetricsResponse>;
    },
  });

  const stats = statsData?.data;
  const metrics = metricsData?.data;

  const timeSeriesData = useMemo(
    () =>
      metrics?.timeSeries.incidentsCreated.map((item, idx) => ({
        date: new Date(item.date).toLocaleDateString("pl-PL", {
          day: "2-digit",
          month: "short",
        }),
        created: item.count,
        resolved: metrics.timeSeries.incidentsResolved[idx]?.count || 0,
      })) || [],
    [metrics],
  );

  const statusBreakdown = useMemo(() => stats?.statusBreakdown || [], [stats?.statusBreakdown]);

  const categoryBreakdown = useMemo(
    () => stats?.categoryBreakdown || [],
    [stats?.categoryBreakdown],
  );

  const topUsers = useMemo(() => metrics?.topUsers || [], [metrics?.topUsers]);

  const topAnalysts = useMemo(() => metrics?.topAnalysts || [], [metrics?.topAnalysts]);
  const topUserItems = useMemo(
    () =>
      topUsers.map((user) => ({
        id: user.userId,
        name: user.userName,
        meta: user.userId,
        badge: `${user.count} zgłoszeń`,
        accent: "blue" as const,
      })),
    [topUsers],
  );
  const topAnalystItems = useMemo(
    () =>
      topAnalysts.map((analyst) => ({
        id: analyst.analystId,
        name: analyst.analystName,
        meta: analyst.analystId,
        badge: `${analyst.resolved} rozwiązanych`,
        accent: "green" as const,
      })),
    [topAnalysts],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Wszystkie incydenty"
          value={statsLoading ? "..." : stats?.totalIncidents}
          description="W całej organizacji"
          icon={<Activity className="size-4 text-blue-400" />}
        />
        <StatsCard
          title="Rozwiązane"
          value={statsLoading ? "..." : stats?.resolvedIncidents}
          description={statsLoading ? "" : `${stats?.resolvedPercentage}% wszystkich`}
          icon={<CheckCircle2 className="size-4 text-green-400" />}
        />
        <StatsCard
          title="Średni czas rozwiązania"
          value={statsLoading ? "..." : formatResolutionTime(stats?.avgResolutionTime ?? 0)}
          description="Dla rozwiązanych incydentów"
          icon={<Clock className="size-4 text-yellow-400" />}
        />
        <StatsCard
          title="Wskaźnik rozwiązań"
          value={statsLoading ? "..." : `${stats?.resolvedPercentage}%`}
          description="Incydentów zakończonych"
          icon={<TrendingUp className="size-4 text-green-400" />}
        />
      </div>

      <Suspense
        fallback={
          <div className="flex h-[300px] items-center justify-center text-zinc-500">
            <Loader2 className="size-8 animate-spin" />
          </div>
        }
      >
        <AnalyticsCharts
          period={period}
          metricsLoading={metricsLoading}
          statsLoading={statsLoading}
          timeSeriesData={timeSeriesData}
          statusBreakdown={statusBreakdown}
          categoryBreakdown={categoryBreakdown}
          onPeriodChange={setPeriod}
        />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingCard
          title="Najbardziej aktywni użytkownicy"
          icon={<Users className="size-5 text-blue-400" />}
          loading={metricsLoading}
          items={topUserItems}
        />
        <RankingCard
          title="Najskuteczniejsi analitycy"
          icon={<Shield className="size-5 text-green-400" />}
          loading={metricsLoading}
          items={topAnalystItems}
        />
      </div>
    </div>
  );
}

interface StatsCardProps {
  title: string;
  value: ReactNode;
  description: string;
  icon: ReactNode;
}

function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-zinc-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl text-zinc-100">{value}</div>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </CardContent>
    </Card>
  );
}

interface RankingItem {
  id: string;
  name: string;
  meta: string;
  badge: string;
  accent: "blue" | "green";
}

interface RankingCardProps {
  title: string;
  icon: ReactNode;
  loading: boolean;
  items: RankingItem[];
}

function RankingCard({ title, icon, loading, items }: RankingCardProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-zinc-500">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-8 items-center justify-center rounded-full text-sm ${
                      item.accent === "blue"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm text-zinc-100">{item.name}</p>
                    <p className="text-xs text-zinc-500">{item.meta}</p>
                  </div>
                </div>
                <Badge
                  className={
                    item.accent === "blue"
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                      : "bg-green-500/20 text-green-400 border-green-500/50"
                  }
                >
                  {item.badge}
                </Badge>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
