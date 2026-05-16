import { useReducer, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  AlertCircle,
  Upload,
  X,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

interface IncidentReportFormProps {
  onSuccess?: () => void;
}

interface IncidentReportState {
  description: string;
  screenshot: File | null;
  attachment: File | null;
  validationError: string | null;
  showSuccess: boolean;
}

type IncidentReportAction =
  | { type: "set-description"; value: string }
  | { type: "set-screenshot"; value: File | null }
  | { type: "set-attachment"; value: File | null }
  | { type: "set-validation-error"; value: string | null }
  | { type: "set-show-success"; value: boolean }
  | { type: "reset-form" };

const initialIncidentReportState: IncidentReportState = {
  description: "",
  screenshot: null,
  attachment: null,
  validationError: null,
  showSuccess: false,
};

function incidentReportReducer(
  state: IncidentReportState,
  action: IncidentReportAction,
): IncidentReportState {
  switch (action.type) {
    case "set-description":
      return { ...state, description: action.value };
    case "set-screenshot":
      return { ...state, screenshot: action.value };
    case "set-attachment":
      return { ...state, attachment: action.value };
    case "set-validation-error":
      return { ...state, validationError: action.value };
    case "set-show-success":
      return { ...state, showSuccess: action.value };
    case "reset-form":
      return { ...initialIncidentReportState };
    default:
      return state;
  }
}

export function IncidentReportForm({ onSuccess }: IncidentReportFormProps) {
  const [state, dispatch] = useReducer(
    incidentReportReducer,
    initialIncidentReportState,
  );
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const incidentMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiFetch("/api/incidents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Wystąpił błąd podczas wysyłania zgłoszenia",
        );
      }

      return response.json();
    },
    onSuccess: (data) => {
      dispatch({ type: "set-show-success", value: true });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["myIncidents"] }),
        queryClient.invalidateQueries({ queryKey: ["analystIncidents"] }),
        queryClient.invalidateQueries({ queryKey: ["adminIncidents"] }),
        queryClient.invalidateQueries({ queryKey: ["adminStats"] }),
        queryClient.invalidateQueries({ queryKey: ["adminMetrics"] }),
      ]);
      toast.success("Zgłoszenie zostało wysłane pomyślnie", {
        description: `ID zgłoszenia: ${data.data.id}`,
      });
      dispatch({ type: "reset-form" });
      if (screenshotInputRef.current) screenshotInputRef.current.value = "";
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";

      if (onSuccess) onSuccess();

      // Hide success message after 5 seconds
      setTimeout(
        () => dispatch({ type: "set-show-success", value: false }),
        5000,
      );
    },
    onError: (error) => {
      toast.error("Nie udało się wysłać zgłoszenia", {
        description: error.message,
      });
      // W przypadku błędu z serwera (np. za krótki opis), ustawiamy go jako błąd walidacji
      dispatch({ type: "set-validation-error", value: error.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: "set-validation-error", value: null });
    dispatch({ type: "set-show-success", value: false });

    if (!state.description.trim()) {
      dispatch({ type: "set-validation-error", value: "Opis jest wymagany." });
      return;
    }

    if (state.description.trim().length < 10) {
      dispatch({
        type: "set-validation-error",
        value: "Opis jest za krótki. Minimum 10 znaków.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("userDescription", state.description);
    if (state.screenshot) formData.append("screenshot", state.screenshot);
    if (state.attachment) formData.append("attachment", state.attachment);

    incidentMutation.mutate(formData);
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic client-side validation logic if needed (size, type)
      dispatch({ type: "set-screenshot", value: file });
    }
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic client-side validation logic if needed
      dispatch({ type: "set-attachment", value: file });
    }
  };

  return (
    <Card className="w-full max-w-2xl border-zinc-800 bg-zinc-900/50 shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl text-blue-400 flex items-center gap-2">
          <AlertCircle className="size-6" />
          Zgłoś Incydent
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Opisz dokładnie problem, dodaj zrzuty ekranu lub logi, abyśmy mogli szybciej zareagować.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.showSuccess && (
          <Alert className="mb-6 bg-green-500/10 border-green-500/50 text-green-400">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Sukces!</AlertTitle>
            <AlertDescription>
              Twoje zgłoszenie zostało wysłane pomyślnie. Zespół bezpieczeństwa wkrótce się nim zajmie.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-200">
              Opis problemu <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Opisz co się stało, jakie są objawy..."
              value={state.description}
              onChange={(e) => {
                dispatch({ type: "set-description", value: e.target.value });
                if (state.validationError) {
                  dispatch({ type: "set-validation-error", value: null });
                }
              }}
              className="min-h-[150px] border-zinc-700 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500"
            />
            {state.validationError && (
              <p className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="size-3" />
                {state.validationError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Screenshot Upload */}
            <div className="space-y-2">
              <Label htmlFor="screenshot" className="text-zinc-200">
                Zrzut ekranu (Opcjonalne)
              </Label>
              <div className="relative group cursor-pointer rounded-lg border-2 border-dashed border-zinc-700 p-4 transition-colors hover:border-blue-500/50 hover:bg-zinc-800/30">
                <input
                  type="file"
                  id="screenshot"
                  ref={screenshotInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleScreenshotChange}
                />
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  {state.screenshot ? (
                    <>
                      <div className="p-2 rounded-full bg-blue-500/20 text-blue-400">
                        <ImageIcon className="size-6" />
                      </div>
                      <span className="text-sm text-blue-300 font-medium truncate max-w-[200px]">
                        {state.screenshot.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 z-10"
                        onClick={(e) => {
                          e.preventDefault();
                          dispatch({ type: "set-screenshot", value: null });
                          if (screenshotInputRef.current) screenshotInputRef.current.value = "";
                        }}
                      >
                        <X className="mr-1 size-3" /> Usuń
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="size-8 text-zinc-500 transition-colors group-hover:text-blue-400" />
                      <div className="text-sm text-zinc-400">
                        <span className="font-medium text-blue-400">Kliknij</span> lub upuść
                        <br />
                        <span className="text-xs text-zinc-500">PNG, JPG, WebP (max 10MB)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Attachment Upload */}
            <div className="space-y-2">
              <Label htmlFor="attachment" className="text-zinc-200">
                Załącznik (Opcjonalne)
              </Label>
              <div className="relative group cursor-pointer rounded-lg border-2 border-dashed border-zinc-700 p-4 transition-colors hover:border-blue-500/50 hover:bg-zinc-800/30">
                <input
                  type="file"
                  id="attachment"
                  ref={attachmentInputRef}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleAttachmentChange}
                />
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  {state.attachment ? (
                    <>
                      <div className="p-2 rounded-full bg-blue-500/20 text-blue-400">
                        <FileText className="size-6" />
                      </div>
                      <span className="text-sm text-blue-300 font-medium truncate max-w-[200px]">
                        {state.attachment.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 z-10"
                        onClick={(e) => {
                          e.preventDefault();
                          dispatch({ type: "set-attachment", value: null });
                          if (attachmentInputRef.current) attachmentInputRef.current.value = "";
                        }}
                      >
                        <X className="mr-1 size-3" /> Usuń
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="size-8 text-zinc-500 transition-colors group-hover:text-blue-400" />
                      <div className="text-sm text-zinc-400">
                        <span className="font-medium text-blue-400">Kliknij</span> lub upuść
                        <br />
                        <span className="text-xs text-zinc-500">Dowolny plik (max 50MB)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-linear-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20"
            size="lg"
            disabled={incidentMutation.isPending}
          >
            {incidentMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Wysyłanie…
              </>
            ) : (
              <>
                <Send className="mr-2 size-5" />
                WYŚLIJ ZGŁOSZENIE
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
