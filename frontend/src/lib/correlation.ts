import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, readJsonError } from "./api";
import type { WazuhAlert } from "./wazuh";

export type Alert = WazuhAlert & { sourceId: string; revision?: string };
export type Agent = { sourceId: string; agentId: string; agentName?: string };
export type Report = { id: string; description: string; createdAt: string };
export type Suggestion = {
  id: string;
  status: string;
  reportId: string;
  alert: Alert;
  confidence: number;
  signals: string[];
  version: string;
};
export type Evidence = { id: string; reportId: string | null; alert: Alert | null };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Case = {
  id: string;
  title: string;
  note: string | null;
  status: "open" | "closed";
  analystId: string | null;
  createdAt: string;
  riskScore: number | null;
  riskLevel: string | null;
  riskReasons: { label: string; points: number }[];
  pendingRiskUpdate: boolean;
  evidence?: Evidence[];
  suggestions?: Suggestion[];
};
export type RiskHistory = {
  id: string;
  reason: string;
  ruleVersion: string;
  riskScore: number | null;
  riskLevel: string | null;
  riskReasons: { label: string; points: number }[];
  createdAt: string;
  inputs: unknown;
};
export type CaseOperation = {
  detail?: Record<string, unknown>;
  id: string;
  action: string;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
};
export type ReportDetail = {
  caseId: string | null;
  suggestions: Suggestion[];
  asset: Agent | null;
};

export const alertRef = ({
  revision,
  indexName,
  documentId,
}: Pick<Alert, "revision" | "indexName" | "documentId">) => ({ revision, indexName, documentId });

function useScope() {
  const { session, organizationId, role } = useAuth();
  return ["correlation", session?.session.id, organizationId, role] as const;
}
async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await apiFetch("/api/correlation/" + path, init);
  if (!response.ok)
    throw new Error(await readJsonError(response, "Nie udało się wykonać operacji."));
  return (await response.json()).data;
}
export function useCorrelation<T>(path: string, enabled = true, poll = false) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, path],
    enabled:
      enabled && Boolean(scope[1] && scope[2]) && (scope[3] === "admin" || scope[3] === "analityk"),
    gcTime: 0,
    retry: false,
    refetchInterval: poll ? 10000 : false,
    queryFn: ({ signal }) => request<T>(path, { signal, cache: "no-store" }),
  });
}
export function useDecision() {
  const client = useQueryClient();
  const scope = useScope();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      request<{ id?: string; caseId?: string | null } | null>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: scope }),
  });
}

export function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
