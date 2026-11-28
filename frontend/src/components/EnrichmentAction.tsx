import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SavedEnrichment } from "@/ApiModel/evidence";
import { apiFetch } from "@/lib/api";
import { Button } from "./ui/button";

export const enrichmentTime = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "medium",
});

export function useEnrichmentLookup<T extends { status: string }>(
  incidentId: string,
  path: string,
  payload: Record<string, string>,
  saved?: SavedEnrichment<T>,
) {
  type Response = (T | { status: "pending" }) & { retryAt?: string | null };
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const reply = await apiFetch(`/api/analyst/incidents/${incidentId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!reply.ok) throw new Error("Nie udało się zlecić sprawdzenia.");
      return ((await reply.json()) as { data: Response }).data;
    },
    onSuccess: (reply) => {
      if (reply.status === "pending" || reply.retryAt)
        void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    },
  });
  const waiting = saved ? !saved.result : mutation.data?.status === "pending";
  const result = saved ? saved.result : (mutation.data as T | undefined);
  return {
    result: waiting ? undefined : result,
    waiting,
    submitting: mutation.isPending,
    retryAt: saved?.retryAt ?? mutation.data?.retryAt,
    error: mutation.error?.message,
    submit: () => mutation.mutate(),
  };
}

export function EnrichmentAction({
  label,
  status,
  waiting,
  submitting,
  retryAt,
  submit,
}: {
  label: string;
  status?: string;
  waiting: boolean;
  submitting: boolean;
  retryAt?: string | null;
  submit: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const retryTime = retryAt ? Date.parse(retryAt) : 0;
  const blocked = retryTime > now;
  useEffect(() => {
    if (!blocked) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, retryTime - Date.now()));
    return () => window.clearTimeout(timer);
  }, [blocked, retryTime, now]);
  const finished = status === "ready" || status === "matched" || status === "not_found";
  if (waiting || submitting)
    return (
      <p className="text-xs" role="status">
        {label} · Sprawdzanie w tle…
      </p>
    );
  return (
    <>
      {(!blocked || !finished) && (
        <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={submit}>
          {retryAt ? "Ponów w" : "Sprawdź w"} {label}
        </Button>
      )}
      {blocked && <p className="text-xs">Ponowna próba od {enrichmentTime.format(retryTime)}</p>}
    </>
  );
}
