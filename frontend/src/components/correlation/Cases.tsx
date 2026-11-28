import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  alertRef,
  useCorrelation,
  useDecision,
  type Alert,
  type Case,
  type Report,
  type Evidence,
  type Page,
  type RiskHistory,
  type CaseOperation,
} from "@/lib/correlation";
import { formText } from "@/lib/correlation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { AlertSummary, Feedback, Search, Suggestions } from "./Controls";

const levels: Record<string, string> = {
  low: "Niskie",
  medium: "Średnie",
  high: "Wysokie",
  critical: "Krytyczne",
};
function risk(c: Pick<Case, "riskLevel">) {
  return c.riskLevel ? (levels[c.riskLevel] ?? c.riskLevel) : "Brak oceny";
}
export function Cases() {
  const { session, organizationId, role } = useAuth();
  if (!session || !organizationId || (role !== "analityk" && role !== "admin")) return null;
  return <Queue key={JSON.stringify([session.session.id, organizationId, role])} />;
}
function useCursor() {
  const [trail, setTrail] = useState<string[]>([]);
  return {
    cursor: trail.at(-1),
    previous: trail.length ? () => setTrail((items) => items.slice(0, -1)) : undefined,
    next: (cursor: string) => setTrail((items) => [...items, cursor]),
    reset: () => setTrail([]),
  };
}

function Pagination({
  paging,
  nextCursor,
}: {
  paging: ReturnType<typeof useCursor>;
  nextCursor?: string | null;
}) {
  if (!paging.previous && !nextCursor) return null;
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={!paging.previous} onClick={paging.previous}>
        Poprzednia strona
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!nextCursor}
        onClick={() => nextCursor && paging.next(nextCursor)}
      >
        Następna strona
      </Button>
    </div>
  );
}

function listPath(query: Record<string, string>, cursor?: string) {
  return "cases?" + new URLSearchParams({ ...query, ...(cursor && { cursor }) });
}

