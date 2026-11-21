import type { Indicator } from "@/ApiModel/evidence";
import { IpReputationCheck } from "./IpReputationCheck";

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
}: {
  indicators: readonly Indicator[];
  reputationIncidentId?: string;
}) {
  if (!indicators.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Wskaźniki (IOC)</h3>
      <ul className="space-y-2 text-sm">
        {indicators.map(({ kind, value, fields }) => (
          <li key={`${kind}:${value}`} className="rounded-md border p-2 [overflow-wrap:anywhere]">
            <span className="mr-2 font-medium">{labels[kind]}</span>
            <code>{value}</code>
            <p className="text-xs text-muted-foreground">{fields.join(", ")}</p>
            {reputationIncidentId && (kind === "ipv4" || kind === "ipv6") && (
              <IpReputationCheck incidentId={reputationIncidentId} address={value} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
