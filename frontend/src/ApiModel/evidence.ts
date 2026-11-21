export interface Indicator {
  kind: "ipv4" | "ipv6" | "domain" | "url" | "md5" | "sha1" | "sha256";
  value: string;
  fields: string[];
}

export type WazuhFileObservation =
  | { method: "yara"; status: "matched"; rule: string; file?: string }
  | {
      method: "virustotal";
      status: "matched" | "clean" | "not_found" | "failed";
      file?: string;
      sourceAlertId?: string;
      positives?: number;
    };
