import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { toast } from "sonner";
import {
  Mail,
  UserPlus,
  Loader2,
  Shield,
  User,
  BarChart,
  Users,
  RefreshCw,
  MoreHorizontal,
  Check,
  Copy,
  Trash2,
} from "lucide-react";

interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

interface MembersResponse {
  members: Member[];
  total: number;
  limit: number;
  offset: number;
}

const MOCK_MEMBERS: Member[] = [
  {
    id: "member_1",
    userId: "user_89234",
    organizationId: "org_1",
    role: "admin",
    createdAt: "2023-11-15T10:00:00.000Z",
    user: {
      id: "user_89234",
      email: "adam.nowak@bastion.pl",
      name: "Adam Nowak",
      emailVerified: true,
      createdAt: "2023-11-01T10:00:00.000Z",
      updatedAt: "2023-11-15T10:00:00.000Z",
    },
  },
  {
    id: "member_2",
    userId: "user_23452",
    organizationId: "org_1",
    role: "analityk",
    createdAt: "2024-01-20T14:30:00.000Z",
    user: {
      id: "user_23452",
      email: "katarzyna.kowalska@bastion.pl",
      name: "Katarzyna Kowalska",
      emailVerified: true,
      createdAt: "2024-01-10T09:00:00.000Z",
      updatedAt: "2024-01-20T14:30:00.000Z",
    },
  },
  {
    id: "member_3",
    userId: "user_87654",
    organizationId: "org_1",
    role: "pracownik",
    createdAt: "2024-02-05T08:15:00.000Z",
    user: {
      id: "user_87654",
      email: "tomasz.wisniewski@bastion.pl",
      name: "Tomasz Wiśniewski",
      emailVerified: true,
      createdAt: "2024-02-01T11:20:00.000Z",
      updatedAt: "2024-02-05T08:15:00.000Z",
    },
  },
  {
    id: "member_4",
    userId: "user_12345",
    organizationId: "org_1",
    role: "pracownik",
    createdAt: "2024-03-12T16:45:00.000Z",
    user: {
      id: "user_12345",
      email: "anna.zielinska@bastion.pl",
      name: "Anna Zielińska",
      emailVerified: true,
      createdAt: "2024-03-10T13:00:00.000Z",
      updatedAt: "2024-03-12T16:45:00.000Z",
    },
  },
  {
    id: "member_5",
    userId: "user_54321",
    organizationId: "org_1",
    role: "analityk",
    createdAt: "2024-03-15T09:30:00.000Z",
    user: {
      id: "user_54321",
      email: "piotr.mazur@bastion.pl",
      name: "Piotr Mazur",
      emailVerified: true,
      createdAt: "2024-03-14T08:00:00.000Z",
      updatedAt: "2024-03-15T09:30:00.000Z",
    },
  },
];

