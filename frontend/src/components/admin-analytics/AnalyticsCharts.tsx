import { AlertCircle, Calendar, Loader2, Shield } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface TimeSeriesPoint {
  date: string;
  created: number;
  resolved: number;
}

interface StatusBreakdownItem {
  status: string;
  count: number;
}

interface CategoryBreakdownItem {
  category: string;
  count: number;
}

interface AnalyticsChartsProps {
  period: number;
  metricsLoading: boolean;
  statsLoading: boolean;
  timeSeriesData: TimeSeriesPoint[];
  statusBreakdown: StatusBreakdownItem[];
  categoryBreakdown: CategoryBreakdownItem[];
  onPeriodChange: (period: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  Zgłoszony: "#3b82f6",
  "Raport w trakcie": "#eab308",
  "Raport złożony": "#22c55e",
  "Sprawozdanie w trakcie": "#f59e0b",
  "Sprawozdanie złożone": "#10b981",
  Odrzucone: "#ef4444",
};

const CATEGORY_COLORS: Record<string, string> = {
  Zielony: "#22c55e",
  Żółty: "#eab308",
  Czerwony: "#ef4444",
};

const PERIOD_ITEMS = [
  { value: "7", label: "Ostatnie 7 dni" },
  { value: "30", label: "Ostatnie 30 dni" },
  { value: "90", label: "Ostatnie 90 dni" },
  { value: "365", label: "Ostatni rok" },
] as const;

const tooltipStyle = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "6px",
  color: "#e2e8f0",
};

export default function AnalyticsCharts({
  period,
  metricsLoading,
  statsLoading,
  timeSeriesData,
  statusBreakdown,
  categoryBreakdown,
  onPeriodChange,
}: AnalyticsChartsProps) {
  return (
    <>
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg text-zinc-200">
              <Calendar className="size-5 text-blue-400" />
              Metryki czasowe
            </CardTitle>
            <Select
              items={PERIOD_ITEMS}
              value={period.toString()}
              onValueChange={(val) => onPeriodChange(Number(val))}
            >
              <SelectTrigger className="w-[180px] border-zinc-700 bg-zinc-900 text-zinc-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                {PERIOD_ITEMS.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="text-white focus:bg-blue-500/20 focus:text-white"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full min-w-0">
            {metricsLoading ? <ChartLoader /> : <MetricsLineChart data={timeSeriesData} />}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-zinc-200">
              <AlertCircle className="size-5 text-blue-400" />
              Rozkład statusów
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full min-w-0">
              {statsLoading ? <ChartLoader /> : <StatusBarChart data={statusBreakdown} />}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-zinc-200">
              <Shield className="size-5 text-green-400" />
              Kategorie LLM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full min-w-0">
              {statsLoading ? <ChartLoader /> : <CategoryPieChart data={categoryBreakdown} />}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ChartLoader() {
  return (
    <div className="flex h-full items-center justify-center text-zinc-500">
      <Loader2 className="size-8 animate-spin" />
    </div>
  );
}

function MetricsLineChart({ data }: { data: TimeSeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ color: "#94a3b8" }} />
        <Line
          type="monotone"
          dataKey="created"
          stroke="#3b82f6"
          strokeWidth={2}
          name="Utworzone"
          dot={{ fill: "#3b82f6" }}
        />
        <Line
          type="monotone"
          dataKey="resolved"
          stroke="#22c55e"
          strokeWidth={2}
          name="Rozwiązane"
          dot={{ fill: "#22c55e" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function StatusBarChart({ data }: { data: StatusBreakdownItem[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="status"
          stroke="#64748b"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          width={150}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          <LabelList dataKey="count" position="right" fill="#e2e8f0" fontSize={12} />
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#64748b"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryPieChart({ data }: { data: CategoryBreakdownItem[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label
          outerRadius={100}
          fill="#8884d8"
          dataKey="count"
          nameKey="category"
        >
          {data.map((entry) => (
            <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] || "#64748b"} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
