import { memo } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import type { OrganizationMember } from "@/ApiModel";

interface DeleteMemberDialogProps {
  memberToDelete: OrganizationMember | null;
  errorMessage: string | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const DeleteMemberDialog = memo(function DeleteMemberDialog({
  memberToDelete,
  errorMessage,
  isPending,
  onOpenChange,
  onConfirm,
}: DeleteMemberDialogProps) {
  return (
    <AlertDialog open={!!memberToDelete} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle>Czy na pewno chcesz usunąć tego użytkownika?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Użytkownik{" "}
            <span className="font-medium text-zinc-200">{memberToDelete?.user.name}</span> (
            {memberToDelete?.user.email}) straci dostęp do organizacji. Tej operacji nie można
            cofnąć.
          </AlertDialogDescription>
          {errorMessage && (
            <p role="alert" className="text-sm text-red-400">
              {errorMessage}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isPending}
            className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            Anuluj
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
            className="border-0 bg-red-600 text-white hover:bg-red-700"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isPending ? "Usuwanie…" : "Usuń"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