export function AdminOrganizationManagement() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("pracownik");
  const [isLoadingAdd, setIsLoadingAdd] = useState(false);

  // Members list state
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  // Delete member state
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  const fetchMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const response = await fetch(
        "/api/auth/organization/list-members?limit=100&sortBy=createdAt&sortDirection=desc",
        { credentials: 'include' }
      );
      if (response.ok) {
        const data: MembersResponse = await response.json();
        // If API returns data, use it. If empty, use mock data for demo purposes if desired.
        // For now, if array is empty, we fall back to mock data to show the UI
        if (data.members && data.members.length > 0) {
          setMembers(data.members);
        } else {
          setMembers(MOCK_MEMBERS);
        }
      } else {
        // Fallback to mock data on error (for demo)
        setMembers(MOCK_MEMBERS);
      }
    } catch {
      // Fallback to mock data on network error (for demo)
      setMembers(MOCK_MEMBERS);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleAddDirectly = async () => {
    if (!email) {
      toast.error("Wprowadź adres email");
      return;
    }

    setIsLoadingAdd(true);
    try {
      const response = await fetch(
        "/api/auth/organization/add-member-by-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role }),
          credentials: 'include',
        },
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `Użytkownik ${email} został dodany do organizacji`,
        );
        setEmail("");
        fetchMembers(); // Refresh list
      } else {
        if (data.error) {
          if (data.error.code === "USER_NOT_FOUND") {
            toast.error(
              "Użytkownik o podanym adresie email nie istnieje w systemie",
            );
          } else if (data.error.code === "ALREADY_MEMBER") {
            toast.error("Użytkownik jest już członkiem tej organizacji");
          } else {
            toast.error(
              data.error.message ||
                "Wystąpił błąd podczas dodawania użytkownika",
            );
          }
        } else {
          toast.error("Nie udało się dodać użytkownika.");
        }
      }
    } catch {
      toast.error("Wystąpił błąd podczas komunikacji z serwerem");
    } finally {
      setIsLoadingAdd(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    // If using mock data, just update local state
    if (members.some(m => MOCK_MEMBERS.find(mock => mock.id === m.id))) {
        setMembers(members.map(m => m.id === memberId ? { ...m, role: newRole } : m));
        toast.success("Rola została zaktualizowana (Mock)");
        return;
    }

    const loadingToast = toast.loading("Aktualizowanie roli...");

    try {
      const response = await fetch(
        "/api/auth/organization/update-member-role",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId, role: newRole }),
          credentials: 'include',
        },
      );

      if (response.ok) {
        toast.success("Rola została zaktualizowana", { id: loadingToast });
        fetchMembers();
      } else {
        const data = await response.json();
        toast.error(
          data.error?.message || "Nie udało się zmienić roli",
          { id: loadingToast },
        );
      }
    } catch {
      toast.error("Błąd połączenia z serwerem", { id: loadingToast });
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToDelete) return;

    // If deleting a mock member, just update local state
    if (MOCK_MEMBERS.find(mock => mock.id === memberToDelete.id)) {
        setMembers(members.filter(m => m.id !== memberToDelete.id));
        toast.success("Członek został usunięty z organizacji (Mock)");
        setMemberToDelete(null);
        return;
    }

    const loadingToast = toast.loading("Usuwanie członka...");

    try {
      const response = await fetch('/api/auth/organization/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIdOrEmail: memberToDelete.id }),
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Członek został usunięty z organizacji", { id: loadingToast });
        setMemberToDelete(null); // Close dialog
        fetchMembers(); // Refresh list
      } else {
        toast.error(data.message || "Nie udało się usunąć członka", { id: loadingToast });
      }
    } catch {
      toast.error("Błąd połączenia z serwerem", { id: loadingToast });
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return (
          <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/50">
            Administrator
          </Badge>
        );
      case "analityk":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border-yellow-500/50">
            Analityk
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/50">
            Pracownik
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Add Member Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-xl text-slate-100 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-purple-400" />
            Dodaj członka zespołu
          </CardTitle>
          <CardDescription className="text-slate-400">
            Zaproś nowego użytkownika wysyłając email lub dodaj
            istniejącego użytkownika bezpośrednio do organizacji.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">
                  Adres e-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    placeholder="jan.kowalski@firma.pl"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 focus:border-purple-500"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role" className="text-slate-200">
                  Rola w organizacji
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-white focus:ring-purple-500/20">
                    <SelectValue placeholder="Wybierz rolę" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem
                      value="pracownik"
                      className="focus:bg-slate-800 focus:text-white"
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-400" />
                        <span>Pracownik</span>
                      </div>
                    </SelectItem>
                    <SelectItem
                      value="analityk"
                      className="focus:bg-slate-800 focus:text-white"
                    >
                      <div className="flex items-center gap-2">
                        <BarChart className="h-4 w-4 text-yellow-400" />
                        <span>Analityk</span>
                      </div>
                    </SelectItem>
                    <SelectItem
                      value="admin"
                      className="focus:bg-slate-800 focus:text-white"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-red-400" />
                        <span>Administrator</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 border-0"
                onClick={handleAddDirectly}
                disabled={isLoadingAdd}
              >
                {isLoadingAdd ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Dodaj istniejącego
              </Button>
            </div>
            <p className="text-xs text-slate-500 text-center">
              Dodaj istniejącego użytkownika do organizacji. Użytkownik musi już mieć konto w systemie.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Members List Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl text-slate-100 flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-400" />
              Lista członków
            </CardTitle>
            <CardDescription className="text-slate-400">
              Przegląd wszystkich użytkowników w organizacji.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchMembers}
            disabled={isLoadingMembers}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoadingMembers ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-800">
            <Table>
              <TableHeader className="bg-slate-950/50">
                <TableRow className="border-slate-800 hover:bg-slate-900/50">
                  <TableHead className="text-slate-400">
                    Użytkownik
                  </TableHead>
                  <TableHead className="text-slate-400">Rola</TableHead>
                  <TableHead className="text-slate-400">
                    Data dołączenia
                  </TableHead>
                  <TableHead className="text-slate-400">
                    ID Użytkownika
                  </TableHead>
                  <TableHead className="text-slate-400 text-right">
                    Akcje
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingMembers ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-slate-500"
                    >
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      Pobieranie listy członków...
                    </TableCell>
                  </TableRow>
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-slate-500"
                    >
                      Brak członków w organizacji (poza Tobą?)
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => (
                    <TableRow
                      key={member.id}
                      className="border-slate-800 hover:bg-slate-800/30"
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-slate-200 font-medium">
                            {member.user.name || "Brak nazwy"}
                          </span>
                          <span className="text-slate-500 text-sm">
                            {member.user.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(member.role)}</TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {new Date(member.createdAt).toLocaleDateString(
                          "pl-PL",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {member.userId}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                              <span className="sr-only">Otwórz menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-slate-900 border-slate-800 text-slate-200"
                          >
                            <DropdownMenuLabel>Akcje</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  member.userId,
                                );
                                toast.success(
                                  "Skopiowano ID użytkownika",
                                );
                              }}
                              className="focus:bg-slate-800 focus:text-white cursor-pointer"
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              <span>Kopiuj ID Usera</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuLabel>
                              Zmień rolę
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateRole(member.id, "pracownik")
                              }
                              className="focus:bg-slate-800 focus:text-white cursor-pointer"
                              disabled={member.role === "pracownik"}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>Pracownik</span>
                                {member.role === "pracownik" && (
                                  <Check className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateRole(member.id, "analityk")
                              }
                              className="focus:bg-slate-800 focus:text-white cursor-pointer"
                              disabled={member.role === "analityk"}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>Analityk</span>
                                {member.role === "analityk" && (
                                  <Check className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateRole(member.id, "admin")
                              }
                              className="focus:bg-slate-800 focus:text-white cursor-pointer"
                              disabled={member.role === "admin"}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>Administrator</span>
                                {member.role === "admin" && (
                                  <Check className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuItem
                              onClick={() => setMemberToDelete(member)}
                              className="focus:bg-red-900/30 focus:text-red-400 text-red-400 cursor-pointer"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
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

      <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć tego użytkownika?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Użytkownik <span className="text-slate-200 font-medium">{memberToDelete?.user.name}</span> ({memberToDelete?.user.email}) straci dostęp do organizacji.
              Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-red-600 hover:bg-red-700 text-white border-0">Usuń</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
