import { memo } from "react";
import { BarChart, Loader2, Mail, Shield, User, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface AddMemberCardProps {
  email: string;
  role: string;
  isLoadingAdd: boolean;
  onEmailChange: (email: string) => void;
  onRoleChange: (role: string) => void;
  onAdd: () => void;
}

export const AddMemberCard = memo(function AddMemberCard({
  email,
  role,
  isLoadingAdd,
  onEmailChange,
  onRoleChange,
  onAdd,
}: AddMemberCardProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-zinc-100">
          <UserPlus className="size-6 text-violet-400" />
          Dodaj członka zespołu
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Zaproś nowego użytkownika wysyłając email lub dodaj istniejącego użytkownika bezpośrednio
          do organizacji.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-200">
                Adres e-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="email"
                  placeholder="jan.kowalski@firma.pl"
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  className="border-zinc-700 bg-zinc-950 pl-9 text-white placeholder:text-zinc-600 focus:border-violet-500"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-zinc-200">
                Rola w organizacji
              </Label>
              <Select value={role} onValueChange={onRoleChange}>
                <SelectTrigger className="border-zinc-700 bg-zinc-950 text-white focus:ring-violet-500/20">
                  <SelectValue placeholder="Wybierz rolę" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900 text-white">
                  <SelectItem value="pracownik" className="focus:bg-zinc-800 focus:text-white">
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-blue-400" />
                      <span>Pracownik</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="analityk" className="focus:bg-zinc-800 focus:text-white">
                    <div className="flex items-center gap-2">
                      <BarChart className="size-4 text-yellow-400" />
                      <span>Analityk</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin" className="focus:bg-zinc-800 focus:text-white">
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 text-red-400" />
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
              className="w-full border-0 bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700"
              onClick={onAdd}
              disabled={isLoadingAdd}
            >
              {isLoadingAdd ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 size-4" />
              )}
              Dodaj istniejącego
            </Button>
          </div>
          <p className="text-center text-xs text-zinc-500">
            Dodaj istniejącego użytkownika do organizacji. Użytkownik musi już mieć konto w
            systemie.
          </p>
        </div>
      </CardContent>
    </Card>
  );
});
