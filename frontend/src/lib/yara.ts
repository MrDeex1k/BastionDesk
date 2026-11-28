import { z } from "zod";
import { apiFetch, readJsonError } from "./api";

const scanResultSchema = z.object({
  sha256: z.string(),
  ruleVersion: z.string(),
  matches: z.array(z.string()),
  scannedAt: z.string().nullable(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

export const attachmentScanSchema = z.object({
  state: z.enum(["unscanned", "pending", "running", "clean", "matched", "failed", "stale"]),
  canRequest: z.boolean().optional(),
  latest: scanResultSchema.optional(),
  history: z.array(scanResultSchema).optional(),
});
export type AttachmentScan = z.infer<typeof attachmentScanSchema>;

export const yaraRulesSchema = z.object({
  version: z.string(),
  custom: z.boolean(),
});

export async function yaraRequest<T>(
  path: string,
  organizationId: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
) {
  const query = new URLSearchParams({ organizationId });
  const response = await apiFetch(
    `${path}?${query}`,
    { ...init, cache: "no-store" },
    { minimumTimeoutMs: init.method === "PUT" ? 35_000 : 0 },
  );
  if (!response.ok)
    throw new Error(await readJsonError(response, "Operacja YARA nie powiodła się."));
  const result = z.object({ data: schema }).safeParse(await response.json());
  if (!result.success) throw new Error("Nieprawidłowa odpowiedź usługi YARA.");
  return result.data.data;
}
