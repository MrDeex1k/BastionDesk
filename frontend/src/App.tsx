import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { signOut } from "./lib/auth-client";
import { Header } from "./components/Header";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AnalystDashboardPage } from "./pages/AnalystDashboardPage";
import { EmployeeDashboardPage } from "./pages/EmployeeDashboardPage";
import { RegisterPage } from "./pages/RegisterPage";
import { WaitingForOrganizationPage } from "./pages/WaitingForOrganizationPage";
import { CreateOrganizationPage } from "./pages/CreateOrganizationPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { InviteRegistrationPage } from "./pages/InviteRegistrationPage";

const queryClient = new QueryClient();

function AppContent() {
  const { role, session } = useAuth();
  const navigate = useNavigate();

  /**
   * Przekierowanie użytkownika do odpowiedniego dashboardu po zalogowaniu
   * Better-Auth automatycznie zarządza sesją, więc nie potrzebujemy setUserRole
   */
  const handleLogin = (userRole: string) => {
    // Normalizacja roli
    const normalizedRole = userRole === "analyst" ? "analityk" : userRole;
    
    switch (normalizedRole) {
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
  };

  /**
   * Wylogowanie użytkownika przez Better-Auth
   */
  const handleLogout = async () => {
    await signOut();
    toast.success("Wylogowano pomyślnie");
    navigate("/");
  };

  /**
   * Przekierowanie do dashboardu na podstawie aktualnej roli
   */
  const handleDashboardClick = () => {
    if (!role) return;
    
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
    }
  };

  /**
   * Kliknięcie w logo - przekierowanie do home lub dashboardu
   */
  const handleLogoClick = () => {
    if (session) {
      handleDashboardClick();
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-slate-900 via-blue-900 to-slate-800 text-white">
      <Header 
        onLogoClick={handleLogoClick} 
        userRole={role}
        onLoginClick={() => navigate("/login")}
        onLogout={handleLogout}
        onDashboardClick={handleDashboardClick}
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16 flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/create-organization" element={<CreateOrganizationPage />} />
          <Route path="/waiting-for-organization" element={<WaitingForOrganizationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation/:invitationId" element={<InviteRegistrationPage />} />
          
          <Route 
            path="/admin-dashboard" 
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/analyst-dashboard" 
            element={
              <ProtectedRoute allowedRoles={["analityk"]}>
                <AnalystDashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/employee-dashboard" 
            element={
              <ProtectedRoute allowedRoles={["pracownik"]}>
                <EmployeeDashboardPage />
              </ProtectedRoute>
            } 
          />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <Footer />
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}