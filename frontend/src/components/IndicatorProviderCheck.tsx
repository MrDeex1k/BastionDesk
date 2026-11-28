import type {
  Indicator,
  IndicatorLookupResult,
  LookupProvider,
  SavedEnrichment,
} from "@/ApiModel/evidence";
import { EnrichmentAction, useEnrichmentLookup } from "./EnrichmentAction";

const labels: Record<LookupProvider, string> = {
  otx: "LevelBlue OTX",
  hybrid_analysis: "Hybrid Analysis",
  virustotal: "VirusTotal",
};
const statuses = {
  not_configured: "Organizacja nie ma aktywnego dostępu do dostawcy.",
  not_public: "Sprawdzanie obejmuje tylko publiczne wskaźniki.",
  unsupported: "Dostawca nie obsługuje tego typu wskaźnika.",
  unavailable: "Nie udało się odczytać danych dostawcy.",
  rate_limited: "Osiągnięto limit zapytań. Spróbuj ponownie później.",
};
const verdicts = {
  malicious: "złośliwy",
  suspicious: "podejrzany",
  benign: "nieszkodliwy według dostawcy",
  unknown: "nieznany",
};
const timestamp = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" });

function summarize({ summary }: Extract<IndicatorLookupResult, { status: "ready" }>) {
  switch (summary.kind) {
    case "pulses":
      return `Powiązane wpisy OTX (Pulses): ${summary.count}`;
    case "sandbox":
      return `Werdykt: ${verdicts[summary.verdict]}${summary.score === undefined ? "" : ` · ocena ${summary.score}/100`}`;
    case "engines":
      return `Złośliwy według ${summary.malicious} z ${summary.evaluated} silników · podejrzany według ${summary.suspicious}`;
  }
}

export function IndicatorProviderCheck({
  incidentId,
  provider,
  kind,
  value,
  saved,
}: {
  incidentId: string;
  provider: LookupProvider;
  kind: Indicator["kind"];
  value: string;
  saved?: SavedEnrichment<IndicatorLookupResult>;
}) {
  const label = labels[provider];
  const lookup = useEnrichmentLookup(
    incidentId,
    "ioc-enrichment",
    { provider, kind, value },
    saved,
  );
  const result = lookup.result;
  const analysisAt =
    result?.status === "ready" && "analysisAt" in result.summary
      ? result.summary.analysisAt
      : undefined;

  return (
    <div className="mt-2 space-y-1">
      <EnrichmentAction label={label} status={result?.status} {...lookup} />
      <div className="text-xs" role="status">
        {lookup.error}
        {result?.status === "ready" && (
          <p>
            {label} · {summarize(result)}
          </p>
        )}
        {result?.status === "not_found" && (
          <p>
            {label} ·{" "}
            {provider === "otx"
              ? "Brak powiązanych wpisów (Pulses)."
              : "Brak raportu dla tego SHA-256."}
          </p>
        )}
        {result && (result.status === "ready" || result.status === "not_found") && (
          <p>
            Pobrano {timestamp.format(new Date(result.fetchedAt))} · ważne do{" "}
            {timestamp.format(new Date(result.expiresAt))}
          </p>
        )}
        {analysisAt && <p>Analiza dostawcy {timestamp.format(new Date(analysisAt))}</p>}
        {result && result.status !== "ready" && result.status !== "not_found" && (
          <p>{statuses[result.status]}</p>
        )}
      </div>
    </div>
  );
}
