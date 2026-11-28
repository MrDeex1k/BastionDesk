import type { EnrichmentCheck, Indicator, LookupProvider } from "@/ApiModel/evidence";
import { IndicatorProviderCheck } from "./IndicatorProviderCheck";
import { IpReputationCheck } from "./IpReputationCheck";
import { UrlhausCheck } from "./UrlhausCheck";

const labels: Record<Indicator["kind"], string> = {
  ipv4: "IPv4",
  ipv6: "IPv6",
  domain: "Domena",
  url: "URL",
  md5: "MD5",
  sha1: "SHA-1",
  sha256: "SHA-256",
};

export function IndicatorList({
  indicators,
  reputationIncidentId,
  urlhausIncidentId,
  incidentId,
  lookupProviders = [],
  enrichmentChecks = [],
}: {
  indicators: readonly Indicator[];
  reputationIncidentId?: string;
  urlhausIncidentId?: string;
  incidentId?: string;
  lookupProviders?: readonly LookupProvider[];
  enrichmentChecks?: readonly EnrichmentCheck[];
}) {
  if (!indicators.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Wskaźniki (IOC)</h3>
      <ul className="space-y-2 text-sm">
        {indicators.map(({ kind, value, fields }) => {
          const checks = enrichmentChecks.filter(
            (check) => check.kind === kind && check.value === value,
          );
          const ip = checks.find((check) => check.provider === "abuseipdb");
          const urlhaus = checks.find((check) => check.provider === "urlhaus");
          const remote = checks.filter(
            (check) => check.provider !== "abuseipdb" && check.provider !== "urlhaus",
          );
          return (
            <li key={`${kind}:${value}`} className="rounded-md border p-2 [overflow-wrap:anywhere]">
              <span className="mr-2 font-medium">{labels[kind]}</span>
              <code>{value}</code>
              <p className="text-xs text-muted-foreground">{fields.join(", ")}</p>
              {reputationIncidentId && (kind === "ipv4" || kind === "ipv6") && (
                <IpReputationCheck incidentId={reputationIncidentId} address={value} saved={ip} />
              )}
              {urlhausIncidentId && kind === "url" && (
                <UrlhausCheck
                  key={urlhausIncidentId}
                  incidentId={urlhausIncidentId}
                  url={value}
                  saved={urlhaus}
                />
              )}
              {incidentId &&
                lookupProviders
                  .filter((provider) => (provider === "otx" ? kind !== "url" : kind === "sha256"))
                  .map((provider) => (
                    <IndicatorProviderCheck
                      key={`${incidentId}:${provider}`}
                      incidentId={incidentId}
                      provider={provider}
                      kind={kind}
                      value={value}
                      saved={remote.find((check) => check.provider === provider)}
                    />
                  ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
