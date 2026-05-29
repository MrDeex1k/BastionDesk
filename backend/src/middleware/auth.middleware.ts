//Middleware do weryfikacji sesji i ról użytkowników

import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { sendErrorResponse } from "../lib/api-response";
import { auth } from "../lib/auth";
import type { UserRole } from "../types";

// Types

export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
	emailVerified: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface AuthenticatedSession {
	id: string;
	userId: string;
	token: string;
	expiresAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
}

export interface AuthenticatedRequest extends Request {
	user: AuthenticatedUser;
	session: AuthenticatedSession;
	organizationId?: string;
	memberRole?: UserRole;
}

export function getRequiredOrganizationId(
	req: AuthenticatedRequest,
	res: Response,
): string | null {
	if (req.organizationId) {
		return req.organizationId;
	}

	sendErrorResponse(
		res,
		403,
		"NO_ORGANIZATION",
		"Użytkownik nie należy do żadnej organizacji",
	);
	return null;
}

// Session Helper

/**
 * Pobierz sesję użytkownika z requestu
 */
export async function getSessionFromRequest(req: Request) {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		return session;
	} catch (_error) {
		console.error("[AUTH] Failed to get session");
		return null;
	}
}

// Authentication Middleware

/**
 * Middleware wymagający zalogowanego użytkownika
 * Dodaje `req.user` i `req.session` do requestu
 */
export function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	getSessionFromRequest(req)
		.then((sessionData) => {
			if (!sessionData?.session || !sessionData?.user) {
				sendErrorResponse(res, 401, "UNAUTHORIZED", "Wymagane zalogowanie");
				return;
			}

			// Dodaj dane użytkownika i sesji do requestu
			(req as AuthenticatedRequest).user =
				sessionData.user as AuthenticatedUser;
			(req as AuthenticatedRequest).session =
				sessionData.session as AuthenticatedSession;

			next();
		})
		.catch((_error) => {
			console.error("[AUTH] Authentication error");
			sendErrorResponse(res, 500, "AUTH_ERROR", "Błąd autoryzacji");
		});
}

/**
 * Middleware opcjonalnie pobierający sesję (nie wymaga zalogowania)
 * Jeśli użytkownik jest zalogowany, dodaje `req.user` i `req.session`
 */
export function optionalAuth(
	req: Request,
	_res: Response,
	next: NextFunction,
): void {
	getSessionFromRequest(req)
		.then((sessionData) => {
			if (sessionData?.session && sessionData?.user) {
				(req as AuthenticatedRequest).user =
					sessionData.user as AuthenticatedUser;
				(req as AuthenticatedRequest).session =
					sessionData.session as AuthenticatedSession;
			}
			next();
		})
		.catch((_error) => {
			console.error("[AUTH] Optional auth error");
			// Kontynuuj bez sesji w przypadku błędu
			next();
		});
}

// Role-based Authorization Middleware

/**
 * Middleware wymagający określonej roli użytkownika
 * Musi być użyty PO `requireAuth`
 *
 * @param allowedRoles - tablica dozwolonych ról
 *
 * @example
 * router.get('/admin', requireAuth, requireRole(['admin']), handler)
 * router.get('/reports', requireAuth, requireRole(['admin', 'analityk']), handler)
 */
export function requireRole(allowedRoles: UserRole[]) {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		const authReq = req as AuthenticatedRequest;

		if (!authReq.user) {
			sendErrorResponse(res, 401, "UNAUTHORIZED", "Wymagane zalogowanie");
			return;
		}

		try {
			// Pobierz aktywną organizację i rolę użytkownika
			const activeMember = await auth.api.getFullOrganization({
				headers: fromNodeHeaders(req.headers),
			});

			if (!activeMember) {
				sendErrorResponse(
					res,
					403,
					"NO_ORGANIZATION",
					"Użytkownik nie należy do żadnej organizacji",
				);
				return;
			}

			// Znajdź członkostwo użytkownika w aktywnej organizacji
			const membership = activeMember.members?.find(
				(m: { userId: string }) => m.userId === authReq.user.id,
			);

			if (!membership) {
				sendErrorResponse(
					res,
					403,
					"NOT_A_MEMBER",
					"Użytkownik nie jest członkiem tej organizacji",
				);
				return;
			}

			const userRole = membership.role as UserRole;

			// Sprawdź czy rola użytkownika jest dozwolona
			if (!allowedRoles.includes(userRole)) {
				sendErrorResponse(
					res,
					403,
					"FORBIDDEN",
					`Wymagana rola: ${allowedRoles.join(" lub ")}`,
				);
				return;
			}

			// Dodaj informacje o organizacji i roli do requestu
			authReq.organizationId = activeMember.id;
			authReq.memberRole = userRole;

			next();
		} catch (error) {
			console.error("[AUTH] Role check error:", error);
			sendErrorResponse(
				res,
				500,
				"ROLE_CHECK_ERROR",
				"Błąd sprawdzania uprawnień",
			);
		}
	};
}

/**
 * Middleware wymagający przynależności do organizacji
 * Nie sprawdza konkretnej roli, tylko czy użytkownik należy do jakiejś organizacji
 */
export function requireOrganization(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const authReq = req as AuthenticatedRequest;

	if (!authReq.user) {
		res.status(401).json({
			success: false,
			error: {
				code: "UNAUTHORIZED",
				message: "Wymagane zalogowanie",
			},
		});
		return;
	}

	auth.api
		.getFullOrganization({
			headers: fromNodeHeaders(req.headers),
		})
		.then((org) => {
			if (!org) {
				res.status(403).json({
					success: false,
					error: {
						code: "NO_ORGANIZATION",
						message: "Wymagana przynależność do organizacji",
					},
				});
				return;
			}

			authReq.organizationId = org.id;
			next();
		})
		.catch((error) => {
			console.error("[AUTH] Organization check error:", error);
			res.status(500).json({
				success: false,
				error: {
					code: "ORG_CHECK_ERROR",
					message: "Błąd sprawdzania organizacji",
				},
			});
		});
}

// Utility Middleware

/**
 * Middleware sprawdzający czy użytkownik jest właścicielem zasobu
 * @param getResourceOwnerId - funkcja zwracająca ID właściciela zasobu
 */
export function requireOwnership(
	getResourceOwnerId: (req: Request) => Promise<string | null>,
) {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		const authReq = req as AuthenticatedRequest;

		if (!authReq.user) {
			res.status(401).json({
				success: false,
				error: {
					code: "UNAUTHORIZED",
					message: "Wymagane zalogowanie",
				},
			});
			return;
		}

		try {
			const ownerId = await getResourceOwnerId(req);

			if (!ownerId) {
				res.status(404).json({
					success: false,
					error: {
						code: "NOT_FOUND",
						message: "Zasób nie został znaleziony",
					},
				});
				return;
			}

			// Admin może dostęp do wszystkiego
			if (authReq.memberRole === "admin") {
				next();
				return;
			}

			// Sprawdź właścicielstwo
			if (ownerId !== authReq.user.id) {
				res.status(403).json({
					success: false,
					error: {
						code: "FORBIDDEN",
						message: "Brak dostępu do tego zasobu",
					},
				});
				return;
			}

			next();
		} catch (error) {
			console.error("[AUTH] Ownership check error:", error);
			res.status(500).json({
				success: false,
				error: {
					code: "OWNERSHIP_CHECK_ERROR",
					message: "Błąd sprawdzania właścicielstwa",
				},
			});
		}
	};
}
