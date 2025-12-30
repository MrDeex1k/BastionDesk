import {
  Shield,
  Users,
  Building2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <>
      <div className="max-w-4xl mx-auto text-center mb-16">
        <h2 className="text-5xl mb-6 bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent">
          Witaj w BastionDesk
        </h2>

        <p className="text-xl text-slate-300 mb-4">
          Profesjonalny system zgłaszania i zarządzania
          incydentami bezpieczeństwa
        </p>

        <p className="text-slate-400 max-w-2xl mx-auto">
          Chronimy Twoją organizację poprzez szybkie
          reagowanie na zagrożenia. Zgłaszaj incydenty,
          śledź postępy i współpracuj z zespołem
          bezpieczeństwa w czasie rzeczywistym.
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
        <Card className="bg-gradient-to-br from-slate-800/90 to-slate-700/90 border-blue-900/50 hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 p-6">
          <div className="flex flex-col items-center text-center gap-4 h-full">
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <Lock className="size-8 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl mb-2 text-blue-300">
                Zaloguj się
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Masz już konto? Zaloguj się i uzyskaj
                dostęp do swojego panelu.
              </p>
            </div>
            <Button
              onClick={() => navigate("/login")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 mt-auto"
              size="lg"
            >
              Zaloguj się
            </Button>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-slate-800/90 to-slate-700/90 border-cyan-900/50 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/10 p-6">
          <div className="flex flex-col items-center text-center gap-4 h-full">
            <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
              <Users className="size-8 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-xl mb-2 text-cyan-300">
                Dołącz do nas
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Stwórz konto, a następnie dołącz do
                organizacji
              </p>
            </div>
            <Button
              onClick={() => navigate("/register")}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg shadow-cyan-500/20 mt-auto"
              size="lg"
            >
              Dołącz do nas
            </Button>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-slate-800/90 to-slate-700/90 border-purple-900/50 hover:border-purple-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 p-6">
          <div className="flex flex-col items-center text-center gap-4 h-full">
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
              <Building2 className="size-8 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl mb-2 text-purple-300">
                Stwórz organizację
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Jesteś administratorem? Stwórz nową
                organizację i zacznij zarządzać
                bezpieczeństwem.
              </p>
            </div>
            <Button
              onClick={() => navigate("/create-organization")}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 mt-auto"
              size="lg"
            >
              Stwórz organizację
            </Button>
          </div>
        </Card>
      </div>

      {/* Features Section */}
      <div className="max-w-4xl mx-auto">
        <h3 className="text-center mb-8 text-slate-300">
          Kluczowe funkcje systemu
        </h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center text-center gap-3 p-6 rounded-xl bg-slate-800/50 border border-slate-800">
            <AlertTriangle className="size-6 text-yellow-400" />
            <h4 className="text-slate-200">
              Szybkie zgłaszanie
            </h4>
            <p className="text-sm text-slate-400">
              Błyskawiczne zgłaszanie incydentów z
              dowolnego miejsca
            </p>
          </div>

          <div className="flex flex-col items-center text-center gap-3 p-6 rounded-xl bg-slate-800/50 border border-slate-800">
            <Shield className="size-6 text-blue-400" />
            <h4 className="text-slate-200">
              Analiza zagrożeń
            </h4>
            <p className="text-sm text-slate-400">
              Światowej klasy eksperci, którzy pomogą w
              analizie zagrożeń
            </p>
          </div>

          <div className="flex flex-col items-center text-center gap-3 p-6 rounded-xl bg-slate-800/50 border border-slate-800">
            <Users className="size-6 text-cyan-400" />
            <h4 className="text-slate-200">
              Współpraca zespołowa
            </h4>
            <p className="text-sm text-slate-400">
              Efektywna wymiana informacji, pomiędzy
              użytkownikami
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
