export interface Indicator {
  kind: "ipv4" | "ipv6" | "domain" | "url" | "md5" | "sha1" | "sha256";
  value: string;
  fields: string[];
}

export type LookupProvider = "otx" | "hybrid_analysis" | "virustotal";

type ProviderSummary =
  | { kind: "pulses"; count: number }
  | {
      kind: "sandbox";
      verdict: "malicious" | "suspicious" | "benign" | "unknown";
      score?: number;
      analysisAt?: string;
    }
  | {
      kind: "engines";
      malicious: number;
      suspicious: number;
      evaluated: number;
      analysisAt?: string;
    };

export type IndicatorLookupResult = { provider: LookupProvider } & (
  | { status: "ready"; summary: ProviderSummary; fetchedAt: string; expiresAt: string }
  | { status: "not_found"; fetchedAt: string; expiresAt: string }
  | { status: "not_configured" | "not_public" | "unsupported" | "unavailable" | "rate_limited" }
);

export type IpLookupResult =
  | {
      status: "ready";
      result: { confidence: number; reports: number; fetchedAt: string; expiresAt: string };
    }
  | { status: "not_public" | "not_configured" | "unavailable" | "rate_limited" };

export type UrlhausLookupResult =
  | { status: "matched" | "not_found"; fetchedAt: string; expiresAt: string }
  | { status: "not_configured" | "unavailable" | "rate_limited" };

export type SavedEnrichment<T> = { result: T | null; retryAt: string | null };
export type EnrichmentCheck = Pick<Indicator, "kind" | "value"> &
  (
    | ({ provider: "abuseipdb" } & SavedEnrichment<IpLookupResult>)
    | ({ provider: "urlhaus" } & SavedEnrichment<UrlhausLookupResult>)
    | ({ provider: LookupProvider } & SavedEnrichment<IndicatorLookupResult>)
  );

export type WazuhFileObservation =
  | { method: "yara"; status: "matched"; rule: string; file?: string }
  | {
      method: "virustotal";
      status: "matched" | "clean" | "not_found" | "failed";
      file?: string;
      sourceAlertId?: string;
      positives?: number;
    };
