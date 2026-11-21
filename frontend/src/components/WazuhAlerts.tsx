import { useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";
import { useAuth } from "@/hooks/useAuth";
import { wazuhRequest, WazuhRequestError, type WazuhAlert, type WazuhStatus } from "@/lib/wazuh";
import { WazuhSourceForm } from "./WazuhSourceForm";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Scope = { sessionId: string; organizationId: string };
type AlertPage = { alerts: WazuhAlert[]; cursor: string | null; nextCursor: string | null };
type DateRange = { from: string; to: string };
const features = tableFeatures({});
const emptyAlerts: WazuhAlert[] = [];
const levels = Array.from({ length: 17 }, (_, level) => String(level));
const formatTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "medium" });
const agent = (alert: WazuhAlert) =>
  alert.agentName ? `${alert.agentName} (${alert.agentId})` : alert.agentId;
const columns: ColumnDef<typeof features, WazuhAlert>[] = [
  {
    accessorKey: "timestamp",
    header: "Czas",
    cell: ({ row }) => (
      <time dateTime={row.original.timestamp}>
        {formatTime.format(new Date(row.original.timestamp))}
      </time>
    ),
  },
  { accessorFn: agent, id: "agent", header: "Agent" },
  { accessorKey: "ruleLevel", header: "Poziom" },
  { accessorKey: "ruleId", header: "Reguła" },
  { accessorKey: "description", header: "Opis" },
];

export function WazuhAlerts() {
  const { session, organizationId, role } = useAuth();
  const sessionId = session?.session.id;
  if (!sessionId || !organizationId || (role !== "admin" && role !== "analityk")) return null;
  return (
    <OrganizationWazuh
      key={JSON.stringify([sessionId, organizationId, role])}
      sessionId={sessionId}
      organizationId={organizationId}
      admin={role === "admin"}
    />
  );
}

