import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface UploadFileDialogProps {
  open: boolean;
  uploadType: "report" | "statement" | null;
  selectedFile: File | null;
  isUploading: boolean;
  onOpenChange: (open: boolean) => void;
  onFileChange: (file: File | null) => void;
  onUpload: () => void;
}

export function UploadFileDialog({
  open,
  uploadType,
  selectedFile,
  isUploading,
  onOpenChange,
  onFileChange,
  onUpload,
}: UploadFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
        <DialogHeader>
          <DialogTitle>
            {uploadType === "report"
              ? "Prześlij raport analityka"
              : "Prześlij sprawozdanie końcowe"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {uploadType === "report"
              ? "Wybierz plik raportu PDF, aby zakończyć etap analizy."
              : "Wybierz plik sprawozdania (DOCX/PDF), aby zakończyć zgłoszenie."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid w-full max-w-sm items-center gap-1.5 py-4">
          <Label htmlFor="file-upload">Plik</Label>
          <Input
            id="file-upload"
            type="file"
            className="cursor-pointer border-zinc-800 bg-zinc-950 text-zinc-300 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-zinc-200 hover:file:bg-zinc-700"
            onChange={(event) => onFileChange(event.target.files?.[0] || null)}
          />
          {selectedFile && (
            <p className="mt-2 text-xs text-zinc-500">
              Wybrano: {selectedFile.name} (
              {(selectedFile.size / 1024).toFixed(2)} KB)
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Anuluj
          </Button>
          <Button
            onClick={onUpload}
            disabled={!selectedFile || isUploading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isUploading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {uploadType === "report" ? "Wyślij raport" : "Wyślij sprawozdanie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
