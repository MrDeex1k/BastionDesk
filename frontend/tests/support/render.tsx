import { afterEach } from "bun:test";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AuthContext, type AuthContextType } from "../../src/contexts/AuthContext";

export const guest: AuthContextType = {
  session: null,
  user: null,
  isLoading: false,
  isPending: false,
  error: null,
  role: null,
  organizationId: null,
  refetch: async () => {},
};
const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});
export function renderApp(ui: ReactElement, auth: Partial<AuthContextType> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  clients.push(queryClient);
  const routeTree = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ ...guest, ...auth }}>{ui}</AuthContext.Provider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return { ...render(<RouterProvider router={router} />), queryClient, user: userEvent.setup() };
}
