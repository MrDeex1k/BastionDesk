import { apiFetch, readJsonError } from "./api";

export interface ScanResult {
  sha256: string;
  ruleVersion: string;
  matches: string[];
  scannedAt: string | null;
}

export interface AttachmentScan {
  state: "unscanned" | "pending" | "running" | "clean" | "matched" | "failed" | "stale";
  canRequest?: boolean;
  latest?: ScanResult;
  history?: ScanResult[];
}

export interface YaraRules {
  version: string;
  custom: boolean;
}

export async function yaraRequest<T>(path: string, organizationId: string, init: RequestInit = {}) {
  const query = new URLSearchParams({ organizationId });
  const response = await apiFetch(
    `${path}?${query}`,
    { ...init, cache: "no-store" },
    { minimumTimeoutMs: init.method === "PUT" ? 35_000 : 0 },
  );
  if (!response.ok)
    throw new Error(await readJsonError(response, "Operacja YARA nie powiodła się."));
  const result = (await response.json()) as { data: T };
  return result.data;
}