function Queue() {
  const [sort, setSort] = useState(false);
  const [status, setStatus] = useState("");
  const [id, setId] = useState<string | null>(null);
  const paging = useCursor();
  const cases = useCorrelation<Page<Case>>(
    listPath(
      {
        sort: sort ? "risk" : "recent",
        ...(status && { status }),
      },
      paging.cursor,
    ),
  );
  if (id) return <CaseDetails key={id} id={id} back={() => setId(null)} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Incydenty analityczne</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sort}
            onChange={(e) => {
              setSort(e.target.checked);
              paging.reset();
            }}
          />
          Sortuj według ryzyka
        </label>
        <label>
          Status{" "}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              paging.reset();
            }}
          >
            <option value="">Wszystkie</option>
            <option value="open">Otwarte</option>
            <option value="closed">Zamknięte</option>
          </select>
        </label>
        <Feedback pending={cases.isPending} error={cases.error} />
        {cases.data?.items.length === 0 && <p>Brak incydentów.</p>}
        {cases.data?.items.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b py-3"
          >
            <div>
              <h3 className="font-semibold">{c.title}</h3>
              <p>
                {c.status === "open" ? "Otwarty" : "Zamknięty"} · {risk(c)} ·{" "}
                {new Date(c.createdAt).toLocaleString("pl-PL")}
              </p>
            </div>
            <Button variant="outline" onClick={() => setId(c.id)}>
              Otwórz incydent
            </Button>
          </div>
        ))}
        <Pagination paging={paging} nextCursor={cases.data?.nextCursor} />
      </CardContent>
    </Card>
  );
}
function EvidenceControls({ item, c }: { item: Evidence; c: Case }) {
  const [action, setAction] = useState<"unlink" | "move" | null>(null);
  const { role, user } = useAuth();
  const paging = useCursor();
  const choices = useCorrelation<Page<Case>>(
    listPath({ status: "open" }, paging.cursor),
    action === "move",
  );
  const decision = useDecision();
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAction("unlink")}>
          Odepnij
        </Button>
        <Button variant="outline" onClick={() => setAction("move")}>
          Przenieś
        </Button>
      </div>
      {action && (
        <form
          key={action}
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            decision.mutate(
              {
                path: "cases/" + encodeURIComponent(c.id) + "/actions",
                body: {
                  action,
                  evidenceId: item.id,
                  reason: formText(data, "reason"),
                  ...(action === "move" ? { targetCaseId: data.get("target") } : {}),
                },
              },
              { onSuccess: () => setAction(null) },
            );
          }}
        >
          {action === "move" && (
            <>
              <label>
                Incydent docelowy{" "}
                <select key={paging.cursor ?? ""} name="target" required defaultValue="">
                  <option value="">Wybierz incydent</option>
                  {choices.data?.items
                    ?.filter(
                      (x) =>
                        x.id !== c.id &&
                        x.status === "open" &&
                        (role === "admin" || x.analystId === user?.id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title} ({x.id})
                      </option>
                    ))}
                </select>
              </label>
              <Feedback error={choices.error} pending={choices.isPending} />
              <Pagination paging={paging} nextCursor={choices.data?.nextCursor} />
            </>
          )}
          <label>
            Uzasadnienie
            <Input name="reason" required pattern=".*\S.*" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={decision.isPending}>
              {action === "move" ? "Zatwierdź przeniesienie" : "Zatwierdź odpięcie"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setAction(null)}>
              Anuluj
            </Button>
          </div>
        </form>
      )}
      <Feedback error={decision.error} />
    </div>
  );
}
export function CaseDetails({ id, back }: { id: string; back: () => void }) {
  const path = "cases/" + encodeURIComponent(id);
  const result = useCorrelation<Case>(path, true, true);
  const { user, role } = useAuth();
  const decision = useDecision();
  const [reason, setReason] = useState("");
  const c = result.data;
  const owner = role === "admin" || Boolean(user && c?.analystId === user.id);
  const editable = owner && c?.status === "open";
  function action(name: string, fields: object = {}) {
    decision.mutate({ path: path + "/actions", body: { action: name, ...fields } });
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <Button variant="ghost" onClick={back}>
            Wróć
          </Button>
        </div>
        <CardTitle>{c?.title ?? "Incydent analityczny"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Feedback pending={result.isPending} error={result.error} />
        {c && (
          <>
            <CaseSummary c={c} />
            <div className="flex flex-wrap items-end gap-2">
              {!c.analystId && (
                <Button disabled={decision.isPending} onClick={() => action("take")}>
                  Przejmij
                </Button>
              )}
              {editable && (
                <Button
                  disabled={decision.isPending}
                  variant="outline"
                  onClick={() => action("close")}
                >
                  Zamknij incydent
                </Button>
              )}
              {owner && !editable && (
                <>
                  <label>
                    Powód wznowienia
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                  <Button
                    disabled={!reason.trim() || decision.isPending}
                    onClick={() => action("reopen", { reason: reason.trim() })}
                  >
                    Wznów
                  </Button>
                </>
              )}
              {editable && (
                <Button
                  variant="outline"
                  disabled={decision.isPending}
                  onClick={() => decision.mutate({ path: path + "/refresh", body: {} })}
                >
                  Ponów analizę
                </Button>
              )}
            </div>
            <Feedback error={decision.error} />
            <section className="grid gap-2">
              <h3 className="font-semibold">Dowody</h3>
              {!c.evidence?.length && <p>Brak dowodów</p>}
              {c.evidence?.map((item) => (
                <article key={item.id} className="grid gap-3 rounded-md border p-3">
                  {item.alert && <AlertSummary alert={item.alert} />}{" "}
                  {item.reportId && <p>Zgłoszenie {item.reportId}</p>}
                  {editable && <EvidenceControls item={item} c={c} />}
                </article>
              ))}
            </section>
            {editable && (
              <>
                <Search<Report>
                  path="reports"
                  label="Dołącz zgłoszenie"
                  itemKey={(r) => r.id}
                  describe={(r) => r.description + " · " + r.id}
                  select={(r) => action("attachReport", { reportId: r.id })}
                  disabled={decision.isPending}
                />
                <Search<Alert>
                  path="alerts"
                  label="Dołącz alert Wazuh"
                  itemKey={(a) => JSON.stringify(alertRef(a))}
                  describe={(a) => <AlertSummary alert={a} />}
                  select={(a) => action("attachAlert", { alert: alertRef(a) })}
                  disabled={decision.isPending}
                />
              </>
            )}
            <Suggestions
              items={c.suggestions ?? []}
              editable={editable}
              open={() => void result.refetch()}
            />
            <CaseHistory key={c.id} path={path} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HistorySection<T extends { id: string }>({
  path,
  title,
  render,
}: {
  path: string;
  title: string;
  render: (entry: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const paging = useCursor();
  const url = paging.cursor ? path + "&before=" + encodeURIComponent(paging.cursor) : path;
  const result = useCorrelation<Page<T>>(url, open);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="font-semibold">{title}</summary>
      {open && (
        <div className="mt-2 grid gap-2">
          <Feedback error={result.error} pending={result.isPending} />
          {result.data?.items.length === 0 && <p>Brak wpisów.</p>}
          {result.data?.items.map((entry) => (
            <div key={entry.id}>{render(entry)}</div>
          ))}
          <Pagination paging={paging} nextCursor={result.data?.nextCursor} />
        </div>
      )}
    </details>
  );
}

function CaseHistory({ path }: { path: string }) {
  return (
    <>
      <HistorySection<RiskHistory>
        path={path + "/history?kind=risk"}
        title="Historia ryzyka"
        render={(entry) => (
          <details>
            <summary>
              {new Date(entry.createdAt).toLocaleString("pl-PL")} · {risk(entry)}{" "}
              {entry.riskScore !== null && "(" + entry.riskScore + ")"} · {entry.reason}
            </summary>
            <p>Wersja reguł {entry.ruleVersion}</p>
            {entry.riskReasons.map((r) => (
              <p key={r.label}>
                {r.label} · {r.points} pkt
              </p>
            ))}
            <pre className="overflow-auto text-xs">{JSON.stringify(entry.inputs, null, 2)}</pre>
          </details>
        )}
      />
      <HistorySection<CaseOperation>
        path={path + "/history?kind=operations"}
        title="Historia incydentu"
        render={(entry) => (
          <div className="border-l pl-3">
            <p>
              {entry.action} · {entry.actorId ?? "System"}
            </p>
            <time dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString("pl-PL")}
            </time>
            {entry.reason && <p>{entry.reason}</p>}
            {entry.detail && Object.keys(entry.detail).length > 0 && (
              <details>
                <summary>Szczegóły operacji</summary>
                <pre className="overflow-auto text-xs">{JSON.stringify(entry.detail, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      />
    </>
  );
}

function CaseSummary({ c }: { c: Case }) {
  return (
    <>
      <p>
        {c.status === "open" ? "Otwarty" : "Zamknięty"} · {c.analystId ?? "Nieprzypisany"} · {c.id}
      </p>
      {c.note && <p>{c.note}</p>}
      <section>
        <h3 className="font-semibold">
          Ryzyko · {risk(c)} {c.riskScore !== null && "(" + c.riskScore + ")"}
        </h3>
        {c.riskReasons.map((r) => (
          <p key={r.label}>
            {r.label} · {r.points} pkt
          </p>
        ))}
        {c.pendingRiskUpdate && <p>Nowy wynik analizy oczekuje na wznowienie incydentu.</p>}
      </section>
    </>
  );
}
