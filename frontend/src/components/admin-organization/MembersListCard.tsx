import { memo } from "react";
import {
  Check,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { OrganizationMember } from "@/ApiModel";
import { RoleBadge } from "./RoleBadge";

interface MembersListCardProps {
  members: OrganizationMember[];
  isLoadingMembers: boolean;
  onRefresh: () => void;
  onCopyUserId: (userId: string) => void;
  onUpdateRole: (memberId: string, role: string) => void;
  onDeleteMember: (member: OrganizationMember) => void;
}

const formatJoinedDate = (date: string) =>
  new Date(date).toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export const MembersListCard = memo(function MembersListCard({
  members,
  isLoadingMembers,
  onRefresh,
  onCopyUserId,
  onUpdateRole,
  onDeleteMember,
}: MembersListCardProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl text-zinc-100">
            <Users className="size-6 text-blue-400" />
            Lista członków
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Przegląd wszystkich użytkowników w organizacji.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isLoadingMembers}
          className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <RefreshCw
            className={`size-4 ${isLoadingMembers ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-zinc-800">
          <Table>
            <TableHeader className="bg-zinc-950/50">
              <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                <TableHead className="text-zinc-400">Użytkownik</TableHead>
                <TableHead className="text-zinc-400">Rola</TableHead>
                <TableHead className="text-zinc-400">
                  Data dołączenia
                </TableHead>
                <TableHead className="text-zinc-400">
                  ID Użytkownika
                </TableHead>
                <TableHead className="text-right text-zinc-400">
                  Akcje
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingMembers ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-zinc-500"
                  >
                    <Loader2 className="mx-auto mb-2 size-8 animate-spin" />
                    Pobieranie listy członków…
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-zinc-500"
                  >
                    Brak członków w organizacji (poza Tobą?)
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow
                    key={member.id}
                    className="border-zinc-800 hover:bg-zinc-800/30"
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-200">
                          {member.user.name || "Brak nazwy"}
                        </span>
                        <span className="text-sm text-zinc-500">
                          {member.user.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={member.role} />
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400">
                      {formatJoinedDate(member.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-600">
                      {member.userId}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="size-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                          >
                            <span className="sr-only">Otwórz menu</span>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="border-zinc-800 bg-zinc-900 text-zinc-200"
                        >
                          <DropdownMenuLabel>Akcje</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => onCopyUserId(member.userId)}
                            className="cursor-pointer focus:bg-zinc-800 focus:text-white"
                          >
                            <Copy className="mr-2 size-4" />
                            <span>Kopiuj ID użytkownika</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuLabel>Zmień rolę</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => onUpdateRole(member.id, "pracownik")}
                            className="cursor-pointer focus:bg-zinc-800 focus:text-white"
                            disabled={member.role === "pracownik"}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span>Pracownik</span>
                              {member.role === "pracownik" && (
                                <Check className="size-4 text-blue-500" />
                              )}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onUpdateRole(member.id, "analityk")}
                            className="cursor-pointer focus:bg-zinc-800 focus:text-white"
                            disabled={member.role === "analityk"}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span>Analityk</span>
                              {member.role === "analityk" && (
                                <Check className="size-4 text-blue-500" />
                              )}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onUpdateRole(member.id, "admin")}
                            className="cursor-pointer focus:bg-zinc-800 focus:text-white"
                            disabled={member.role === "admin"}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span>Administrator</span>
                              {member.role === "admin" && (
                                <Check className="size-4 text-blue-500" />
                              )}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem
                            onClick={() => onDeleteMember(member)}
                            className="cursor-pointer text-red-400 focus:bg-red-900/30 focus:text-red-400"
                          >
                            <Trash2 className="mr-2 size-4" />
                            <span>Usuń z organizacji</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
});
