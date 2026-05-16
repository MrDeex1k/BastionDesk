import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  type ComponentType,
} from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { signOut } from "./lib/auth-client";
import { Header } from "./components/Header";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Footer } from "./components/Footer";

import "./App.css";

const queryClient = new QueryClient();

const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const LoginPage = lazyPage<{ onLogin: () => void }>(
  () => import("./pages/LoginPage"),
  "LoginPage",
);
const RegisterPage = lazyPage(
  () => import("./pages/RegisterPage"),
  "RegisterPage",
);
const CreateOrganizationPage = lazyPage(
  () => import("./pages/CreateOrganizationPage"),
  "CreateOrganizationPage",
);
const WaitingForOrganizationPage = lazyPage(
  () => import("./pages/WaitingForOrganizationPage"),
  "WaitingForOrganizationPage",
);
const ForgotPasswordPage = lazyPage(
  () => import("./pages/ForgotPasswordPage"),
  "ForgotPasswordPage",
);
const ResetPasswordPage = lazyPage(
  () => import("./pages/ResetPasswordPage"),
  "ResetPasswordPage",
);
const AdminDashboardPage = lazyPage(
  () => import("./pages/AdminDashboardPage"),
  "AdminDashboardPage",
);
const AnalystDashboardPage = lazyPage(
  () => import("./pages/AnalystDashboardPage"),
  "AnalystDashboardPage",
);
const EmployeeDashboardPage = lazyPage(
  () => import("./pages/EmployeeDashboardPage"),
  "EmployeeDashboardPage",
);

function AppContent() {
  const { role, session, isLoading } = useAuth();
  const navigate = useNavigate();

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
          navigate("/");
      }
    }
  }, [session, role, isLoading, navigate]);

  const handleLogout = useCallback(async () => {
    await signOut();
    queryClient.clear();
    toast.success("Wylogowano pomyślnie");
    navigate("/");
  }, [navigate]);

  const handleLogin = useCallback(() => {
    // Przekierowanie jest obsługiwane automatycznie przez useEffect.
  }, []);

  const handleDashboardClick = useCallback(() => {
    if (!role) {
      return;
    }

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
  }, [navigate, role]);

  const handleLogoClick = useCallback(() => {
    if (session) {
      handleDashboardClick();
    } else {
      navigate("/");
    }
  }, [handleDashboardClick, navigate, session]);

  const handleLoginClick = useCallback(() => {
    navigate("/login");
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-zinc-950 via-blue-950 to-zinc-900 text-white">
      <Header
        onLogoClick={handleLogoClick}
        userRole={role}
        onLoginClick={handleLoginClick}
        onLogout={handleLogout}
        onDashboardClick={handleDashboardClick}
      />

      <main className="container mx-auto flex-1 px-4 py-16">
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/create-organization"
              element={<CreateOrganizationPage />}
            />
            <Route
              path="/waiting-for-organization"
              element={<WaitingForOrganizationPage />}
            />
            <Route
              path="/forgot-password"
              element={<ForgotPasswordPage />}
            />
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
        </Suspense>
      </main>

      <Footer />
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

function RouteLoader() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-6 py-4 text-zinc-300 shadow-xl">
        Ładowanie…
      </div>
    </div>
  );
}

function lazyPage<
  TProps = Record<string, never>,
  TModule extends Record<string, unknown> = Record<string, unknown>,
>(
  load: () => Promise<TModule>,
  exportName: keyof TModule,
) {
  return lazy(async () => {
    const module = await load();

    return {
      default: module[exportName] as ComponentType<TProps>,
    };
  });
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
