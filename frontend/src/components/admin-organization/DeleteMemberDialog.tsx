import { memo } from "react";
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
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const DeleteMemberDialog = memo(function DeleteMemberDialog({
  memberToDelete,
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
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white">
            Anuluj
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="border-0 bg-red-600 text-white hover:bg-red-700"
          >
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
