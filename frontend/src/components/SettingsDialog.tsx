import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { toast } from "sonner";
import {
  Settings,
  Key,
  Lock,
  Trash2,
  Fingerprint,
  Loader2,
  Plus,
} from "lucide-react";

interface PassKey {
  id: string;
  name: string;
  createdAt: string;
}

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Password Change State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // PassKeys State
  const [passKeys, setPassKeys] = useState<PassKey[]>([]);
  const [isLoadingPassKeys, setIsLoadingPassKeys] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPassKeys();
    }
  }, [isOpen]);

  const fetchPassKeys = async () => {
    setIsLoadingPassKeys(true);
    try {
      const response = await fetch('/api/auth/passkey/list-user-passkeys');
      if (response.ok) {
        const data = await response.json();
        setPassKeys(data.passkeys || []);
      } else {
        console.error("Failed to list passkeys");
      }
    } catch (error) {
      console.error("Error fetching passkeys:", error);
    } finally {
      setIsLoadingPassKeys(false);
    }
  };

  const handleAddPassKey = async () => {
    setIsLoadingPassKeys(true);
    try {
        const newKeyName = `Klucz ${new Date().toLocaleDateString('pl-PL')} ${new Date().toLocaleTimeString('pl-PL')}`;
        
        // Krok 1: Inicjacja rejestracji (pobranie challenge)
        const response = await fetch('/api/auth/passkey/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newKeyName
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log("PassKey Register Challenge:", data);

            // Krok 2: Symulacja interakcji WebAuthn (navigator.credentials.create)
            // W prawdziwej implementacji tutaj nastąpiłoby wywołanie API przeglądarki
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Krok 3: Weryfikacja (Wysłanie podpisanego challenge do backendu)
            // Ponieważ w tym kroku demo nie mamy pełnego backendu WebAuthn,
            // uznajemy proces za zakończony sukcesem po stronie klienta.
            
            toast.success("Klucz PassKey został zarejestrowany");
            fetchPassKeys();
        } else {
            toast.error("Nie udało się rozpocząć dodawania klucza");
        }
    } catch {
        toast.error("Wystąpił błąd połączenia");
    } finally {
        setIsLoadingPassKeys(false);
    }
  };

  const handleDeletePassKey = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten klucz?")) return;
    
    setIsLoadingPassKeys(true);
    try {
        const response = await fetch('/api/auth/passkey/delete-passkey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        if (response.ok) {
            toast.success("Klucz PassKey został usunięty");
            fetchPassKeys();
        } else {
            toast.error("Nie udało się usunąć klucza");
        }
    } catch {
        toast.error("Wystąpił błąd podczas usuwania klucza");
    } finally {
        setIsLoadingPassKeys(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Nowe hasła nie są identyczne");
      return;
    }

    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsLoading(false);

    toast.success("Hasło zostało zmienione pomyślnie");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        "Czy na pewno chcesz usunąć swoje konto? Ta operacja jest nieodwracalna.",
      )
    ) {
      return;
    }

    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsLoading(false);

    toast.error("Konto zostało usunięte (Symulacja)");
    setIsOpen(false);
    // In real app: logout and redirect
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-400 hover:text-white hover:bg-white/5"
        >
          <Settings className="h-5 w-5" />
          <span className="sr-only">Ustawienia</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-slate-950 border-slate-700 text-slate-100 shadow-2xl shadow-black/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Settings className="h-5 w-5 text-blue-400" />
            Ustawienia konta
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Zarządzaj bezpieczeństwem i preferencjami swojego
            konta.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="security" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900 border border-slate-700">
            <TabsTrigger
              value="security"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400"
            >
              <ShieldIcon className="h-4 w-4 mr-2" />
              Bezpieczeństwo
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Usunięcie konta
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="security"
            className="space-y-4 mt-4"
          >
            {/* PassKeys Section */}
            <Card className="bg-slate-900 border-slate-700 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                        <Fingerprint className="h-5 w-5 text-purple-400" />
                        PassKeys
                        </CardTitle>
                        <CardDescription className="text-slate-400 mt-1">
                        Zarządzaj kluczami sprzętowymi i biometrią.
                        </CardDescription>
                    </div>
                    <Button 
                        onClick={handleAddPassKey} 
                        disabled={isLoadingPassKeys}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {isLoadingPassKeys ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Dodaj klucz
                            </>
                        )}
                    </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                    {passKeys.length > 0 ? (
                        passKeys.map((pk) => (
                            <div key={pk.id} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-500/10 rounded-full">
                                        <Fingerprint className="h-4 w-4 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-200">{pk.name}</p>
                                        <p className="text-xs text-slate-500">
                                            Dodano: {new Date(pk.createdAt).toLocaleDateString('pl-PL')}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-slate-400 hover:text-red-400 hover:bg-red-950/30"
                                  onClick={() => handleDeletePassKey(pk.id)}
                                  disabled={isLoadingPassKeys}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-6 text-slate-500 bg-slate-950/50 rounded-lg border border-slate-800 border-dashed">
                            {isLoadingPassKeys ? (
                                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                            ) : (
                                <>
                                    <Fingerprint className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>Brak skonfigurowanych kluczy PassKey</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* Change Password Section */}
            <Card className="bg-slate-900 border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                  <Key className="h-5 w-5 text-blue-400" />
                  Zmiana hasła
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Pamiętaj o używaniu silnego i unikalnego
                  hasła.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleChangePassword}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label
                      htmlFor="current-password"
                      className="text-slate-200"
                    >
                      Obecne hasło
                    </Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={oldPassword}
                      onChange={(e) =>
                        setOldPassword(e.target.value)
                      }
                      className="bg-slate-950 border-slate-600 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 text-white"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="new-password"
                        className="text-slate-200"
                      >
                        Nowe hasło
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) =>
                          setNewPassword(e.target.value)
                        }
                        className="bg-slate-950 border-slate-600 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 text-white"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="confirm-password"
                        className="text-slate-200"
                      >
                        Potwierdź nowe hasło
                      </Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(e.target.value)
                        }
                        className="bg-slate-950 border-slate-600 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 text-white"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Lock className="h-4 w-4 mr-2" />
                      )}
                      Zmień hasło
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="danger" className="mt-4">
            <Card className="bg-red-950/20 border-red-900/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-red-400 flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  Usuwanie konta
                </CardTitle>
                <CardDescription className="text-red-300/60">
                  Ta operacja jest nieodwracalna. Wszystkie
                  Twoje dane zostaną trwale usunięte po 30
                  dniach.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-red-950/40 p-4 rounded-lg border border-red-900/40 text-sm text-red-200 mb-4 shadow-inner">
                  <p>Co zostanie usunięte:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-red-200/80">
                    <li>Twoje dane profilowe</li>
                    <li>
                      Historia Twoich zgłoszeń (anonimizacja)
                    </li>
                    <li>Wszystkie ustawienia personalne</li>
                  </ul>
                </div>
                <Button
                  variant="destructive"
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleDeleteAccount}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Usuń konto trwale
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}