function OrganizationWazuh({ sessionId, organizationId, admin }: Scope & { admin: boolean }) {
  const queryClient = useQueryClient();
  const status = useQuery<WazuhStatus>({
    queryKey: ["wazuh-source", sessionId, organizationId, admin],
    retry: false,
    refetchInterval: (query) => (query.state.data?.refreshSeconds || 0) * 1000 || false,
    queryFn: ({ signal }) => wazuhRequest<WazuhStatus>(organizationId, "source", {}, { signal }),
  });
  const source = status.data?.source;
  const ready = status.isFetchedAfterMount && !status.isError;
  return (
    <div className="grid w-full gap-4">
      {!ready && !status.isError && <p role="status">Sprawdzanie konfiguracji Wazuh…</p>}
      {status.isError && (
        <div role="alert">
          {status.error.message}{" "}
          <Button variant="outline" onClick={() => void status.refetch()}>
            Ponów
          </Button>
        </div>
      )}
      {ready && status.data && (
        <>
          {admin && (
            <WazuhSourceForm
              key={`form:${source?.revision ?? "new"}`}
              organizationId={organizationId}
              status={status.data}
              onChange={async () => {
                await status.refetch();
                queryClient.removeQueries({
                  queryKey: ["wazuh-alerts", sessionId, organizationId, source?.revision],
                });
              }}
            />
          )}
          {source?.enabled ? (
            <AlertsTable
              key={`table:${source.revision}`}
              sessionId={sessionId}
              organizationId={organizationId}
              revision={source.revision}
              refreshSeconds={status.data.refreshSeconds}
              refreshSource={() => void status.refetch()}
            />
          ) : (
            <p role="status">
              {source
                ? "Źródło Wazuh jest wyłączone."
                : "Organizacja nie ma skonfigurowanego źródła Wazuh."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AlertsTable({
  sessionId,
  organizationId,
  revision,
  refreshSeconds,
  refreshSource,
}: Scope & {
  revision: string;
  refreshSeconds: number;
  refreshSource: () => void;
}) {
  const id = useId();
  const [view] = useState(() => crypto.randomUUID());
  const [level, setLevel] = useState("all");
  const [range, setRange] = useState<DateRange>();
  const [pages, setPages] = useState<string[]>([]);
  const [selection, setSelection] = useState<WazuhAlert>();
  const cursor = pages.at(-1);
  const live = !cursor && !range;
  const reset = () => {
    setPages([]);
    setSelection(undefined);
  };
  const alerts = useQuery({
    queryKey: ["wazuh-alerts", sessionId, organizationId, revision, view, level, range, cursor],
    refetchInterval: live && refreshSeconds > 0 ? refreshSeconds * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: live && refreshSeconds > 0,
    refetchOnReconnect: live && refreshSeconds > 0,
    gcTime: 60_000,
    retry: false,
    queryFn: ({ signal }) =>
      wazuhRequest<AlertPage>(
        organizationId,
        "alerts",
        {
          revision,
          view,
          ...range,
          ...(level !== "all" && { level }),
          ...(cursor && { cursor }),
        },
        { signal },
      ),
  });
  const table = useTable({
    features,
    columns,
    data: alerts.data?.alerts ?? emptyAlerts,
    getRowId: ({ indexName, documentId }) => JSON.stringify([revision, indexName, documentId]),
  });

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = form.get("from");
    const to = form.get("to");
    if (typeof from !== "string" || typeof to !== "string") return;
    const start = new Date(from);
    const end = new Date(to);
    if (start <= end) {
      setRange({ from: start.toISOString(), to: end.toISOString() });
      reset();
    } else {
      const input = event.currentTarget.elements.namedItem("to") as HTMLInputElement;
      input.setCustomValidity("Koniec zakresu musi przypadać po jego początku.");
      input.reportValidity();
    }
  }

  function refresh() {
    const code = alerts.error instanceof WazuhRequestError ? alerts.error.code : undefined;
    if (code === "WAZUH_STALE" || code === "WAZUH_DISABLED" || code === "WAZUH_NOT_CONFIGURED") {
      reset();
      refreshSource();
      if (cursor) return;
    }
    void alerts.refetch();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerty Wazuh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor={id + "-level"}>Poziom reguły</Label>
            <select
              id={id + "-level"}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                reset();
              }}
            >
              <option value="all">Wszystkie</option>
              {levels.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" disabled={alerts.isFetching} onClick={refresh}>
            Odśwież
          </Button>
          <Button
            type="button"
            variant={range ? "outline" : "secondary"}
            onClick={() => {
              setRange(undefined);
              reset();
            }}
          >
            Ostatnie 24 godziny
          </Button>
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={applyRange}>
          <div className="grid gap-2">
            <Label htmlFor={id + "-from"}>Od (czas lokalny)</Label>
            <Input
              id={id + "-from"}
              name="from"
              type="datetime-local"
              required
              onChange={(event) =>
                (
                  event.currentTarget.form?.elements.namedItem("to") as HTMLInputElement | null
                )?.setCustomValidity("")
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={id + "-to"}>Do (czas lokalny)</Label>
            <Input
              id={id + "-to"}
              name="to"
              type="datetime-local"
              required
              onChange={(event) => event.currentTarget.setCustomValidity("")}
            />
          </div>
          <Button type="submit" variant={range ? "secondary" : "outline"}>
            Pokaż zakres
          </Button>
        </form>
        {alerts.isError ? (
          <p role="alert">{alerts.error.message}</p>
        ) : alerts.isPending ? (
          <p role="status">Pobieranie alertów…</p>
        ) : table.getRowModel().rows.length === 0 ? (
          <p role="status">Brak alertów dla wybranych filtrów.</p>
        ) : (
          <Table aria-label="Alerty Wazuh">
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} scope="col">
                      <table.FlexRender header={header} />
                    </TableHead>
                  ))}
                  <TableHead scope="col">Szczegóły</TableHead>
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-normal">
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Szczegóły alertu ${row.original.documentId}`}
                      onClick={() => setSelection(row.original)}
                    >
                      Otwórz
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {(pages.length > 0 || alerts.data?.nextCursor) && (
          <nav aria-label="Strony alertów" className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pages.length <= 1 || alerts.isFetching}
              onClick={() => setPages(pages.slice(0, -1))}
            >
              Poprzednia
            </Button>
            <span>Strona {Math.max(pages.length, 1)}</span>
            <Button
              type="button"
              variant="outline"
              disabled={alerts.isError || alerts.isFetching || !alerts.data?.nextCursor}
              onClick={() => {
                const page = alerts.data;
                if (page?.cursor && page.nextCursor)
                  setPages(
                    pages.length ? [...pages, page.nextCursor] : [page.cursor, page.nextCursor],
                  );
              }}
            >
              Następna
            </Button>
            {pages.length > 0 && (
              <Button type="button" variant="ghost" onClick={reset}>
                Wróć do aktualnych wyników
              </Button>
            )}
          </nav>
        )}
        {selection && !alerts.isError && (
          <AlertDetails
            organizationId={organizationId}
            revision={revision}
            alert={selection}
            close={() => setSelection(undefined)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AlertDetails({
  organizationId,
  revision,
  alert,
  close,
}: {
  organizationId: string;
  revision: string;
  alert: WazuhAlert;
  close: () => void;
}) {
  const { session } = useAuth();
  const [showJson, setShowJson] = useState(false);
  const { indexName, documentId } = alert;
  const load = (path: string, signal: AbortSignal) =>
    wazuhRequest(organizationId, `alerts/${path}`, { revision, indexName, documentId }, { signal });
  const key = [
    "wazuh-alerts",
    session?.session.id,
    organizationId,
    revision,
    indexName,
    documentId,
  ];
  const detail = useQuery({
    queryKey: [...key, "detail"],
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => load("detail", signal) as Promise<WazuhAlert>,
  });
  const json = useQuery({
    queryKey: [...key, "json"],
    retry: false,
    gcTime: 0,
    enabled: showJson && !detail.isError,
    queryFn: ({ signal }) => load("json", signal) as Promise<{ _source: Record<string, unknown> }>,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogTitle>Szczegóły alertu Wazuh</DialogTitle>
        <DialogDescription>
          {agent(alert)} · {formatTime.format(new Date(alert.timestamp))}
        </DialogDescription>
        <dl className="grid gap-1 text-sm [overflow-wrap:anywhere]">
          <dt className="font-medium">Indeks ( _index )</dt>
          <dd>{indexName}</dd>
          <dt className="font-medium">Dokument ( _id )</dt>
          <dd>{documentId}</dd>
          {detail.isSuccess && (
            <>
              <dt className="font-medium">Reguła</dt>
              <dd>
                {detail.data.ruleId} · poziom {detail.data.ruleLevel}
              </dd>
              <dt className="font-medium">Opis</dt>
              <dd>{detail.data.description}</dd>
            </>
          )}
        </dl>
        {detail.isPending && <p role="status">Pobieranie szczegółów…</p>}
        {detail.isError && <p role="alert">{detail.error.message}</p>}
        {detail.isSuccess && !showJson && (
          <Button type="button" onClick={() => setShowJson(true)}>
            Pokaż JSON
          </Button>
        )}
        {showJson &&
          (json.isError ? (
            <p role="alert">{json.error.message}</p>
          ) : json.isPending ? (
            <p role="status">Pobieranie dokumentu…</p>
          ) : (
            <pre
              aria-label="Dokument JSON Wazuh"
              className="max-h-[45vh] overflow-auto rounded-md bg-muted p-3 text-xs"
            >
              {JSON.stringify(json.data?._source, null, 2)}
            </pre>
          ))}
      </DialogContent>
    </Dialog>
  );
}
