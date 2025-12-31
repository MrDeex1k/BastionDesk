import { Shield, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "./ui/button";
import { SettingsDialog } from "./SettingsDialog";

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
  onDashboardClick 
}: HeaderProps) {
  
  const getDashboardName = (role: string) => {
    switch (role) {
      case 'admin': return 'Panel Admina';
      case 'analityk': 
      case 'analyst': return 'Panel Analityka';
      case 'pracownik':
      case 'employee': return 'Panel Pracownika';
      default: return 'Panel';
    }
  };

  return (
    <header className="border-b border-blue-900/50 backdrop-blur-sm bg-slate-900/80 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo Section */}
        <button 
          onClick={onLogoClick}
          className="hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-2 z-10"
        >
          <div className="text-left">
            <h1 className="text-blue-400 font-bold text-lg">BastionDesk</h1>
            <p className="text-xs text-slate-400">
              Zarządzanie bezpieczeństwem
            </p>
          </div>
        </button>
        
        {/* Centered Icon (Decorative) */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="relative">
            <Shield className="size-8 text-blue-400" />
            <div className="absolute inset-0 blur-xl bg-blue-400/30"></div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 z-10">
          {userRole ? (
            <>
              <Button 
                variant="outline" 
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 hidden sm:flex"
                onClick={onDashboardClick}
              >
                <LayoutDashboard className="size-4 mr-2" />
                {getDashboardName(userRole)}
              </Button>
              
              <SettingsDialog />
              
              <Button 
                variant="ghost" 
                className="text-slate-400 hover:text-white hover:bg-white/5"
                onClick={onLogout}
              >
                <LogOut className="size-4 mr-2" />
                Wyloguj się
              </Button>
            </>
          ) : (
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
              onClick={onLoginClick}
            >
              <LogIn className="size-4 mr-2" />
              Zaloguj się
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
