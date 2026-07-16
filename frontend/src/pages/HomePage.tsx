import { Shield, Users, Building2, AlertTriangle, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <>
      <div className="mx-auto mb-16 max-w-4xl text-center">
        <h2 className="mb-6 text-5xl tracking-tight text-zinc-100">Witaj w BastionDesk</h2>

        <p className="mb-4 text-xl text-zinc-300">
          Profesjonalny system zgłaszania i zarządzania incydentami bezpieczeństwa
        </p>

        <p className="mx-auto max-w-2xl text-zinc-400">
          Chronimy Twoją organizację poprzez szybkie reagowanie na zagrożenia. Zgłaszaj incydenty,
          śledź postępy i współpracuj z zespołem bezpieczeństwa w czasie rzeczywistym.
        </p>
      </div>

      {/* Action Cards */}
      <div className="mx-auto mb-16 grid max-w-5xl gap-6 md:grid-cols-3">
        <Card className="border-zinc-800 bg-linear-to-br from-zinc-900/95 to-zinc-800/85 p-6 transition-all duration-300 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10">
          <div className="flex h-full flex-col items-center gap-4 text-center">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <Lock className="size-8 text-blue-400" />
            </div>
            <div>
              <h3 className="mb-2 text-xl text-blue-200">Zaloguj się</h3>
              <p className="mb-6 text-sm text-zinc-400">
                Masz już konto? Zaloguj się i uzyskaj dostęp do swojego panelu.
              </p>
            </div>
            <Button
              onClick={() => navigate("/login")}
              className="mt-auto w-full bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700"
              size="lg"
            >
              Zaloguj się
            </Button>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-linear-to-br from-zinc-900/95 to-zinc-800/85 p-6 transition-all duration-300 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10">
          <div className="flex h-full flex-col items-center gap-4 text-center">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <Users className="size-8 text-cyan-400" />
            </div>
            <div>
              <h3 className="mb-2 text-xl text-cyan-200">Dołącz do nas</h3>
              <p className="mb-6 text-sm text-zinc-400">
                Stwórz konto, a następnie dołącz do organizacji
              </p>
            </div>
            <Button
              onClick={() => navigate("/register")}
              className="mt-auto w-full bg-cyan-600 text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-700"
              size="lg"
            >
              Dołącz do nas
            </Button>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-linear-to-br from-zinc-900/95 to-zinc-800/85 p-6 transition-all duration-300 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10">
          <div className="flex h-full flex-col items-center gap-4 text-center">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <Building2 className="size-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="mb-2 text-xl text-emerald-200">Stwórz organizację</h3>
              <p className="mb-6 text-sm text-zinc-400">
                Jesteś administratorem? Stwórz nową organizację i zacznij zarządzać bezpieczeństwem.
              </p>
            </div>
            <Button
              onClick={() => navigate("/create-organization")}
              className="mt-auto w-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700"
              size="lg"
            >
              Stwórz organizację
            </Button>
          </div>
        </Card>
      </div>

      {/* Features Section */}
      <div className="max-w-4xl mx-auto">
        <h3 className="mb-8 text-center text-zinc-300">Kluczowe funkcje systemu</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <AlertTriangle className="size-6 text-yellow-400" />
            <h4 className="text-zinc-200">Szybkie zgłaszanie</h4>
            <p className="text-sm text-zinc-400">
              Błyskawiczne zgłaszanie incydentów z dowolnego miejsca
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <Shield className="size-6 text-blue-400" />
            <h4 className="text-zinc-200">Analiza zagrożeń</h4>
            <p className="text-sm text-zinc-400">
              Światowej klasy eksperci, którzy pomogą w analizie zagrożeń
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <Users className="size-6 text-cyan-400" />
            <h4 className="text-zinc-200">Współpraca zespołowa</h4>
            <p className="text-sm text-zinc-400">
              Efektywna wymiana informacji, pomiędzy użytkownikami
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
