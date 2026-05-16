import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";

export function WaitingForOrganizationPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="animate-pulse rounded-full border border-green-500/20 bg-green-500/10 p-8">
        <ShieldCheck className="size-24 text-green-400" />
      </div>

      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100">
          Dziękujemy za rejestrację
        </h1>
        <p className="mt-4 text-xl leading-relaxed text-zinc-300">
          Teraz dołącz do organizacji, która będzie mogła zarządzać twoim bezpieczeństwem.
        </p>
      </div>

      <div className="pt-8">
        <Button
          onClick={() => navigate("/")}
          className="border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          size="lg"
        >
          Wróć do strony głównej
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
