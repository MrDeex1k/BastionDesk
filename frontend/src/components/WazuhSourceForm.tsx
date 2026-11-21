import { useId, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { wazuhRequest, WazuhRequestError, type WazuhStatus } from "@/lib/wazuh";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type Action = "check" | "save" | "toggle" | "delete";
const notices: Record<Action, string> = {
  check: "Połączenie i uprawnienia do odczytu zostały sprawdzone.",
  save: "Źródło Wazuh jest aktywne.",
  toggle: "Zmieniono stan źródła Wazuh.",
  delete: "Usunięto konfigurację źródła.",
};

export function WazuhSourceForm({
  organizationId,
  status,
  onChange,
}: {
  organizationId: string;
  status: WazuhStatus;
  onChange: () => Promise<void>;
}) {
  const id = useId();
  const [origin, setOrigin] = useState(status.settings?.origin ?? "");
  const [username, setUsername] = useState(status.settings?.username ?? "");
  const [password, setPassword] = useState("");
  const [ca, setCa] = useState(status.settings?.ca ?? "");
  const revision = status.source?.revision ?? null;
  const change = useMutation({
    mutationFn: async (action: Action) => {
      const method = { check: "POST", save: "PUT", toggle: "PATCH", delete: "DELETE" }[action];
      const body =
        action === "toggle"
          ? { revision, enabled: !status.source?.enabled }
          : {
              revision,
              origin: origin.trim(),
              username: username.trim(),
              password: password || undefined,
              ca: ca.trim() || undefined,
            };
      await wazuhRequest(
        organizationId,
        action === "check" ? "source/check" : "source",
        action === "delete" && revision ? { revision } : {},
        {
          method,
          ...(action !== "delete" && {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        },
      );
      if (action !== "check") {
        setPassword("");
        await onChange();
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter;
    change.mutate(button?.getAttribute("value") === "check" ? "check" : "save");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Źródło Wazuh</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={submit}>
          <Label htmlFor={id + "-origin"}>Adres HTTPS Indexera</Label>
          <Input
            id={id + "-origin"}
            type="url"
            required
            placeholder="https://indexer.example.com:9200"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          />
          <Label htmlFor={id + "-username"}>Użytkownik Indexera</Label>
          <Input
            id={id + "-username"}
            required
            autoComplete="off"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Label htmlFor={id + "-password"}>Hasło konta Indexera</Label>
          <Input
            id={id + "-password"}
            type="password"
            autoComplete="new-password"
            required={!status.source}
            placeholder={status.source ? "Pozostaw puste, aby zachować hasło" : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Label htmlFor={id + "-ca"}>Certyfikat CA (opcjonalnie, PEM)</Label>
          <Textarea id={id + "-ca"} value={ca} onChange={(event) => setCa(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" value="check" variant="outline" disabled={change.isPending}>
              Sprawdź połączenie
            </Button>
            <Button type="submit" value="save" disabled={change.isPending}>
              Zapisz i włącz
            </Button>
            {status.source && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() => change.mutate("toggle")}
                >
                  {status.source.enabled ? "Wyłącz" : "Włącz ponownie"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={change.isPending}
                  onClick={() => {
                    if (window.confirm("Usunąć konfigurację źródła Wazuh?"))
                      change.mutate("delete");
                  }}
                >
                  Usuń źródło
                </Button>
              </>
            )}
          </div>
          {change.isError && <p role="alert">{change.error.message}</p>}
          {change.error instanceof WazuhRequestError && change.error.code === "WAZUH_STALE" && (
            <Button type="button" variant="outline" onClick={() => void onChange()}>
              Wczytaj aktualną konfigurację
            </Button>
          )}
          {change.isSuccess && change.variables && <p role="status">{notices[change.variables]}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
