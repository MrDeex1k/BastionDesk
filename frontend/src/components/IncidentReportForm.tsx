import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Upload, X, CheckCircle2, FileText, Image as ImageIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

interface IncidentReportFormProps {
  onSuccess?: () => void;
}

export function IncidentReportForm({ onSuccess }: IncidentReportFormProps) {
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const incidentMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Wystąpił błąd podczas wysyłania zgłoszenia');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setShowSuccess(true);
      toast.success("Zgłoszenie zostało wysłane pomyślnie", {
        description: `ID zgłoszenia: ${data.data.id}`
      });
      setDescription("");
      setScreenshot(null);
      setAttachment(null);
      if (screenshotInputRef.current) screenshotInputRef.current.value = "";
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      
      if (onSuccess) onSuccess();

      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    },
    onError: (error) => {
      console.error("Failed to submit incident", error);
      toast.error("Nie udało się wysłać zgłoszenia", {
        description: error.message
      });
      // W przypadku błędu z serwera (np. za krótki opis), ustawiamy go jako błąd walidacji
      setValidationError(error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setShowSuccess(false);

    if (!description.trim()) {
      setValidationError("Opis jest wymagany.");
      return;
    }

    if (description.trim().length < 10) {
      setValidationError("Opis jest za krótki. Minimum 10 znaków.");
      return;
    }

    const formData = new FormData();
    formData.append("userDescription", description);
    if (screenshot) formData.append("screenshot", screenshot);
    if (attachment) formData.append("attachment", attachment);

    incidentMutation.mutate(formData);
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic client-side validation logic if needed (size, type)
      setScreenshot(file);
    }
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic client-side validation logic if needed
      setAttachment(file);
    }
  };

  return (
    <Card className="w-full max-w-2xl bg-slate-900/50 border-slate-800 shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl text-blue-400 flex items-center gap-2">
          <AlertCircle className="h-6 w-6" />
          Zgłoś Incydent
        </CardTitle>
        <CardDescription className="text-slate-400">
          Opisz dokładnie problem, dodaj zrzuty ekranu lub logi, abyśmy mogli szybciej zareagować.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {showSuccess && (
          <Alert className="mb-6 bg-green-500/10 border-green-500/50 text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Sukces!</AlertTitle>
            <AlertDescription>
              Twoje zgłoszenie zostało wysłane pomyślnie. Zespół bezpieczeństwa wkrótce się nim zajmie.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-200">
              Opis problemu <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Opisz co się stało, jakie są objawy..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (validationError) setValidationError(null);
              }}
              className="min-h-[150px] bg-slate-950/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500"
            />
            {validationError && (
              <p className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Screenshot Upload */}
            <div className="space-y-2">
              <Label htmlFor="screenshot" className="text-slate-200">
                Zrzut ekranu (Opcjonalne)
              </Label>
              <div className="relative group cursor-pointer border-2 border-dashed border-slate-700 rounded-lg p-4 hover:border-blue-500/50 hover:bg-slate-800/30 transition-colors">
                <input
                  type="file"
                  id="screenshot"
                  ref={screenshotInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleScreenshotChange}
                />
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  {screenshot ? (
                    <>
                      <div className="p-2 rounded-full bg-blue-500/20 text-blue-400">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                      <span className="text-sm text-blue-300 font-medium truncate max-w-[200px]">
                        {screenshot.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 z-10"
                        onClick={(e) => {
                          e.preventDefault();
                          setScreenshot(null);
                          if (screenshotInputRef.current) screenshotInputRef.current.value = "";
                        }}
                      >
                        <X className="h-3 w-3 mr-1" /> Usuń
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-slate-500 group-hover:text-blue-400 transition-colors" />
                      <div className="text-sm text-slate-400">
                        <span className="font-medium text-blue-400">Kliknij</span> lub upuść
                        <br />
                        <span className="text-xs text-slate-500">PNG, JPG, WebP (max 10MB)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Attachment Upload */}
            <div className="space-y-2">
              <Label htmlFor="attachment" className="text-slate-200">
                Załącznik (Opcjonalne)
              </Label>
              <div className="relative group cursor-pointer border-2 border-dashed border-slate-700 rounded-lg p-4 hover:border-blue-500/50 hover:bg-slate-800/30 transition-colors">
                <input
                  type="file"
                  id="attachment"
                  ref={attachmentInputRef}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleAttachmentChange}
                />
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  {attachment ? (
                    <>
                      <div className="p-2 rounded-full bg-blue-500/20 text-blue-400">
                        <FileText className="h-6 w-6" />
                      </div>
                      <span className="text-sm text-blue-300 font-medium truncate max-w-[200px]">
                        {attachment.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 z-10"
                        onClick={(e) => {
                          e.preventDefault();
                          setAttachment(null);
                          if (attachmentInputRef.current) attachmentInputRef.current.value = "";
                        }}
                      >
                        <X className="h-3 w-3 mr-1" /> Usuń
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-slate-500 group-hover:text-blue-400 transition-colors" />
                      <div className="text-sm text-slate-400">
                        <span className="font-medium text-blue-400">Kliknij</span> lub upuść
                        <br />
                        <span className="text-xs text-slate-500">PDF, ZIP, TXT, CSV (max 50MB)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20"
            size="lg"
            disabled={incidentMutation.isPending}
          >
            {incidentMutation.isPending ? (
              <>
                Wysyłanie...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                WYŚLIJ ZGŁOSZENIE
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
