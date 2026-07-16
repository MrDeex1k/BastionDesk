import { lazy, Suspense } from "react";
import { Shield, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "./ui/button";

const SettingsDialog = lazy(() =>
  import("./SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);

interface HeaderProps {
  onLogoClick: () => void;
  userRole?: string | null;
  onLoginClick?: () => void;
  onLogout?: () => void;
  onDashboardClick?: () => void;
}

export function Header({
  onLogoClick,
  userRole,
  onLoginClick,
  onLogout,
  onDashboardClick,
}: HeaderProps) {
  const getDashboardName = (role: string) => {
    switch (role) {
      case "admin":
        return "Panel Admina";
      case "analityk":
      case "analyst":
        return "Panel Analityka";
      case "pracownik":
      case "employee":
        return "Panel Pracownika";
      default:
        return "Panel";
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-blue-900/40 bg-zinc-900/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between p-4">
        {/* Logo Section */}
        <button
          type="button"
          onClick={onLogoClick}
          className="z-10 flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <div className="text-left">
            <h1 className="text-lg font-semibold text-blue-300">BastionDesk</h1>
            <p className="text-xs text-zinc-400">Zarządzanie bezpieczeństwem</p>
          </div>
        </button>

        {/* Centered Icon (Decorative) */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <div className="relative">
            <Shield className="size-8 text-blue-400" />
            <div className="absolute inset-0 bg-blue-400/30 blur-xl" />
          </div>
        </div>

        {/* Right Actions */}
        <div className="z-10 flex items-center gap-3">
          {userRole ? (
            <>
              <Button
                variant="outline"
                className="hidden border-blue-500/30 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200 sm:flex"
                onClick={onDashboardClick}
              >
                <LayoutDashboard className="mr-2 size-4" />
                {getDashboardName(userRole)}
              </Button>

              <Suspense fallback={<SettingsButtonFallback />}>
                <SettingsDialog />
              </Suspense>

              <Button
                variant="ghost"
                className="text-zinc-400 hover:bg-white/5 hover:text-white"
                onClick={onLogout}
              >
                <LogOut className="mr-2 size-4" />
                Wyloguj się
              </Button>
            </>
          ) : (
            <Button
              className="bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700"
              onClick={onLoginClick}
            >
              <LogIn className="mr-2 size-4" />
              Zaloguj się
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function SettingsButtonFallback() {
  return (
    <Button variant="ghost" size="icon" disabled className="text-zinc-400 opacity-70">
      <Shield className="size-5" />
      <span className="sr-only">Ładowanie ustawień</span>
    </Button>
  );
}
