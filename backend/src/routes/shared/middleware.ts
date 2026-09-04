import type { NextFunction, Request, Response } from "express";
import { sendErrorResponse } from "../../lib/api-response.js";
import { queryOne } from "../../lib/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";

type IncidentOrganizationLookup = (
	sql: string,
	params?: unknown[],
) => Promise<{ id: string } | null>;

export const requireRole = (requiredRole: "admin" | "analityk" | "pracownik") => {
	return (req: Request, res: Response, next: NextFunction) => {
		const authReq = req as AuthenticatedRequest;

		// Sprawdź czy użytkownik należy do organizacji
		if (!authReq.organizationId) {
			return sendErrorResponse(
				res,
				403,
				"NO_ORGANIZATION",
				"Użytkownik nie należy do żadnej organizacji",
			);
		}

		// Sprawdź rolę użytkownika
		const userRole = authReq.memberRole;
		if (!userRole || userRole !== requiredRole) {
			return sendErrorResponse(
				res,
				403,
				"INSUFFICIENT_PERMISSIONS",
				"Niewystarczające uprawnienia",
			);
		}

		next();
	};
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
	const authReq = req as AuthenticatedRequest;
	// Sprawdź czy użytkownik jest zalogowany
	if (!authReq.user) {
		return sendErrorResponse(res, 401, "UNAUTHORIZED", "Authentication required");
	}
	next();
};

/**
 * Middleware sprawdzający czy użytkownik ma dostęp do konkretnego incydentu
 * Sprawdza czy incydent należy do tej samej organizacji co użytkownik
 */
export function createRequireOrganizationAccess(
	findIncident: IncidentOrganizationLookup = (sql, params) =>
		queryOne<{ id: string }>(sql, params),
) {
	return async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
		const authReq = req as AuthenticatedRequest;
		const incidentId = req.params.id;

		if (!incidentId) {
			return sendErrorResponse(res, 400, "MISSING_INCIDENT_ID", "Brak ID incydentu");
		}

		if (!authReq.organizationId) {
			return sendErrorResponse(
				res,
				403,
				"NO_ORGANIZATION",
				"Użytkownik nie należy do żadnej organizacji",
			);
		}

		try {
			// Tenant scope jest częścią zapytania, więc nie ujawniamy, czy ID istnieje
			// w innej organizacji.
			const incident = await findIncident(
				`
				SELECT id FROM incidents
				WHERE id = $1 AND "organizationId" = $2
			`,
				[incidentId, authReq.organizationId],
			);

			if (!incident) {
				return sendErrorResponse(
					res,
					404,
					"INCIDENT_NOT_FOUND",
					"Zgłoszenie nie zostało znalezione",
				);
			}

			next();
		} catch (error) {
			console.error("[MIDDLEWARE] Organization access check error:", error);
			return sendErrorResponse(
				res,
				500,
				"ORGANIZATION_CHECK_ERROR",
				"Błąd sprawdzania dostępu do organizacji",
			);
		}
	};
}

export const requireOrganizationAccess = createRequireOrganizationAccess();
