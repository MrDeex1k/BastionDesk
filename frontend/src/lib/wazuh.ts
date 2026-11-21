import { apiFetch } from "./api";
import type { Indicator, WazuhFileObservation } from "@/ApiModel/evidence";

export interface WazuhStatus {
  source: { enabled: boolean; revision: string } | null;
  refreshSeconds: number;
  settings?: { origin: string; username: string; ca: string | null };
}

export interface WazuhAlert {
  indexName: string;
  documentId: string;
  agentId: string;
  agentName: string | null;
  timestamp: string;
  ruleId: string;
  ruleLevel: number;
  description: string;
}

export type WazuhAlertDetail = WazuhAlert & {
  indicators?: Indicator[];
  fileObservations?: WazuhFileObservation[];
};

export class WazuhRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function wazuhRequest<T>(
  organizationId: string,
  path: string,
  params: Record<string, string> = {},
  init: RequestInit = {},
): Promise<T> {
  const query = new URLSearchParams({ ...params, organizationId });
  const verifiesSource =
    path === "source/check" || init.method === "PUT" || init.method === "PATCH";
  const response = await apiFetch(
    `/api/wazuh/${path}?${query}`,
    { ...init, cache: "no-store" },
    verifiesSource ? { minimumTimeoutMs: 15_000 } : undefined,
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new WazuhRequestError(
      result?.error?.message ?? "Nie udało się odczytać odpowiedzi BastionDesk.",
      result?.error?.code,
    );
  return result.data;
}
