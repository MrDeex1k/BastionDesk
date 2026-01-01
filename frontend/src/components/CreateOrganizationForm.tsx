import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Mail, KeyRound, User, ArrowLeft, Building2, Link2, Image as ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface CreateOrganizationFormProps {
  onBack: () => void;
  onRegisterSuccess: () => void;
}

export function CreateOrganizationForm({ onBack, onRegisterSuccess }: CreateOrganizationFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [fullNameError, setFullNameError] = useState("");
  const [orgNameError, setOrgNameError] = useState("");
  const [orgSlugError, setOrgSlugError] = useState("");

  const validateForm = () => {
    let isValid = true;

    // Email validation
    if (!email.includes("@")) {
      setEmailError("Adres email musi zawierać znak @");
      isValid = false;
    } else if (!email.trim()) {
      setEmailError("Adres email jest wymagany");
      isValid = false;
    } else {
      setEmailError("");
    }

    // Password validation
    if (password.length < 10) {
      setPasswordError("Hasło musi mieć co najmniej 10 znaków");
      isValid = false;
    } else if (!password.trim()) {
      setPasswordError("Hasło jest wymagane");
      isValid = false;
    } else {
      setPasswordError("");
    }

    // Name validation
    const nameParts = fullName.trim().split(/\s+/);
    if (nameParts.length < 2) {
      setFullNameError("Proszę podać imię i nazwisko (co najmniej dwa wyrazy)");
      isValid = false;
    } else if (!fullName.trim()) {
      setFullNameError("Imię i nazwisko jest wymagane");
      isValid = false;
    } else {
      setFullNameError("");
    }

    // Organization Name validation
    if (!orgName.trim()) {
      setOrgNameError("Nazwa organizacji jest wymagana");
      isValid = false;
    } else {
      setOrgNameError("");
    }

    // Organization Slug validation
    if (orgSlug.includes(" ")) {
      setOrgSlugError("Skrót organizacji nie może zawierać spacji");
      isValid = false;
    } else if (!orgSlug.trim()) {
      setOrgSlugError("Skrót organizacji jest wymagany");
      isValid = false;
    } else {
      setOrgSlugError("");
    }

    return isValid;
  };

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      // Niestandardowy endpoint Better-Auth: /api/auth/sign-up-with-organization/email
      const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3333";
      const response = await fetch(`${baseURL}/api/auth/sign-up-with-organization/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          name: fullName,
          organizationName: orgName,
          organizationSlug: orgSlug,
          organizationLogo: logoUrl || undefined,
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Błąd tworzenia organizacji");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Organizacja utworzona pomyślnie!");
      onRegisterSuccess();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      createOrgMutation.mutate();
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl bg-linear-to-br from-slate-800/90 to-slate-700/90 border-purple-900/50 p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-4">
            <Building2 className="size-12 text-purple-400" />
          </div>
          <h2 className="text-3xl mb-2 text-purple-300">
            Stwórz organizację
          </h2>
          <p className="text-slate-400">
            Zarejestruj się i utwórz nową przestrzeń dla swojego zespołu
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column - Personal Info */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2">Dane Administratora</h3>
              
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-300">
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
                    className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                    required
                    disabled={createOrgMutation.isPending}
                  />
                </div>
                {fullNameError && <p className="text-red-500 text-sm">{fullNameError}</p>}
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
                    className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                    required
                    disabled={createOrgMutation.isPending}
                  />
                </div>
                {emailError && <p className="text-red-500 text-sm">{emailError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">
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
                    className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                    required
                    disabled={createOrgMutation.isPending}
                  />
                </div>
                {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
              </div>
            </div>

            {/* Right Column - Organization Info */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2">Dane Organizacji</h3>
              
              <div className="space-y-2">
                <Label htmlFor="orgName" className="text-slate-300">
                  Nazwa organizacji
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                  <Input
                    id="orgName"
                    type="text"
                    placeholder="Moja Firma Sp. z o.o."
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                    required
                    disabled={createOrgMutation.isPending}
                  />
                </div>
                {orgNameError && <p className="text-red-500 text-sm">{orgNameError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgSlug" className="text-slate-300">
                  Skrót organizacji (ID)
                </Label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                  <Input
                    id="orgSlug"
                    type="text"
                    placeholder="moja-firma"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                    required
                    disabled={createOrgMutation.isPending}
                  />
                </div>
                {orgSlugError && <p className="text-red-500 text-sm">{orgSlugError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoUrl" className="text-slate-300">
                  URL Loga organizacji (Opcjonalne)
                </Label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                  <Input
                    id="logoUrl"
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-500/20"
                    disabled={createOrgMutation.isPending}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
              size="lg"
              disabled={createOrgMutation.isPending}
            >
              {createOrgMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Tworzenie organizacji...
                </>
              ) : (
                "Utwórz organizację"
              )}
            </Button>

            <Button
              type="button"
              onClick={onBack}
              variant="ghost"
              className="w-full mt-4 text-slate-400 hover:text-purple-400 hover:bg-slate-700/50"
              size="lg"
              disabled={createOrgMutation.isPending}
            >
              <ArrowLeft className="size-4 mr-2" />
              Powrót do strony głównej
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
