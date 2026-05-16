import { Key, Loader2, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface PasswordChangeSectionProps {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  isLoading: boolean;
  onOldPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export function PasswordChangeSection({
  oldPassword,
  newPassword,
  confirmPassword,
  isLoading,
  onOldPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: PasswordChangeSectionProps) {
  return (
    <Card className="border-zinc-700 bg-zinc-900 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
          <Key className="size-5 text-blue-400" />
          Zmiana hasła
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Pamiętaj o używaniu silnego i unikalnego hasła.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-zinc-200">
              Obecne hasło
            </Label>
            <Input
              id="current-password"
              type="password"
              value={oldPassword}
              onChange={(event) => onOldPasswordChange(event.target.value)}
              className="border-zinc-600 bg-zinc-950 text-white focus-visible:border-blue-500 focus-visible:ring-blue-500/50"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-zinc-200">
                Nowe hasło
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => onNewPasswordChange(event.target.value)}
                className="border-zinc-600 bg-zinc-950 text-white focus-visible:border-blue-500 focus-visible:ring-blue-500/50"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-zinc-200">
                Potwierdź nowe hasło
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  onConfirmPasswordChange(event.target.value)
                }
                className="border-zinc-600 bg-zinc-950 text-white focus-visible:border-blue-500 focus-visible:ring-blue-500/50"
                required
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              className="bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Lock className="mr-2 size-4" />
              )}
              Zmień hasło
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
