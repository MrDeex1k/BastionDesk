import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { yaraRequest, attachmentScanSchema } from "@/lib/yara";

export function useAttachmentScan(incidentId: string, hasAttachment: boolean) {
  const { session, organizationId, role } = useAuth();
  const path = `/api/incidents/${incidentId}/attachment-scan`;
  const client = useQueryClient();
  const queryKey = ["yara-scan", incidentId, session?.session.id, organizationId, role];
  const enabled = Boolean(hasAttachment && session?.session.id && organizationId);
  const scan = useQuery({
    queryKey,
    enabled,
    queryFn: ({ signal }) => yaraRequest(path, organizationId!, attachmentScanSchema, { signal }),
    refetchInterval: ({ state }) =>
      state.data?.state === "pending" || state.data?.state === "running" ? 1000 : 15_000,
  });
  const rescan = useMutation({
    mutationKey: queryKey,
    mutationFn: () => yaraRequest(path, organizationId!, attachmentScanSchema, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const state = scan.data?.state;
  return {
    value: scan.data,
    loading: enabled && scan.isPending,
    error: scan.error?.message ?? rescan.error?.message,
    downloadingAllowed:
      !enabled ||
      (!rescan.isPending && (state === "clean" || state === "unscanned" || state === "stale")),
    request: scan.data?.canRequest ? () => rescan.mutate() : undefined,
    requesting: rescan.isPending,
  };
}
