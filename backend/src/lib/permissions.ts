/**
 * Access Control Configuration
 *
 * Definicja uprawnień i ról dla organizacji
 * zgodna z Better-Auth i schematem bazy danych (02-create-auth.sql)
 */

import { createAccessControl } from "better-auth/plugins/access";

// =============================================================================
// Access Control Statement
// Definiuje zasoby i możliwe akcje
// =============================================================================
const statement = {
	// Organizacja
	organization: ["create", "read", "update", "delete"],
	// Członkowie
	member: ["create", "read", "update", "delete"],
	// Zespoły
	team: ["create", "read", "update", "delete"],
	// Raporty
	reports: ["create", "read", "update", "delete"],
	// Analityka
	analytics: ["create", "read", "update", "delete"],
	// Zgłoszenia/Incydenty
	incident: ["create", "read", "update", "delete", "analyze"],
} as const;

// =============================================================================
// Access Controller
// =============================================================================
export const ac = createAccessControl(statement);

// =============================================================================
// Role Definitions
// Zgodne ze schematem bazy danych: admin, analityk, pracownik
// =============================================================================

/**
 * Admin (Właściciel) - pełne uprawnienia
 */
export const admin = ac.newRole({
	organization: ["create", "read", "update", "delete"],
	member: ["create", "read", "update", "delete"],
	team: ["create", "read", "update", "delete"],
	reports: ["create", "read", "update", "delete"],
	analytics: ["create", "read", "update", "delete"],
	incident: ["create", "read", "update", "delete", "analyze"],
});

/**
 * Analityk - dostęp do raportów i analityk
 */
export const analityk = ac.newRole({
	organization: ["read"],
	member: ["read"],
	team: ["read"],
	reports: ["create", "read", "update", "delete"],
	analytics: ["create", "read", "update"],
	incident: ["read", "update", "analyze"],
});

/**
 * Pracownik - podstawowy dostęp (tylko odczyt)
 */
export const pracownik = ac.newRole({
	organization: ["read"],
	member: ["read"],
	team: ["read"],
	incident: ["create", "read"],
});

// Eksport typów
export type Statement = typeof statement;
export type AccessControl = typeof ac;
