import { QueryClientProvider } from "@tanstack/react-query";
import { RouterBridge } from "@/components/RouterBridge";
import { AuthProvider } from "@/contexts/AuthContext";
import { queryClient } from "@/lib/query-client";

import "./App.css";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterBridge />
      </AuthProvider>
    </QueryClientProvider>
  );
}
