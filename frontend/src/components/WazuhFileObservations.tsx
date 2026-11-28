import type { WazuhFileObservation } from "@/ApiModel/evidence";

const labels: Record<WazuhFileObservation["status"], string> = {
  matched: "Wykryto dopasowanie",
  clean: "Brak dopasowań",
  not_found: "Brak raportu",
  failed: "Błąd analizy",
};

export function WazuhFileObservations({
  observations,
}: {
  observations: readonly WazuhFileObservation[];
}) {
  if (!observations.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Wyniki analizy pliku w Wazuh</h3>
      <dl className="grid gap-2 text-sm [overflow-wrap:anywhere]">
        {observations.map((item) => (
          <div key={item.method} className="rounded-md border p-2">
            <dt className="font-medium">{item.method === "yara" ? "YARA" : "VirusTotal"}</dt>
            <dd>{labels[item.status]}</dd>
            {item.file && (
              <dd>
                <code>{item.file}</code>
              </dd>
            )}
            {item.method === "yara" && <dd>Reguła {item.rule}</dd>}
            {item.method === "virustotal" && (
              <>
                {item.positives !== undefined && <dd>Liczba wykryć {item.positives}</dd>}
                {item.sourceAlertId && <dd>Alert źródłowy {item.sourceAlertId}</dd>}
              </>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
