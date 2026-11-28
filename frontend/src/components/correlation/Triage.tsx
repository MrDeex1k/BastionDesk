import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { WazuhAlert } from "@/lib/wazuh";
import {
  alertRef,
  useCorrelation,
  useDecision,
  type Agent,
  type Report,
  type ReportDetail,
  type Alert,
} from "@/lib/correlation";
import { formText } from "@/lib/correlation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { CaseDetails } from "./Cases";
import { Search, Feedback, Suggestions, AlertSummary } from "./Controls";

export function AlertTriage({ alert, revision }: { alert: WazuhAlert; revision: string }) {
  const [show, setShow] = useState(false);
  const [caseId, open] = useState<string | null>(null);
  const ref = alertRef({ ...alert, revision });
  const lookup = useCorrelation<{ caseId: string | null }>(
    "alert-case?" +
      new URLSearchParams({ revision, indexName: alert.indexName, documentId: alert.documentId }),
    show,
  );
  const decision = useDecision();
  if (caseId) return <CaseDetails id={caseId} back={() => open(null)} />;
  if (!show)
    return <Button onClick={() => setShow(true)}>Utwórz incydent lub powiąż zgłoszenie</Button>;
  return (
    <section className="grid gap-4 border-t pt-4">
      <Feedback error={lookup.error} pending={lookup.isPending} />
      {lookup.data &&
        (lookup.data.caseId ? (
          <Button onClick={() => open(lookup.data.caseId)}>Otwórz powiązany incydent</Button>
        ) : (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              decision.mutate(
                {
                  path: "cases",
                  body: {
                    title: formText(form, "title"),
                    note: formText(form, "note") || undefined,
                    alert: ref,
                  },
                },
                {
                  onSuccess: (data) => {
                    if (data?.id) open(data.id);
                  },
                },
              );
            }}
          >
            <h3 className="font-semibold">Utwórz incydent</h3>
            <p>
              Alert {alert.documentId} · Agent {alert.agentName} ({alert.agentId})
            </p>
            <label>
              Tytuł
              <Input
                name="title"
                required
                defaultValue={alert.description || "Alert Wazuh " + alert.ruleId}
              />
            </label>
            <label>
              Notatka (opcjonalna)
              <Textarea name="note" />
            </label>
            <Button type="submit" disabled={decision.isPending}>
              Utwórz incydent
            </Button>
          </form>
        ))}
      <Search<Report>
        path="reports"
        label="Powiąż istniejące zgłoszenie"
        itemKey={(r) => r.id}
        describe={(r) => r.description + " · " + r.id}
        disabled={decision.isPending}
        select={(r) =>
          decision.mutate(
            { path: "links", body: { alert: ref, reportId: r.id } },
            {
              onSuccess: (data) => {
                if (data?.id) open(data.id);
              },
            },
          )
        }
      />
      <Feedback error={decision.error} />
    </section>
  );
}
export function ReportTriage({ reportId }: { reportId: string }) {
  const { role, session, organizationId } = useAuth();
  if (!organizationId || !session || (role !== "admin" && role !== "analityk")) return null;
  return (
    <ReportPanel
      key={JSON.stringify([session.session.id, organizationId, role, reportId])}
      reportId={reportId}
    />
  );
}
function ReportPanel({ reportId }: { reportId: string }) {
  const [show, setShow] = useState(false);
  const [caseId, open] = useState<string | null>(null);
  const path = "reports/" + encodeURIComponent(reportId);
  const report = useCorrelation<ReportDetail>(path, show, show);
  const decision = useDecision();
  if (caseId) return <CaseDetails id={caseId} back={() => open(null)} />;
  if (!show)
    return (
      <Button variant="outline" onClick={() => setShow(true)}>
        Korelacja z alertami Wazuh
      </Button>
    );
  return (
    <section className="grid gap-4 rounded-lg border p-4">
      <h3 className="font-semibold">Korelacja z alertami Wazuh</h3>
      <Feedback error={report.error} pending={report.isPending} />
      {report.data && (
        <>
          {report.data.caseId && (
            <Button variant="outline" onClick={() => open(report.data.caseId)}>
              Otwórz powiązany incydent
            </Button>
          )}
          <p>
            Potwierdzony zasób ·{" "}
            {report.data.asset
              ? report.data.asset.sourceId + " / " + report.data.asset.agentId
              : "Brak"}
          </p>
          <Search<Agent>
            path="agents"
            label="Wyszukaj agenta, aby potwierdzić zasób"
            itemKey={(a) => JSON.stringify([a.sourceId, a.agentId])}
            describe={(a) => [a.agentName, a.sourceId, a.agentId].filter(Boolean).join(" · ")}
            disabled={decision.isPending}
            select={({ sourceId, agentId }) =>
              decision.mutate({ path: path + "/asset", body: { sourceId, agentId } })
            }
          />
          <Search<Alert>
            path="alerts"
            label="Wyszukaj alert do powiązania"
            itemKey={(a) => JSON.stringify(alertRef(a))}
            describe={(a) => <AlertSummary alert={a} />}
            disabled={decision.isPending}
            select={(a) =>
              decision.mutate(
                { path: "links", body: { reportId, alert: alertRef(a) } },
                {
                  onSuccess: (data) => {
                    if (data?.id) open(data.id);
                  },
                },
              )
            }
          />
          <div>
            <Button
              variant="outline"
              disabled={decision.isPending}
              onClick={() => decision.mutate({ path: path + "/refresh", body: {} })}
            >
              Ponów analizę
            </Button>
          </div>
          <Suggestions items={report.data.suggestions} open={open} />
        </>
      )}
      <Feedback error={decision.error} />
    </section>
  );
}
