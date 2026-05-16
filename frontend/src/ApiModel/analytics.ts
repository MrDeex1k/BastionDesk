import type { ApiResponse } from "./common";

interface AverageResolutionTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

interface CountByStatus {
  status: string;
  count: number;
}

interface CountByCategory {
  category: string;
  count: number;
}

interface AdminStats {
  totalIncidents: number;
  resolvedIncidents: number;
  resolvedPercentage: number;
  avgResolutionTime: AverageResolutionTime;
  statusBreakdown: CountByStatus[];
  categoryBreakdown: CountByCategory[];
}

interface AdminMetrics {
  period: {
    days: number;
    startDate: string;
  };
  timeSeries: {
    incidentsCreated: Array<{ date: string; count: number }>;
    incidentsResolved: Array<{ date: string; count: number }>;
    avgResolutionTimeHours: Array<{
      date: string;
      avg_time_hours: number;
    }>;
  };
  topUsers: Array<{ userId: string; userName: string; count: number }>;
  topAnalysts: Array<{
    analystId: string;
    analystName: string;
    resolved: number;
  }>;
}

export type StatsResponse = ApiResponse<AdminStats>;

export type MetricsResponse = ApiResponse<AdminMetrics>;
