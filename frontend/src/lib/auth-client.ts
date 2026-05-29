import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { apiBaseUrl } from "./api";

/**
 * Better Auth Client Configuration
 * 
 * Klient autoryzacji dla aplikacji BastionDesk.
 * Obsługuje:
 * - Email/hasło authentication
 * - Organizacje (multi-tenant)
 * - PassKeys (WebAuthn)
 */
export const authClient = createAuthClient({
  baseURL: apiBaseUrl || window.location.origin,
  
  plugins: [
    organizationClient(),
    passkeyClient(),
  ],

  fetchOptions: {
    onError(error) {
      if (error.error.status === 429) {
        console.error("Too many requests. Please try again later.");
      } else if (error.error.status === 401) {
        console.error("Unauthorized - session may have expired");
      } else {
        console.error("Auth error");
      }
    },
  },
});

/**
 * Wyeksportowane metody autoryzacji
 * 
 * signIn - Logowanie (email/hasło, social, passkey)
 * signUp - Rejestracja nowego użytkownika
 * signOut - Wylogowanie
 * useSession - React hook do pobierania aktualnej sesji
 * organization - Metody zarządzania organizacją
 * passkey - Metody zarządzania PassKeys
 */
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization,
} = authClient;
