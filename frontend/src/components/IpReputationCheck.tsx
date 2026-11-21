import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "./ui/button";

type Lookup =
  | {
      status: "ready";
      result: { confidence: number; reports: number; fetchedAt: string; expiresAt: string };
    }
  | { status: "not_public" | "not_configured" | "unavailable" | "rate_limited" };

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
}: {
  incidentId: string;
  address: string;
}) {
  const lookup = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/api/analyst/incidents/${incidentId}/ip-reputation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!response.ok) throw new Error("Nie udało się sprawdzić reputacji IP.");
      return ((await response.json()) as { data: Lookup }).data;
    },
  });

  return (
    <div className="mt-2 space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={lookup.isPending}
        onClick={() => lookup.mutate()}
      >
        Sprawdź w AbuseIPDB
      </Button>
      <div className="text-xs" role="status">
        {lookup.isPending && "Sprawdzanie reputacji IP…"}
        {lookup.error?.message}
        {lookup.data?.status === "ready" && (
          <>
            <p>
              AbuseIPDB: ocena {lookup.data.result.confidence}/100 · zgłoszenia{" "}
              {lookup.data.result.reports}
            </p>
            <p>
              Pobrano {timestamp.format(new Date(lookup.data.result.fetchedAt))} · ważne do{" "}
              {timestamp.format(new Date(lookup.data.result.expiresAt))}
            </p>
          </>
        )}
        {lookup.data && lookup.data.status !== "ready" && failureLabels[lookup.data.status]}
      </div>
    </div>
  );
}
