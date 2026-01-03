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
import { useEffect } from "react";

import './App.css'

const queryClient = new QueryClient();

function AppContent() {
  const { role, session, isLoading } = useAuth();
  const navigate = useNavigate();

  /**
   * Przekierowanie użytkownika do odpowiedniego dashboardu po zalogowaniu
   * Czekamy aż sesja będzie dostępna i rola zostanie pobrana
   */
  useEffect(() => {
    if (session && role && !isLoading) {
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
          // Jeśli rola nie jest rozpoznana, przekieruj na stronę główną
          navigate("/");
      }
    }
  }, [session, role, isLoading, navigate]);

  /**
   * Wylogowanie użytkownika przez Better-Auth
   */
  const handleLogout = async () => {
    await signOut();
    toast.success("Wylogowano pomyślnie");
    navigate("/");
  };

  /**
   * Callback po pomyślnym zalogowaniu
   * Logika przekierowania jest obsługiwana przez useEffect, który monitoruje sesję i rolę
   */
  const handleLogin = () => {
    // Przekierowanie jest obsługiwane automatycznie przez useEffect
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