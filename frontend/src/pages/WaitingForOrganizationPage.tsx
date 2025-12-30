import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";

export function WaitingForOrganizationPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 px-4">
      <div className="p-8 rounded-full bg-green-500/10 border border-green-500/20 animate-pulse">
        <ShieldCheck className="size-24 text-green-400" />
      </div>
      
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
          Dziękujemy za rejestrację
        </h1>
        <p className="text-slate-300 text-xl leading-relaxed">
          Teraz dołącz do organizacji, która będzie mogła zarządzać twoim bezpieczeństwem.
        </p>
      </div>

      <div className="pt-8">
        <Button 
          onClick={() => navigate("/")}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          size="lg"
        >
          Wróć do strony głównej
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
