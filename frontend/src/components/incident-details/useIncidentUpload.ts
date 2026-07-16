import { useMutation, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { fileToBase64 } from "./fileToBase64";

interface UseIncidentUploadArgs {
  incidentId: string;
  queryClient: QueryClient;
}

export function useIncidentUpload({ incidentId, queryClient }: UseIncidentUploadArgs) {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"report" | "statement" | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadFileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !uploadType) return;

      const base64Data = await fileToBase64(selectedFile);
      const bodyKey = uploadType === "report" ? "reportData" : "statementData";
      const apiEndpoint = uploadType === "report" ? "reports" : "statements";
      const requestBody = {
        [bodyKey]: {
          filename: selectedFile.name,
          data: base64Data,
          mimeType: selectedFile.type,
        },
      };

      const response = await apiFetch(`/api/analyst/incidents/${incidentId}/${apiEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`Failed to upload ${uploadType}`);

      return response.json();
    },
    onSuccess: (data) => {
      toast.success(
        data?.message ||
          (data?.data?.status === "Raport złożony"
            ? "Raport został przesłany"
            : "Sprawozdanie zostało przesłane"),
      );
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadType(null);
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      void queryClient.invalidateQueries({ queryKey: ["analystIncidents"] });
    },
    onError: () => {
      toast.error("Wystąpił błąd podczas wysyłania pliku");
    },
  });

  return {
    isUploadDialogOpen,
    selectedFile,
    setIsUploadDialogOpen,
    setSelectedFile,
    setUploadType,
    uploadFileMutation,
    uploadType,
  };
}
