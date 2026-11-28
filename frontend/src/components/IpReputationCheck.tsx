import type { IpLookupResult, SavedEnrichment } from "@/ApiModel/evidence";
import { EnrichmentAction, useEnrichmentLookup } from "./EnrichmentAction";

const failureLabels = {
  not_public: "Sprawdzanie reputacji dotyczy tylko publicznych adresów IP.",
  not_configured: "Organizacja nie ma aktywnego dostępu do AbuseIPDB.",
  unavailable: "AbuseIPDB jest chwilowo niedostępne.",
  rate_limited: "AbuseIPDB ograniczyło liczbę zapytań. Spróbuj ponownie później.",
};
const timestamp = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" });

export function IpReputationCheck({
  incidentId,
  address,
  saved,
}: {
  incidentId: string;
  address: string;
  saved?: SavedEnrichment<IpLookupResult>;
}) {
  const lookup = useEnrichmentLookup(incidentId, "ip-reputation", { address }, saved);
  const result = lookup.result;

  return (
    <div className="mt-2 space-y-1">
      <EnrichmentAction label="AbuseIPDB" status={result?.status} {...lookup} />
      <div className="text-xs" role="status">
        {lookup.error}
        {result?.status === "ready" && (
          <>
            <p>
              AbuseIPDB: ocena {result.result.confidence}/100 · zgłoszenia {result.result.reports}
            </p>
            <p>
              Pobrano {timestamp.format(new Date(result.result.fetchedAt))} · ważne do{" "}
              {timestamp.format(new Date(result.result.expiresAt))}
            </p>
          </>
        )}
        {result && result.status !== "ready" && failureLabels[result.status]}
      </div>
    </div>
  );
}
