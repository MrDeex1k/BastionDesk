import type { SavedEnrichment, UrlhausLookupResult } from "@/ApiModel/evidence";
import { EnrichmentAction, useEnrichmentLookup } from "./EnrichmentAction";

const labels = {
  matched: "Adres jest w wykazie URLhaus.",
  not_found: "Brak adresu w aktualnym wykazie URLhaus.",
  not_configured: "URLhaus wymaga konfiguracji klucza.",
  unavailable: "Nie udało się pobrać aktualnego wykazu URLhaus.",
  rate_limited: "URLhaus ograniczyło pobieranie wykazu. Spróbuj ponownie później.",
};
const timestamp = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
});

export function UrlhausCheck({
  incidentId,
  url,
  saved,
}: {
  incidentId: string;
  url: string;
  saved?: SavedEnrichment<UrlhausLookupResult>;
}) {
  const lookup = useEnrichmentLookup(incidentId, "urlhaus", { url }, saved);
  const result = lookup.result;

  return (
    <div className="mt-2 space-y-1">
      <EnrichmentAction label="URLhaus" status={result?.status} {...lookup} />
      <div className="text-xs" role="status">
        {lookup.error}
        {result && <p>{labels[result.status]}</p>}
        {result && "fetchedAt" in result && (
          <p>
            Wykaz pobrano {timestamp.format(new Date(result.fetchedAt))} · ważny do{" "}
            {timestamp.format(new Date(result.expiresAt))}
          </p>
        )}
      </div>
    </div>
  );
}
