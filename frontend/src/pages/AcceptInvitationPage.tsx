import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";
import { useAuth } from "../hooks/useAuth";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "../components/ui/card";

/**
 * AcceptInvitationPage - Strona automatycznej akceptacji zaproszenia
 * 
 * Ta strona jest wywoływana po:
 * 1. Użytkownik kliknął link zaproszenia
 * 2. Zarejestrował się (signUp)
 * 3. Zweryfikował email (autoSignInAfterVerification zalogowało go automatycznie)
 * 4. Został przekierowany tutaj przez callbackURL
 * 
 * Workflow:
 * - Sprawdź czy użytkownik jest zalogowany
 * - Zaakceptuj zaproszenie (acceptInvitation)
 * - Ustaw organizację jako aktywną (setActive)
 * - Przekieruj do odpowiedniego dashboardu (AuthContext)
 */
export function AcceptInvitationPage() {
  const navigate = useNavigate();
  const { invitationId } = useParams<{ invitationId: string }>();
  const { session, role, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function acceptInvitation() {
      // Sprawdź czy mamy invitationId
      if (!invitationId) {
        // Sprawdź localStorage na wypadek gdyby URL param nie działał
        const storedInvitationId = localStorage.getItem('pending-invitation-id');
        if (!storedInvitationId) {
          setStatus("error");
          setErrorMessage("Brak ID zaproszenia");
          toast.error("Brak ID zaproszenia");
          setTimeout(() => navigate("/login"), 2000);
          return;
        }
      }

      // Poczekaj aż AuthContext załaduje sesję
      if (authLoading) {
        return;
      }

      // Sprawdź czy użytkownik jest zalogowany
      if (!session) {
        setStatus("error");
        setErrorMessage("Musisz być zalogowany aby zaakceptować zaproszenie");
        toast.error("Musisz być zalogowany aby zaakceptować zaproszenie");
        setTimeout(() => navigate("/login"), 2000);
        return;
      }

      try {
        const inviteId = invitationId || localStorage.getItem('pending-invitation-id') || '';

        // Krok 1: Akceptuj zaproszenie do organizacji
        const acceptResult = await authClient.organization.acceptInvitation({
          invitationId: inviteId,
        });

        if (!acceptResult.data) {
          throw new Error("Nie udało się zaakceptować zaproszenia");
        }

        // Krok 2: Ustaw organizację jako aktywną
        if (acceptResult.data?.invitation?.organizationId) {
          await authClient.organization.setActive({
            organizationId: acceptResult.data.invitation.organizationId,
          });
        }

        // Usuń zapisane invitationId z localStorage
        localStorage.removeItem('pending-invitation-id');

        setStatus("success");
        toast.success("Dołączyłeś do organizacji!");

        // Poczekaj na AuthContext aby zaktualizował rolę i przekierował
        // AuthContext automatycznie przekieruje użytkownika do odpowiedniego dashboardu
        // Na wypadek gdyby nie zadziałało, przekierujemy ręcznie po 2 sekundach
        setTimeout(() => {
          if (role) {
            switch (role) {
              case "admin":
                navigate("/admin-dashboard");
                break;
              case "analityk":
                navigate("/analyst-dashboard");
                break;
              case "pracownik":
                navigate("/employee-dashboard");
                break;
              default:
                navigate("/");
            }
          } else {
            // Jeśli rola nie jest jeszcze dostępna, poczekaj na AuthContext
            navigate("/");
          }
        }, 2000);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : "Wystąpił błąd podczas akceptacji zaproszenia";
        setStatus("error");
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        setTimeout(() => navigate("/login"), 3000);
      }
    }

    acceptInvitation();
  }, [invitationId, session, authLoading, navigate, role]);

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-8">
      <Card className="w-full max-w-md bg-linear-to-br from-slate-800/90 to-slate-700/90 border-cyan-900/50 p-8">
        <div className="flex flex-col items-center text-center space-y-6">
          {status === "loading" && (
            <>
              <Loader2 className="size-16 animate-spin text-cyan-400" />
              <div>
                <h2 className="text-2xl font-semibold text-cyan-300 mb-2">
                  Akceptowanie zaproszenia...
                </h2>
                <p className="text-slate-400">
                  Dodajemy Cię do organizacji
                </p>
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="size-16 text-green-400" />
              <div>
                <h2 className="text-2xl font-semibold text-green-300 mb-2">
                  Sukces!
                </h2>
                <p className="text-slate-400">
                  Dołączyłeś do organizacji. Przekierowujemy Cię do panelu...
                </p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="size-16 text-red-400" />
              <div>
                <h2 className="text-2xl font-semibold text-red-300 mb-2">
                  Błąd
                </h2>
                <p className="text-slate-400">
                  {errorMessage}
                </p>
                <p className="text-slate-500 text-sm mt-2">
                  Przekierowujemy Cię na stronę logowania...
                </p>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
