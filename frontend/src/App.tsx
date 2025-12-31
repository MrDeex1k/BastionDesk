import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Header } from "./components/Header";
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

const queryClient = new QueryClient();

function AppContent() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = (role: string) => {
    setUserRole(role);
    switch (role) {
      case "admin":
        navigate("/admin-dashboard");
        break;
      case "analyst":
        navigate("/analyst-dashboard");
        break;
      case "employee":
        navigate("/employee-dashboard");
        break;
      default:
        navigate("/");
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    navigate("/");
  };

  const handleDashboardClick = () => {
    if (!userRole) return;
    switch (userRole) {
      case "admin":
        navigate("/admin-dashboard");
        break;
      case "analyst":
        navigate("/analyst-dashboard");
        break;
      case "employee":
        navigate("/employee-dashboard");
        break;
    }
  };

  const handleLogoClick = () => {
    if (userRole) {
      handleDashboardClick();
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-slate-900 via-blue-900 to-slate-800 text-white">
      <Header 
        onLogoClick={handleLogoClick} 
        userRole={userRole}
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
          
          <Route path="/admin-dashboard" element={userRole === "admin" ? <AdminDashboardPage /> : <Navigate to="/" />} />
          <Route path="/analyst-dashboard" element={userRole === "analyst" ? <AnalystDashboardPage /> : <Navigate to="/" />} />
          <Route path="/employee-dashboard" element={userRole === "employee" ? <EmployeeDashboardPage /> : <Navigate to="/" />} />
          
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
        <AppContent />
      </Router>
    </QueryClientProvider>
  );
}