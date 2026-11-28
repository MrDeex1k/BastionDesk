import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { yaraRequest, yaraRulesSchema } from "@/lib/yara";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const path = "/api/admin/yara/rules";

export function YaraRulesForm() {
  const { session, organizationId, role } = useAuth();
  const sessionId = session?.session.id;
  if (!organizationId || !sessionId || role !== "admin") return null;
  return (
    <OrganizationRules
      key={`${sessionId}:${organizationId}`}
      organizationId={organizationId}
      sessionId={sessionId}
    />
  );
}

function OrganizationRules({
  organizationId,
  sessionId,
}: {
  organizationId: string;
  sessionId: string;
}) {
  const client = useQueryClient();
  const queryKey = ["yara-rules", sessionId, organizationId];
  const [draft, setDraft] = useState("");
  const rules = useQuery({
    queryKey,
    queryFn: ({ signal }) => yaraRequest(path, organizationId, yaraRulesSchema, { signal }),
  });
  const change = useMutation({
    mutationFn: (method: "PUT" | "DELETE") =>
      yaraRequest(path, organizationId, yaraRulesSchema, {
        method,
        ...(method === "PUT" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: draft }),
        }),
      }),
    onSuccess: (value, method) => {
      if (method === "PUT") setDraft("");
      client.setQueryData(queryKey, value);
      void client.invalidateQueries({ queryKey: ["yara-scan"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reguły YARA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.isPending && <p role="status">Sprawdzanie aktywnego zestawu…</p>}
        {rules.data && (
          <p className="break-all text-sm" role="status">
            {rules.data.custom
              ? "Aktywne reguły BastionDesk i organizacji."
              : "Aktywne reguły BastionDesk."}{" "}
            Wersja {rules.data.version}
          </p>
        )}
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() && !change.isPending) change.mutate("PUT");
          }}
        >
          <Label htmlFor="yara-rules">Zestaw reguł organizacji</Label>
          <Textarea
            id="yara-rules"
            value={draft}
            disabled={change.isPending}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={65536}
            className="min-h-40 font-mono"
            spellCheck={false}
            placeholder="Wklej treść zestawu reguł YARA"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!draft.trim() || change.isPending}>
              Zapisz i aktywuj
            </Button>
            {rules.data?.custom && (
              <Button
                type="button"
                variant="outline"
                disabled={change.isPending}
                onClick={() => change.mutate("DELETE")}
              >
                Wyłącz reguły organizacji
              </Button>
            )}
          </div>
        </form>
        {(rules.error || change.error) && (
          <p role="alert">{(change.error ?? rules.error)?.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
