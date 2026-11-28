import { useId, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useCorrelation, useDecision, type Alert, type Suggestion } from "@/lib/correlation";
import { formText } from "@/lib/correlation";

export function Feedback({ error, pending }: { error: Error | null; pending?: boolean }) {
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  return pending ? <p role="status">Wczytywanie…</p> : null;
}
export function AlertSummary({ alert }: { alert: Alert }) {
  return (
    <div className="space-y-1 break-words">
      <strong>{alert.description}</strong>
      <p>
        Agent {alert.agentName} ({alert.agentId}) · Reguła {alert.ruleId} · Ważność{" "}
        {alert.ruleLevel}
      </p>
      <p className="text-sm text-muted-foreground">
        {new Date(alert.timestamp).toLocaleString("pl-PL")} · {alert.sourceId} / {alert.indexName} /{" "}
        {alert.documentId}
      </p>
    </div>
  );
}
export function Search<T>({
  path,
  label,
  itemKey,
  describe,
  select,
  disabled,
}: {
  path: string;
  label: string;
  itemKey: (item: T) => string;
  describe: (item: T) => React.ReactNode;
  select: (item: T) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const results = useCorrelation<T[]>(
    path + "?query=" + encodeURIComponent(query ?? ""),
    query !== null,
  );
  return (
    <section className="grid gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = formText(new FormData(e.currentTarget), "query");
          if (value === query) void results.refetch();
          else setQuery(value);
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} name="query" type="search" />
        </div>
        <Button variant="outline" type="submit">
          Szukaj
        </Button>
      </form>
      {query !== null && (
        <>
          <Feedback error={results.error} pending={results.isPending} />
          {results.data?.length === 0 && <p>Brak wyników.</p>}
          {results.data?.map((item) => (
            <div
              key={itemKey(item)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div>{describe(item)}</div>
              <Button disabled={disabled} onClick={() => select(item)}>
                Wybierz
              </Button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function Suggestions({
  items,
  editable = true,
  open,
}: {
  items: Suggestion[];
  editable?: boolean;
  open: (id: string) => void;
}) {
  const decision = useDecision();
  function decide(id: string, value: "accepted" | "rejected") {
    decision.mutate(
      { path: "suggestions/" + encodeURIComponent(id), body: { decision: value } },
      {
        onSuccess: (data) => {
          if (value === "accepted" && data?.caseId) open(data.caseId);
        },
      },
    );
  }
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold">Sugestie powiązań</h3>
      {!items.length && <p>Brak sugestii.</p>}
      {items.map((s) => (
        <article className="grid gap-2 rounded-md border p-3" key={s.id}>
          <AlertSummary alert={s.alert} />
          <p>
            Zgłoszenie {s.reportId} · Pewność {s.confidence} · Wersja reguły {s.version}
          </p>
          <p>Sygnały dopasowania · {s.signals.join(", ")}</p>
          <p>
            {s.status === "accepted"
              ? "Zaakceptowana"
              : s.status === "rejected"
                ? "Odrzucona"
                : "Oczekuje na decyzję"}
          </p>
          {editable && s.status !== "accepted" && (
            <div className="flex gap-2">
              <Button disabled={decision.isPending} onClick={() => decide(s.id, "accepted")}>
                Zaakceptuj
              </Button>
              {s.status !== "rejected" && (
                <Button
                  variant="outline"
                  disabled={decision.isPending}
                  onClick={() => decide(s.id, "rejected")}
                >
                  Odrzuć
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
      <Feedback error={decision.error} />
    </section>
  );
}
