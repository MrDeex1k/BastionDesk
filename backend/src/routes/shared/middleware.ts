import type { NextFunction, Request, Response } from "express";
import { sendErrorResponse } from "../../lib/api-response.js";
import { queryOne } from "../../lib/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";

export const requireRole = (
	requiredRole: "admin" | "analityk" | "pracownik",
) => {
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

export const requireAuth = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const authReq = req as AuthenticatedRequest;
	// Sprawdź czy użytkownik jest zalogowany
	if (!authReq.user) {
		return sendErrorResponse(
			res,
			401,
			"UNAUTHORIZED",
			"Authentication required",
		);
	}
	next();
};

/**
 * Middleware sprawdzający czy użytkownik ma dostęp do konkretnego incydentu
 * Sprawdza czy incydent należy do tej samej organizacji co użytkownik
 */
export const requireOrganizationAccess = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const authReq = req as AuthenticatedRequest;
	const incidentId = req.params.id;

	if (!incidentId) {
		return sendErrorResponse(
			res,
			400,
			"MISSING_INCIDENT_ID",
			"Brak ID incydentu",
		);
	}

	if (!authReq.organizationId) {
		return sendErrorResponse(
			res,
			403,
			"NO_ORGANIZATION",
			"Użytkownik nie należy do żadnej organizacji",
		);
	}

	// Sprawdź czy incydent należy do tej samej organizacji co użytkownik
	queryOne<{ organizationId: string }>(
		`
    SELECT "organizationId" FROM incidents
    WHERE id = $1
  `,
		[incidentId],
	)
		.then((incident) => {
			if (!incident) {
				return sendErrorResponse(
					res,
					404,
					"INCIDENT_NOT_FOUND",
					"Zgłoszenie nie zostało znalezione",
				);
			}

			if (incident.organizationId !== authReq.organizationId) {
				return sendErrorResponse(
					res,
					403,
					"ORGANIZATION_ACCESS_DENIED",
					"Brak dostępu do zgłoszenia z innej organizacji",
				);
			}

			next();
		})
		.catch((error) => {
			console.error("[MIDDLEWARE] Organization access check error:", error);
			sendErrorResponse(
				res,
				500,
				"ORGANIZATION_CHECK_ERROR",
				"Błąd sprawdzania dostępu do organizacji",
			);
		});
};
