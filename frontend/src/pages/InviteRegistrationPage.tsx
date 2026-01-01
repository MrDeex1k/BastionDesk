import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import {
  UserPlus,
  Mail,
  KeyRound,
  User,
  Loader2,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";

export function InviteRegistrationPage() {
  const navigate = useNavigate();
  const { invitationId } = useParams<{ invitationId: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [fullNameError, setFullNameError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const orgName = "Organizacja";

  useEffect(() => {
    if (!invitationId) {
      toast.error("Brak ID zaproszenia");
      navigate("/login");
    }
  }, [invitationId, navigate]);

  const validateForm = () => {
    let isValid = true;

    if (!email.includes("@")) {
      setEmailError("Adres email musi zawierać znak @");
      isValid = false;
    } else if (!email.trim()) {
      setEmailError("Adres email jest wymagany");
      isValid = false;
    } else {
      setEmailError("");
    }

    if (password.length < 10) {
      setPasswordError("Hasło musi mieć co najmniej 10 znaków");
      isValid = false;
    } else if (!password.trim()) {
      setPasswordError("Hasło jest wymagane");
      isValid = false;
    } else {
      setPasswordError("");
    }

    const nameParts = fullName.trim().split(/\s+/);
    if (nameParts.length < 2) {
      setFullNameError(
        "Proszę podać imię i nazwisko (co najmniej dwa wyrazy)",
      );
      isValid = false;
    } else if (!fullName.trim()) {
      setFullNameError("Imię i nazwisko jest wymagane");
      isValid = false;
    } else {
      setFullNameError("");
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !invitationId) return;

    setIsLoading(true);

    try {
      // Krok 1: Rejestracja użytkownika
      const signUpResult = await authClient.signUp.email({
        email,
        password,
        name: fullName,
      });

      if (!signUpResult.data) {
        throw new Error("Nie udało się utworzyć konta");
      }

      // Krok 2: Akceptacja zaproszenia do organizacji
      await authClient.organization.acceptInvitation({
        invitationId: invitationId,
      });

      toast.success(`Konto utworzone! Dołączyłeś do organizacji ${orgName}`);
      navigate("/login");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Wystąpił błąd podczas rejestracji";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md bg-linear-to-br from-slate-800/90 to-slate-700/90 border-cyan-900/50 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-4 relative">
            <UserPlus className="size-12 text-cyan-400" />
            <div className="absolute -bottom-2 -right-2 bg-slate-900 p-1 rounded-full border border-cyan-500/30">
              <Building2 className="size-5 text-purple-400" />
            </div>
          </div>
          <h2 className="text-3xl mb-2 text-cyan-300">
            Dołącz do {orgName}
          </h2>
          <p className="text-slate-400">
            Wypełnij formularz, aby utworzyć konto i dołączyć do
            organizacji
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="fullName"
              className="text-slate-300"
            >
              Imię i nazwisko
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="fullName"
                type="text"
                placeholder="Jan Kowalski"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={isLoading}
              />
            </div>
            {fullNameError && (
              <p className="text-red-500 text-sm">
                {fullNameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              Adres e-mail
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="twoj@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={isLoading}
              />
            </div>
            {emailError && (
              <p className="text-red-500 text-sm">
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-slate-300"
            >
              Hasło
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                required
                disabled={isLoading}
              />
            </div>
            {passwordError && (
              <p className="text-red-500 text-sm">
                {passwordError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tworzenie konta...
              </>
            ) : (
              "Dołącz do organizacji"
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}